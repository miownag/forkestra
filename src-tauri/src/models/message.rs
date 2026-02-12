use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageContentType {
    Text,
    ToolUse,
    ToolResult,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUseInfo {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_result: Option<String>,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub content: String,
    pub content_type: MessageContentType,
    pub tool_use: Option<ToolUseInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallInfo>>,
    pub timestamp: DateTime<Utc>,
    pub is_streaming: bool,
}

impl ChatMessage {
    pub fn user(session_id: &str, content: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            role: MessageRole::User,
            content: content.to_string(),
            content_type: MessageContentType::Text,
            tool_use: None,
            tool_calls: None,
            timestamp: Utc::now(),
            is_streaming: false,
        }
    }

    pub fn assistant(session_id: &str, content: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            role: MessageRole::Assistant,
            content: content.to_string(),
            content_type: MessageContentType::Text,
            tool_use: None,
            tool_calls: None,
            timestamp: Utc::now(),
            is_streaming: false,
        }
    }

    pub fn assistant_streaming(session_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            role: MessageRole::Assistant,
            content: String::new(),
            content_type: MessageContentType::Text,
            tool_use: None,
            tool_calls: None,
            timestamp: Utc::now(),
            is_streaming: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub session_id: String,
    pub message_id: String,
    pub content: String,
    pub is_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_type: Option<StreamChunkType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<ToolCallInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_content: Option<ImageContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageContent {
    pub data: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamChunkType {
    Text,
    Thinking,
    ToolCall,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallInfo {
    pub tool_call_id: String,
    pub tool_name: Option<String>,
    pub status: String,
    pub title: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOptionInfo {
    pub kind: String,
    pub name: String,
    pub option_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionPrompt {
    pub session_id: String,
    pub prompt_type: String, // "confirm" | "input" | "permission"
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<PermissionOptionInfo>>,
}

/// Event emitted when available slash commands are updated for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableCommandsEvent {
    pub session_id: String,
    pub available_commands: Vec<AvailableCommand>,
}

/// Event emitted when Agent sends a plan update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanUpdateEvent {
    pub session_id: String,
    pub message_id: String,
    pub entries: Vec<PlanEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<AvailableCommandInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableCommandInput {
    pub hint: String,
}

// ========================
// Agent Plan
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlanEntryPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanEntryStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntry {
    pub content: String,
    pub priority: PlanEntryPriority,
    pub status: PlanEntryStatus,
}
