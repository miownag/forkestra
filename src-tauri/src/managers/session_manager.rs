use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, RwLock};

use crate::error::{AppError, AppResult};
use crate::managers::worktree_manager::WorktreeManager;
use crate::models::{CreateSessionRequest, ProviderType, Session, SessionStatus, StreamChunk};
use crate::providers::{ClaudeAdapter, KimiAdapter, ProviderAdapter};

struct SessionEntry {
    session: Session,
    adapter: Arc<tokio::sync::Mutex<Box<dyn ProviderAdapter>>>,
}

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
    app_handle: AppHandle,
}

impl SessionManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    /// Create a new session
    pub async fn create_session(&self, request: CreateSessionRequest) -> AppResult<Session> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let project_path = PathBuf::from(&request.project_path);

        // Validate project path is a git repository
        if !WorktreeManager::is_git_repo(&project_path) {
            return Err(AppError::InvalidOperation(format!(
                "Path '{}' is not a git repository",
                request.project_path
            )));
        }

        // Create worktree
        let (worktree_path, branch_name) = WorktreeManager::create_worktree(
            &project_path,
            &session_id,
            request.base_branch.as_deref(),
        )?;

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
        };

        // Create provider adapter
        let mut adapter: Box<dyn ProviderAdapter> = match request.provider {
            ProviderType::Claude => Box::new(ClaudeAdapter::new()),
            ProviderType::Kimi => Box::new(KimiAdapter::new()),
        };

        // Create channel for streaming
        let (tx, mut rx) = mpsc::channel::<StreamChunk>(100);

        // Forward stream chunks to frontend via Tauri events
        let app_handle = self.app_handle.clone();
        tokio::spawn(async move {
            while let Some(chunk) = rx.recv().await {
                let _ = app_handle.emit("stream-chunk", &chunk);
            }
        });

        // Start the session
        adapter
            .start_session(&session_id, &worktree_path, tx)
            .await?;

        // Update session status
        let mut session = session;
        session.status = SessionStatus::Active;

        // Store session
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(
                session_id.clone(),
                SessionEntry {
                    session: session.clone(),
                    adapter: Arc::new(tokio::sync::Mutex::new(adapter)),
                },
            );
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
            sessions.get(session_id).map(|e| e.adapter.clone())
        };

        if let Some(adapter) = adapter {
            let mut adapter = adapter.lock().await;
            adapter.send_message(message).await?;
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Session '{}' not found",
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
        // Remove entry
        let entry = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(session_id)
        };

        if let Some(entry) = entry {
            // Terminate the adapter
            {
                let mut adapter = entry.adapter.lock().await;
                adapter.terminate().await?;
            }

            // Cleanup worktree if requested
            if cleanup_worktree {
                let project_path = PathBuf::from(&entry.session.project_path);
                WorktreeManager::remove_worktree(&project_path, session_id)?;
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
}
