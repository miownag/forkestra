use std::path::Path;

use agent_client_protocol::SessionConfigOption;
use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::models::{ModeInfo, ModelInfo, PromptContent, ProviderInfo, ProviderType, StreamChunk};

#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// Get the provider type
    fn provider_type(&self) -> ProviderType;

    /// Detect if the CLI is installed
    fn detect(&self) -> AppResult<ProviderInfo>;

    /// Start a session with the CLI
    async fn start_session(
        &mut self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<()>;

    /// Resume an existing ACP session by its session ID
    ///
    /// - `worktree_path`: Directory where the ACP process will run (for file access isolation)
    /// - `project_path`: Original project path used for session file lookup (should match session/new cwd)
    async fn resume_session(
        &mut self,
        session_id: &str,
        acp_session_id: &str,
        worktree_path: &Path,
        project_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        let _ = (session_id, acp_session_id, worktree_path, project_path, stream_tx, app_handle);
        Err(AppError::Provider(
            "This provider does not support session resume".to_string(),
        ))
    }

    /// Get the ACP session ID if available
    fn acp_session_id(&self) -> Option<&str> {
        None
    }

    /// Get available models reported by the ACP provider
    fn available_models(&self) -> Vec<ModelInfo> {
        vec![]
    }

    /// Get the current model ID if available
    fn current_model_id(&self) -> Option<&str> {
        None
    }

    /// Get available modes reported by the ACP provider
    fn available_modes(&self) -> Vec<ModeInfo> {
        vec![]
    }

    /// Get the current mode ID if available
    fn current_mode_id(&self) -> Option<&str> {
        None
    }

    /// Get session config options from the ACP provider
    fn config_options(&self) -> Vec<SessionConfigOption> {
        vec![]
    }

    /// Send a message to the CLI
    async fn send_message(&mut self, content: Vec<PromptContent>) -> AppResult<()>;

    /// Set the model for the current session
    async fn set_model(&mut self, model_id: &str) -> AppResult<()>;

    /// Set the mode for the current session
    async fn set_mode(&mut self, mode_id: &str) -> AppResult<()>;

    /// Set a config option for the current session
    async fn set_config_option(&mut self, config_id: &str, value: &str) -> AppResult<()>;

    /// Check if the session is active
    fn is_active(&self) -> bool;

    /// Cancel the current ongoing prompt (graceful)
    async fn cancel(&mut self) -> AppResult<()> {
        Err(AppError::Provider(
            "This provider does not support cancel".to_string(),
        ))
    }

    /// Terminate the session
    async fn terminate(&mut self) -> AppResult<()>;
}
