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
    AvailableCommand, CreateSessionRequest, ProviderSettings, ProviderType, Session, SessionStatus,
    SessionStatusEvent, StreamChunk,
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
                    // Mark previously-active sessions as paused (adapters are gone after restart, but sessions are resumable)
                    if session.status == SessionStatus::Active
                        || session.status == SessionStatus::Creating
                    {
                        session.status = SessionStatus::Paused;
                        let _ =
                            db.update_session_status(&session.id, &SessionStatus::Paused);
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

    /// Create a new session (two-phase: sync worktree creation + async ACP connection)
    pub async fn create_session(&self, request: CreateSessionRequest) -> AppResult<Session> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let project_path = PathBuf::from(&request.project_path);

        // Phase 1 (sync): Create worktree and session object

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

        // Create session with status=Creating (branch_name is already populated)
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
            acp_session_id: None,
            model: None,
            available_models: vec![],
            available_commands: vec![],
        };

        // Store session in memory
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(
                session_id.clone(),
                SessionEntry {
                    session: session.clone(),
                    adapter: None,
                },
            );
        }

        // Persist to database
        if let Err(e) = self.db.save_session(&session) {
            eprintln!("[SessionManager] Failed to persist session to database: {}", e);
        }

        // Phase 2 (async): Spawn ACP connection in background
        self.spawn_acp_connection(session_id, worktree_path, request.provider);

        Ok(session)
    }

    /// Spawn a background task to establish the ACP connection for a creating session
    fn spawn_acp_connection(
        &self,
        session_id: String,
        worktree_path: PathBuf,
        provider: ProviderType,
    ) {
        let sessions = self.sessions.clone();
        let db = self.db.clone();
        let app_handle = self.app_handle.clone();
        let settings_manager = self.settings_manager.clone();

        tokio::spawn(async move {
            // Yield to ensure the command response reaches the frontend first
            tokio::task::yield_now().await;

            // Create provider adapter with settings
            let provider_settings = settings_manager.get_provider_settings(&provider);
            let mut adapter: Box<dyn ProviderAdapter> = match &provider {
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
            let app_handle_for_stream = app_handle.clone();
            let session_id_for_log = session_id.clone();
            tokio::spawn(async move {
                println!("[SessionManager] Starting stream forwarder for session {}", session_id_for_log);
                while let Some(chunk) = rx.recv().await {
                    println!("[SessionManager] Forwarding stream chunk: session={}, message_id={}, is_complete={}",
                        chunk.session_id, chunk.message_id, chunk.is_complete);
                    if let Err(e) = app_handle_for_stream.emit("stream-chunk", &chunk) {
                        eprintln!("[SessionManager] Failed to emit stream-chunk event: {}", e);
                    }
                }
                println!("[SessionManager] Stream forwarder ended for session {}", session_id_for_log);
            });

            // Start the ACP session
            let result = adapter
                .start_session(&session_id, &worktree_path, tx, app_handle.clone())
                .await;

            match result {
                Ok(()) => {
                    // Check session still exists and is in Creating state
                    let mut sessions_guard = sessions.write().await;
                    if let Some(entry) = sessions_guard.get_mut(&session_id) {
                        if entry.session.status != SessionStatus::Creating {
                            println!(
                                "[SessionManager] Session {} is no longer in Creating state, skipping activation",
                                session_id
                            );
                            return;
                        }

                        // Update session to Active
                        entry.session.status = SessionStatus::Active;
                        entry.session.acp_session_id =
                            adapter.acp_session_id().map(|s| s.to_string());
                        entry.session.available_models = adapter.available_models();
                        entry.session.model =
                            adapter.current_model_id().map(|s| s.to_string());
                        entry.adapter = Some(Arc::new(tokio::sync::Mutex::new(adapter)));

                        let updated_session = entry.session.clone();

                        // Persist to database
                        if let Err(e) = db.save_session(&updated_session) {
                            eprintln!(
                                "[SessionManager] Failed to persist active session to database: {}",
                                e
                            );
                        }

                        // Emit status event to frontend
                        let event = SessionStatusEvent {
                            session_id: session_id.clone(),
                            status: SessionStatus::Active,
                            session: Some(updated_session),
                            error: None,
                        };
                        if let Err(e) = app_handle.emit("session-status-changed", &event) {
                            eprintln!(
                                "[SessionManager] Failed to emit session-status-changed event: {}",
                                e
                            );
                        }

                        println!("[SessionManager] Session {} is now Active", session_id);
                    }
                }
                Err(e) => {
                    let error_msg = format!("{}", e);
                    eprintln!(
                        "[SessionManager] Failed to start ACP session for {}: {}",
                        session_id, error_msg
                    );

                    // Update session to Error state
                    let mut sessions_guard = sessions.write().await;
                    if let Some(entry) = sessions_guard.get_mut(&session_id) {
                        if entry.session.status != SessionStatus::Creating {
                            return;
                        }
                        entry.session.status = SessionStatus::Error;

                        // Persist error status to database
                        if let Err(db_err) =
                            db.update_session_status(&session_id, &SessionStatus::Error)
                        {
                            eprintln!(
                                "[SessionManager] Failed to update session error status in DB: {}",
                                db_err
                            );
                        }
                    }

                    // Emit error event to frontend
                    let event = SessionStatusEvent {
                        session_id: session_id.clone(),
                        status: SessionStatus::Error,
                        session: None,
                        error: Some(error_msg),
                    };
                    if let Err(e) = app_handle.emit("session-status-changed", &event) {
                        eprintln!(
                            "[SessionManager] Failed to emit session-status-changed event: {}",
                            e
                        );
                    }
                }
            }
        });
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
            }

            // Remove from DB and memory entirely when cleanup is requested
            if cleanup_worktree {
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

    /// Resume a terminated/paused session by re-establishing the ACP connection
    pub async fn resume_session(&self, session_id: &str) -> AppResult<Session> {
        // Get session data and validate it's resumable
        let session = {
            let sessions = self.sessions.read().await;
            let entry = sessions
                .get(session_id)
                .ok_or_else(|| AppError::NotFound(format!("Session '{}' not found", session_id)))?;

            if entry.session.status == SessionStatus::Active {
                return Err(AppError::InvalidOperation(
                    "Session is already active".to_string(),
                ));
            }

            if entry.adapter.is_some() {
                return Err(AppError::InvalidOperation(
                    "Session already has an active adapter".to_string(),
                ));
            }

            entry.session.clone()
        };

        let acp_session_id = session.acp_session_id.as_ref().ok_or_else(|| {
            AppError::InvalidOperation(
                "Session has no ACP session ID and cannot be resumed".to_string(),
            )
        })?;

        let worktree_path = PathBuf::from(&session.worktree_path);

        // Create provider adapter with settings
        let provider_settings = self.settings_manager.get_provider_settings(&session.provider);
        let mut adapter: Box<dyn ProviderAdapter> = match &session.provider {
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
        let session_id_for_log = session_id.to_string();
        tokio::spawn(async move {
            println!(
                "[SessionManager] Starting stream forwarder for resumed session {}",
                session_id_for_log
            );
            while let Some(chunk) = rx.recv().await {
                println!(
                    "[SessionManager] Forwarding stream chunk: session={}, message_id={}, is_complete={}",
                    chunk.session_id, chunk.message_id, chunk.is_complete
                );
                if let Err(e) = app_handle.emit("stream-chunk", &chunk) {
                    eprintln!("[SessionManager] Failed to emit stream-chunk event: {}", e);
                }
            }
            println!(
                "[SessionManager] Stream forwarder ended for resumed session {}",
                session_id_for_log
            );
        });

        // Resume the session
        adapter
            .resume_session(
                session_id,
                acp_session_id,
                &worktree_path,
                tx,
                self.app_handle.clone(),
            )
            .await?;

        // Get the (possibly updated) ACP session ID and models from the adapter
        let new_acp_session_id = adapter.acp_session_id().map(|s| s.to_string());
        let new_available_models = adapter.available_models();
        let new_current_model_id = adapter.current_model_id().map(|s| s.to_string());

        // Update session in memory
        let updated_session = {
            let mut sessions = self.sessions.write().await;
            if let Some(entry) = sessions.get_mut(session_id) {
                entry.session.status = SessionStatus::Active;
                if let Some(ref acp_id) = new_acp_session_id {
                    entry.session.acp_session_id = Some(acp_id.clone());
                }
                entry.session.available_models = new_available_models;
                if entry.session.model.is_none() {
                    entry.session.model = new_current_model_id;
                }
                entry.adapter = Some(Arc::new(tokio::sync::Mutex::new(adapter)));
                entry.session.clone()
            } else {
                return Err(AppError::NotFound(format!(
                    "Session '{}' not found",
                    session_id
                )));
            }
        };

        // Persist status change to database
        if let Err(e) = self
            .db
            .update_session_status(session_id, &SessionStatus::Active)
        {
            eprintln!(
                "[SessionManager] Failed to update session status in DB: {}",
                e
            );
        }

        // Persist new ACP session ID if it changed
        if let Some(ref acp_id) = new_acp_session_id {
            if let Err(e) = self.db.update_session_acp_id(session_id, acp_id) {
                eprintln!(
                    "[SessionManager] Failed to update ACP session ID in DB: {}",
                    e
                );
            }
        }

        Ok(updated_session)
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

    /// Update available commands for a session
    pub async fn update_session_commands(&self, session_id: &str, commands: Vec<AvailableCommand>) {
        let mut sessions = self.sessions.write().await;
        if let Some(entry) = sessions.get_mut(session_id) {
            entry.session.available_commands = commands;
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

    /// Set the model for an active session
    pub async fn set_session_model(&self, session_id: &str, model_id: String) -> AppResult<Session> {
        // Validate model is available for this session
        {
            let sessions = self.sessions.read().await;
            let entry = sessions.get(session_id).ok_or_else(|| {
                AppError::NotFound(format!("Session '{}' not found", session_id))
            })?;

            if !entry.session.available_models.is_empty()
                && !entry.session.available_models.iter().any(|m| m.model_id == model_id)
            {
                return Err(AppError::InvalidOperation(format!(
                    "Model '{}' is not available for this session",
                    model_id
                )));
            }
        }

        // Get adapter and call set_model
        let adapter = {
            let sessions = self.sessions.read().await;
            sessions.get(session_id).and_then(|e| e.adapter.clone())
        };

        if let Some(adapter) = adapter {
            let mut adapter = adapter.lock().await;
            adapter.set_model(&model_id).await?;
        } else {
            return Err(AppError::InvalidOperation(
                "Session is not active".to_string(),
            ));
        }

        // Update session in memory and database
        {
            let mut sessions = self.sessions.write().await;
            if let Some(entry) = sessions.get_mut(session_id) {
                entry.session.model = Some(model_id.clone());

                // Persist model change to database
                if let Err(e) = self.db.update_session_model(session_id, &model_id) {
                    eprintln!(
                        "[SessionManager] Failed to update session model in DB: {}",
                        e
                    );
                }

                Ok(entry.session.clone())
            } else {
                Err(AppError::NotFound(format!("Session '{}' not found", session_id)))
            }
        }
    }
}
