use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, RwLock};

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::managers::settings_manager::SettingsManager;
use crate::managers::worktree_manager::WorktreeManager;
use crate::models::{
    CreateSessionRequest, ProviderSettings, ProviderType, Session, SessionStatus, StreamChunk,
};
use crate::providers::{ClaudeAdapter, KimiAdapter, ProviderAdapter};

struct SessionEntry {
    session: Session,
    adapter: Option<Arc<tokio::sync::Mutex<Box<dyn ProviderAdapter>>>>,
}

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
    db: Arc<Database>,
    app_handle: AppHandle,
    settings_manager: Arc<SettingsManager>,
}

impl SessionManager {
    pub fn new(
        app_handle: AppHandle,
        settings_manager: Arc<SettingsManager>,
        db: Arc<Database>,
    ) -> Self {
        // Load persisted sessions from DB on startup
        let mut initial_sessions = HashMap::new();
        match db.load_sessions() {
            Ok(mut sessions) => {
                for session in &mut sessions {
                    // Mark previously-active sessions as terminated (adapters are gone after restart)
                    if session.status == SessionStatus::Active
                        || session.status == SessionStatus::Creating
                    {
                        session.status = SessionStatus::Terminated;
                        let _ =
                            db.update_session_status(&session.id, &SessionStatus::Terminated);
                    }
                    initial_sessions.insert(
                        session.id.clone(),
                        SessionEntry {
                            session: session.clone(),
                            adapter: None,
                        },
                    );
                }
                println!(
                    "[SessionManager] Loaded {} sessions from database",
                    initial_sessions.len()
                );
            }
            Err(e) => {
                eprintln!(
                    "[SessionManager] Failed to load sessions from database: {}",
                    e
                );
            }
        }

        Self {
            sessions: Arc::new(RwLock::new(initial_sessions)),
            db,
            app_handle,
            settings_manager,
        }
    }

    /// Get a reference to the database
    pub fn database(&self) -> &Arc<Database> {
        &self.db
    }

    /// Create a new session
    pub async fn create_session(&self, request: CreateSessionRequest) -> AppResult<Session> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let project_path = PathBuf::from(&request.project_path);

        // Determine worktree path and branch name based on use_local flag
        let (worktree_path, branch_name) = if request.use_local {
            // Use local mode: no worktree, use project path directly
            let branch_name = WorktreeManager::get_current_branch(&project_path)
                .unwrap_or_else(|_| "HEAD".to_string());
            (project_path.clone(), branch_name)
        } else {
            // Validate project path is a git repository before creating worktree
            if !WorktreeManager::is_git_repo(&project_path) {
                return Err(AppError::InvalidOperation(format!(
                    "Path '{}' is not a git repository",
                    request.project_path
                )));
            }
            // Create worktree
            WorktreeManager::create_worktree(
                &project_path,
                &session_id,
                request.base_branch.as_deref(),
            )?
        };

        // Create session
        let session = Session {
            id: session_id.clone(),
            name: request.name,
            provider: request.provider.clone(),
            status: SessionStatus::Creating,
            worktree_path: worktree_path.to_string_lossy().to_string(),
            branch_name,
            created_at: Utc::now(),
            project_path: request.project_path,
            is_local: request.use_local,
        };

        // Create provider adapter with settings
        let provider_settings = self.settings_manager.get_provider_settings(&request.provider);
        let mut adapter: Box<dyn ProviderAdapter> = match &request.provider {
            ProviderType::Claude => {
                if let Some(ProviderSettings::Claude(settings)) = provider_settings {
                    Box::new(ClaudeAdapter::with_settings(&settings))
                } else {
                    Box::new(ClaudeAdapter::new())
                }
            }
            ProviderType::Kimi => {
                if let Some(ProviderSettings::Kimi(settings)) = provider_settings {
                    Box::new(KimiAdapter::with_settings(&settings))
                } else {
                    Box::new(KimiAdapter::new())
                }
            }
        };

        // Create channel for streaming
        let (tx, mut rx) = mpsc::channel::<StreamChunk>(100);

        // Forward stream chunks to frontend via Tauri events
        let app_handle = self.app_handle.clone();
        let session_id_for_log = session_id.clone();
        tokio::spawn(async move {
            println!("[SessionManager] Starting stream forwarder for session {}", session_id_for_log);
            while let Some(chunk) = rx.recv().await {
                println!("[SessionManager] Forwarding stream chunk: session={}, message_id={}, is_complete={}",
                    chunk.session_id, chunk.message_id, chunk.is_complete);
                if let Err(e) = app_handle.emit("stream-chunk", &chunk) {
                    eprintln!("[SessionManager] Failed to emit stream-chunk event: {}", e);
                }
            }
            println!("[SessionManager] Stream forwarder ended for session {}", session_id_for_log);
        });

