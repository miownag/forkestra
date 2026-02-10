use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::provider::ProviderType;

/// Model information returned from ACP providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelInfo {
    pub model_id: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Creating,
    Active,
    Paused,
    Terminated,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub provider: ProviderType,
    pub status: SessionStatus,
    pub worktree_path: String,
    pub branch_name: String,
    pub created_at: DateTime<Utc>,
    pub project_path: String,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub acp_session_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub available_models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub provider: ProviderType,
    pub project_path: String,
    pub base_branch: Option<String>,
    #[serde(default)]
    pub use_local: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatusEvent {
    pub session_id: String,
    pub status: SessionStatus,
    pub session: Option<Session>,
    pub error: Option<String>,
}
