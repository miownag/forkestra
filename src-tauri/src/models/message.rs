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
}
