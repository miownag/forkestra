use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::message::{AvailableCommand, PlanEntry};
use super::provider::ProviderType;
use agent_client_protocol::SessionConfigOption;

// ========== Git SCM Types ==========

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitFileStatusKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: GitFileStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitScmStatus {
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
    pub conflicts: Vec<GitFileStatus>,
    pub merge_in_progress: bool,
    pub rebase_in_progress: bool,
    pub branch_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeRebaseResult {
    Success,
    Conflicts(Vec<String>),
    UpToDate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictContent {
    pub path: String,
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub base: Option<String>,
    pub working: String,
}

/// Model information returned from ACP providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelInfo {
    pub model_id: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// Mode information returned from ACP providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModeInfo {
    pub mode_id: String,
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
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    pub project_path: String,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub acp_session_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub available_models: Vec<ModelInfo>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub available_modes: Vec<ModeInfo>,
    #[serde(default)]
    pub available_commands: Vec<AvailableCommand>,
    #[serde(default)]
    pub plan_entries: Vec<PlanEntry>,
    #[serde(default)]
    pub config_options: Vec<SessionConfigOption>,
    #[serde(default)]
    pub error: Option<SessionError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub provider: ProviderType,
    pub project_path: String,
    pub base_branch: Option<String>,
    #[serde(default)]
    pub use_local: bool,
    #[serde(default = "default_fetch_first")]
    pub fetch_first: bool,
    /// MCP server IDs to exclude from this session
    #[serde(default)]
    pub excluded_mcp_ids: Vec<String>,
}

fn default_fetch_first() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatusEvent {
    pub session_id: String,
    pub status: SessionStatus,
    pub session: Option<Session>,
    pub error: Option<SessionError>,
}