        // Start the session
        adapter
            .start_session(&session_id, &worktree_path, tx, self.app_handle.clone())
            .await?;

        // Update session status
        let mut session = session;
        session.status = SessionStatus::Active;

        // Store session in memory
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(
                session_id.clone(),
                SessionEntry {
                    session: session.clone(),
                    adapter: Some(Arc::new(tokio::sync::Mutex::new(adapter))),
                },
            );
        }

        // Persist to database
        if let Err(e) = self.db.save_session(&session) {
            eprintln!("[SessionManager] Failed to persist session to database: {}", e);
        }

        Ok(session)
    }

    /// List all sessions
    pub async fn list_sessions(&self) -> Vec<Session> {
        let sessions = self.sessions.read().await;
        sessions.values().map(|e| e.session.clone()).collect()
    }

    /// Get a session by ID
    pub async fn get_session(&self, session_id: &str) -> AppResult<Session> {
        let sessions = self.sessions.read().await;
        sessions
            .get(session_id)
            .map(|e| e.session.clone())
            .ok_or_else(|| AppError::NotFound(format!("Session '{}' not found", session_id)))
    }

    /// Send a message to a session
    pub async fn send_message(&self, session_id: &str, message: &str) -> AppResult<()> {
        // Get adapter clone
        let adapter = {
            let sessions = self.sessions.read().await;
            sessions.get(session_id).and_then(|e| e.adapter.clone())
        };

        if let Some(adapter) = adapter {
            let mut adapter = adapter.lock().await;
            adapter.send_message(message).await?;
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Session '{}' not found or not active",
                session_id
            )))
        }
    }

    /// Terminate a session
    pub async fn terminate_session(
        &self,
        session_id: &str,
        cleanup_worktree: bool,
    ) -> AppResult<()> {
        // Get the entry and update its status in memory
        let entry_data = {
            let mut sessions = self.sessions.write().await;
            if let Some(entry) = sessions.get_mut(session_id) {
                let session = entry.session.clone();
                let adapter = entry.adapter.take();
                entry.session.status = SessionStatus::Terminated;
                Some((session, adapter))
            } else {
                None
            }
        };

        if let Some((session, adapter)) = entry_data {
            // Terminate the adapter if it exists
            if let Some(adapter) = adapter {
                let mut adapter = adapter.lock().await;
                adapter.terminate().await?;
            }

            // Update status in database
            if let Err(e) =
                self.db
                    .update_session_status(session_id, &SessionStatus::Terminated)
            {
                eprintln!(
                    "[SessionManager] Failed to update session status in DB: {}",
                    e
                );
            }

            // Cleanup worktree if requested and not a local session
            if cleanup_worktree && !session.is_local {
                let project_path = PathBuf::from(&session.project_path);
                WorktreeManager::remove_worktree(&project_path, session_id)?;

                // Also remove from DB and memory entirely
                if let Err(e) = self.db.delete_session(session_id) {
                    eprintln!(
                        "[SessionManager] Failed to delete session from DB: {}",
                        e
                    );
                }
                let mut sessions = self.sessions.write().await;
                sessions.remove(session_id);
            }

            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Session '{}' not found",
                session_id
            )))
        }
    }

    /// Merge session changes to a branch
    pub async fn merge_session(&self, session_id: &str, target_branch: &str) -> AppResult<()> {
        let session = self.get_session(session_id).await?;
        let project_path = PathBuf::from(&session.project_path);

        WorktreeManager::merge_to_branch(&project_path, session_id, target_branch)
    }

    /// Rename a session
    pub async fn rename_session(&self, session_id: &str, new_name: &str) -> AppResult<Session> {
        let mut sessions = self.sessions.write().await;
        if let Some(entry) = sessions.get_mut(session_id) {
            entry.session.name = new_name.to_string();

            // Persist name change to database
            if let Err(e) = self.db.update_session_name(session_id, new_name) {
                eprintln!(
                    "[SessionManager] Failed to update session name in DB: {}",
                    e
                );
            }

            Ok(entry.session.clone())
        } else {
            Err(AppError::NotFound(format!(
                "Session '{}' not found",
                session_id
            )))
        }
    }

    /// Send interaction response (for prompts like "Press Enter to continue")
    pub async fn send_interaction_response(
        &self,
        session_id: &str,
        response: &str,
    ) -> AppResult<()> {
        let adapter = {
            let sessions = self.sessions.read().await;
            sessions.get(session_id).and_then(|e| e.adapter.clone())
        };

        if let Some(adapter) = adapter {
            let mut adapter = adapter.lock().await;
            adapter.send_message(response).await?;
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Session '{}' not found or not active",
                session_id
            )))
        }
    }
}
