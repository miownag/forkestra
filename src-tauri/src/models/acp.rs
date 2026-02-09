use serde::{Deserialize, Serialize};

// ========================
// JSON-RPC 2.0 Primitives
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    pub params: serde_json::Value,
}

impl JsonRpcRequest {
    pub fn new(id: u64, method: &str, params: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// ========================
// ACP Initialize
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: u32,
    pub client_capabilities: ClientCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCapabilities {
    pub fs: FileSystemCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemCapabilities {
    pub read_text_file: bool,
    pub write_text_file: bool,
}

// ========================
// ACP Session
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpModelInfo {
    pub model_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelState {
    #[serde(default)]
    pub available_models: Vec<AcpModelInfo>,
    #[serde(default)]
    pub current_model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionNewResult {
    pub session_id: String,
    #[serde(default)]
    pub models: SessionModelState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResumeResult {
    #[serde(default)]
    pub models: SessionModelState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptParams {
    pub session_id: String,
    pub prompt: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptResult {
    pub stop_reason: String,
}

// ========================
// Content Blocks
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: Option<bool>,
    },
}

// ========================
// Session Update Notifications
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "sessionUpdate", rename_all = "snake_case")]
pub enum SessionUpdate {
    #[serde(rename = "agent_message_chunk")]
    AgentMessageChunk { content: ContentBlock },
    #[serde(rename = "agent_thought_chunk")]
    AgentThoughtChunk { content: ContentBlock },
    #[serde(rename = "tool_call")]
    ToolCall {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(default)]
        status: Option<ToolCallStatus>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        content: Option<serde_json::Value>,
        #[serde(default)]
        locations: Option<serde_json::Value>,
        #[serde(default)]
        kind: Option<String>,
        #[serde(default, rename = "serverName")]
        server_name: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
        #[serde(default, rename = "rawInput")]
        raw_input: Option<serde_json::Value>,
        #[serde(default, rename = "_meta")]
        meta: Option<serde_json::Value>,
    },
    #[serde(rename = "tool_call_update")]
    ToolCallUpdate {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        status: ToolCallStatus,
        #[serde(default)]
        content: Option<serde_json::Value>,
    },
    #[serde(rename = "available_commands_update")]
    AvailableCommandsUpdate {
        #[serde(default, rename = "availableCommands")]
        available_commands: Option<serde_json::Value>,
    },
    #[serde(rename = "mode_update")]
    ModeUpdate {
        #[serde(default)]
        modes: Option<serde_json::Value>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Pending,
    Running,
    InProgress,
    Completed,
    Error,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateParams {
    pub session_id: String,
    pub update: SessionUpdate,
}

// ========================
// Permission Requests
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRequestPermissionParams {
    pub session_id: String,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPermissionResponse {
    pub granted: bool,
}

// ========================
// Pending permission state
// ========================

#[derive(Debug, Clone)]
pub struct PendingPermission {
    /// The JSON-RPC id from the request_permission message
    pub jsonrpc_id: u64,
}
