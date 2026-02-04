use std::path::Path;

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::error::AppResult;
use crate::models::{ProviderInfo, ProviderType, StreamChunk};

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
    ) -> AppResult<()>;

    /// Send a message to the CLI
    async fn send_message(&mut self, message: &str) -> AppResult<()>;

    /// Check if the session is active
    fn is_active(&self) -> bool;

    /// Terminate the session
    async fn terminate(&mut self) -> AppResult<()>;
}
