use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::provider::ProviderType;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub provider: ProviderType,
    pub project_path: String,
    pub base_branch: Option<String>,
}
