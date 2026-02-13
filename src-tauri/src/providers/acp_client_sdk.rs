use std::collections::HashMap;
use std::sync::Arc;

use agent_client_protocol::{
    self as acp, Agent, CancelNotification, ContentBlock, InitializeRequest, InitializeResponse,
    LoadSessionRequest, NewSessionRequest, PermissionOptionId, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    ResumeSessionRequest, SelectedPermissionOutcome, SessionConfigKind,
    SessionConfigOptionCategory, SessionConfigSelectOptions, SessionId, SessionNotification,
    SessionUpdate, SetSessionModelRequest, SetSessionModeRequest, TextContent, ToolCallStatus,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::managers::SessionManager;
use crate::models::{
    AvailableCommand, AvailableCommandInput, AvailableCommandsEvent, ImageContent,
    InteractionPrompt, ModeInfo, ModelInfo, PermissionOptionInfo, PlanEntry, PlanEntryPriority,
    PlanEntryStatus, PlanUpdateEvent, StreamChunk, StreamChunkType, ToolCallInfo,
};

/// Commands that can be sent to the ACP connection running on a LocalSet.
pub enum AcpCommand {
    Prompt {
        session_id: String,
        message: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Cancel {
        session_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    SetModel {
        session_id: String,
        model_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    SetMode {
        session_id: String,
        mode_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    SetConfigOption {
        config_id: String,
        value: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    PermissionResponse {
        option_id: String,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Shutdown,
}

/// Result of an ACP handshake (initialize + session/new or session/load/resume).
pub struct AcpHandshakeResult {
    pub session_id: String,
    pub models: Vec<ModelInfo>,
    pub current_model_id: Option<String>,
    pub modes: Vec<ModeInfo>,
    pub current_mode_id: Option<String>,
    pub supports_load_session: bool,
    pub config_options: Vec<acp::SessionConfigOption>,
}

/// Shared context passed to the Client implementation.
struct ClientContext {
    session_id: String,
    current_message_id: Arc<Mutex<String>>,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    pending_permission_tx: mpsc::Sender<PendingPermissionInfo>,
    last_tool_name: std::cell::RefCell<Option<String>>,
}

/// Info about a pending permission request.
struct PendingPermissionInfo {
    _tool_call_update: acp::ToolCallUpdate,
    _options: Vec<acp::PermissionOption>,
    reply: oneshot::Sender<RequestPermissionResponse>,
}

/// Our Client trait implementation.
struct ForkClient {
    ctx: std::rc::Rc<ClientContext>,
}

#[async_trait::async_trait(?Send)]
impl acp::Client for ForkClient {
    async fn request_permission(
        &self,
        args: RequestPermissionRequest,
    ) -> acp::Result<RequestPermissionResponse> {
        let session_id = &self.ctx.session_id;

        let tool_name = args
            .tool_call
            .meta
            .as_ref()
            .and_then(|m| m.get("claudeCode"))
            .and_then(|cc| cc.get("toolName"))
            .and_then(|v| v.as_str())
            .or_else(|| args.tool_call.fields.title.as_deref())
            .unwrap_or("unknown")
            .to_string();

        let description = args
            .tool_call
            .fields
            .title
            .clone()
            .unwrap_or_else(|| "Permission requested".to_string());

        let options_info: Vec<PermissionOptionInfo> = args
            .options
            .iter()
            .map(|o| PermissionOptionInfo {
                kind: format!("{:?}", o.kind).to_lowercase(),
                name: o.name.clone(),
                option_id: o.option_id.to_string(),
            })
            .collect();

        let prompt = InteractionPrompt {
            session_id: session_id.clone(),
            prompt_type: "permission".to_string(),
            message: format!("{}: {}", tool_name, description),
            request_id: None,
            tool_name: Some(tool_name),
            options: if options_info.is_empty() {
                None
            } else {
                Some(options_info)
            },
        };

        if let Err(e) = self.ctx.app_handle.emit("interaction-prompt", &prompt) {
            eprintln!("[ACP] Failed to emit interaction-prompt event: {}", e);
        }

        let (reply_tx, reply_rx) = oneshot::channel();

        let perm_info = PendingPermissionInfo {
            _tool_call_update: args.tool_call,
            _options: args.options,
            reply: reply_tx,
        };

        self.ctx
            .pending_permission_tx
            .send(perm_info)
            .await
            .map_err(|_| {
                acp::Error::internal_error().data("failed to register pending permission")
            })?;

        reply_rx.await.map_err(|_| {
            acp::Error::internal_error().data("permission response channel closed")
        })
    }

    async fn session_notification(
        &self,
        args: SessionNotification,
    ) -> acp::Result<()> {
        let session_id = &self.ctx.session_id;
        let msg_id = self.ctx.current_message_id.lock().await.clone();

        handle_session_update(
            &args.update,
            session_id,
            &msg_id,
            &self.ctx.stream_tx,
            &self.ctx.app_handle,
            &self.ctx.last_tool_name,
        )
        .await;

        Ok(())
    }
}

// ========================
// Session Update Handling
// ========================

async fn handle_session_update(
    update: &SessionUpdate,
    session_id: &str,
    message_id: &str,
    stream_tx: &mpsc::Sender<StreamChunk>,
    app_handle: &AppHandle,
    last_tool_name: &std::cell::RefCell<Option<String>>,
) {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            handle_content_chunk(
                &chunk.content,
                session_id,
                message_id,
                stream_tx,
                StreamChunkType::Text,
            )
            .await;
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            handle_content_chunk(
                &chunk.content,
                session_id,
                message_id,
                stream_tx,
                StreamChunkType::Thinking,
            )
            .await;
        }
        SessionUpdate::ToolCall(tool_call) => {
            let resolved_tool_name = tool_call
                .meta
                .as_ref()
                .and_then(|m| m.get("claudeCode"))
                .and_then(|cc| cc.get("toolName"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let Some(ref name) = resolved_tool_name {
                *last_tool_name.borrow_mut() = Some(name.clone());
            }

            let status_str = match tool_call.status {
                ToolCallStatus::Pending | ToolCallStatus::InProgress => "running",
                ToolCallStatus::Completed => "completed",
                ToolCallStatus::Failed => "error",
                _ => "running",
            };

            let meta_claude_code = tool_call
                .meta
                .as_ref()
                .and_then(|m| m.get("claudeCode"));
            let tool_response = meta_claude_code.and_then(|cc| cc.get("toolResponse"));
            let has_tool_response = tool_response.is_some();

            let effective_status = if has_tool_response && status_str == "running" {
                "completed"
            } else {
                status_str
            };

            let content_str = if has_tool_response {
                tool_response.and_then(|tr| {
                    if let Some(file) = tr.get("file") {
                        file.get("content")
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string())
                    } else {
                        tr.get("text")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                    }
                })
            } else {
                extract_tool_call_content(&tool_call.content)
            };

            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: String::new(),
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::ToolCall),
                    tool_call: Some(ToolCallInfo {
                        tool_call_id: tool_call.tool_call_id.to_string(),
                        tool_name: resolved_tool_name,
                        status: effective_status.to_string(),
                        title: tool_call.title.clone(),
                        content: content_str,
                        raw_input: tool_call.raw_input.clone(),
                    }),
                    image_content: None,
                })
                .await;
        }
        SessionUpdate::ToolCallUpdate(tool_call_update) => {
            let status_str = match &tool_call_update.fields.status {
                Some(ToolCallStatus::Pending) | Some(ToolCallStatus::InProgress) => "running",
                Some(ToolCallStatus::Completed) => "completed",
                Some(ToolCallStatus::Failed) => "error",
                None => "running",
                _ => "running",
            };

            let content_str = tool_call_update
                .fields
                .content
                .as_ref()
                .and_then(|c| extract_tool_call_content(c));

            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: String::new(),
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::ToolCall),
                    tool_call: Some(ToolCallInfo {
                        tool_call_id: tool_call_update.tool_call_id.to_string(),
                        tool_name: None,
                        status: status_str.to_string(),
                        title: String::new(),
                        content: content_str,
                        raw_input: None,
                    }),
                    image_content: None,
                })
                .await;
        }
        SessionUpdate::AvailableCommandsUpdate(cmds_update) => {
            let commands: Vec<AvailableCommand> = cmds_update
                .available_commands
                .iter()
                .map(|c| AvailableCommand {
                    name: c.name.clone(),
                    description: c.description.clone(),
                    input: c.input.as_ref().map(|i| match i {
                        acp::AvailableCommandInput::Unstructured(u) => AvailableCommandInput {
                            hint: u.hint.clone(),
                        },
                        _ => AvailableCommandInput {
                            hint: String::new(),
                        },
                    }),
                })
                .collect();

            println!(
                "[ACP] Received available_commands_update with {} commands",
                commands.len()
            );

            if let Some(manager) = app_handle.try_state::<SessionManager>() {
                manager
                    .update_session_commands(session_id, commands.clone())
                    .await;
            }

            let event = AvailableCommandsEvent {
                session_id: session_id.to_string(),
                available_commands: commands,
            };

            if let Err(e) = app_handle.emit("available-commands-update", &event) {
                eprintln!(
                    "[ACP] Failed to emit available-commands-update event: {}",
                    e
                );
            }
        }
        SessionUpdate::CurrentModeUpdate(_) => {
            println!("[ACP] Received mode_update");
        }
        SessionUpdate::Plan(plan) => {
            let entries: Vec<PlanEntry> = plan
                .entries
                .iter()
                .map(|e| PlanEntry {
                    content: e.content.clone(),
                    priority: match e.priority {
                        acp::PlanEntryPriority::High => PlanEntryPriority::High,
                        acp::PlanEntryPriority::Medium => PlanEntryPriority::Medium,
                        acp::PlanEntryPriority::Low => PlanEntryPriority::Low,
                        _ => PlanEntryPriority::Medium,
                    },
                    status: match e.status {
                        acp::PlanEntryStatus::Pending => PlanEntryStatus::Pending,
                        acp::PlanEntryStatus::InProgress => PlanEntryStatus::InProgress,
                        acp::PlanEntryStatus::Completed => PlanEntryStatus::Completed,
                        _ => PlanEntryStatus::Pending,
                    },
                })
                .collect();

            println!(
                "[ACP] Received plan update with {} entries",
                entries.len()
            );

            if let Some(manager) = app_handle.try_state::<SessionManager>() {
                manager
                    .update_session_plan(session_id, entries.clone())
                    .await;
            }

            let event = PlanUpdateEvent {
                session_id: session_id.to_string(),
                message_id: message_id.to_string(),
                entries,
            };

            if let Err(e) = app_handle.emit("plan-update", &event) {
                eprintln!("[ACP] Failed to emit plan-update event: {}", e);
            }
        }
        SessionUpdate::ConfigOptionUpdate(config_update) => {
            println!(
                "[ACP] Received config_option_update: {} options",
                config_update.config_options.len()
            );
            for option in &config_update.config_options {
                println!(
                    "  - name={}, category={:?}",
                    option.name, option.category
                );
            }

            // 发送 Tauri 事件到前端
            #[derive(serde::Serialize, Clone)]
            struct ConfigOptionsUpdatePayload {
                session_id: String,
                config_options: Vec<acp::SessionConfigOption>,
            }

            let payload = ConfigOptionsUpdatePayload {
                session_id: session_id.to_string(),
                config_options: config_update.config_options.clone(),
            };

            if let Err(e) = app_handle.emit("config-options-update", &payload) {
                eprintln!("[ACP] Failed to emit config-options-update event: {}", e);
            }

            // TODO: 可选 - 更新 SessionManager 中的 session.config_options 并持久化到数据库
            // 这需要在 SessionManager 中添加一个方法 update_session_config_options
        }
        _ => {
            println!("[ACP] Received unknown session update type");
        }
    }
}

async fn handle_content_chunk(
    content: &ContentBlock,
    session_id: &str,
    message_id: &str,
    stream_tx: &mpsc::Sender<StreamChunk>,
    chunk_type: StreamChunkType,
) {
    match content {
        ContentBlock::Text(text) => {
            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: text.text.clone(),
                    is_complete: false,
                    chunk_type: Some(chunk_type),
                    tool_call: None,
                    image_content: None,
                })
                .await;
        }
        ContentBlock::Image(img) => {
            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: String::new(),
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::Image),
                    tool_call: None,
                    image_content: Some(ImageContent {
                        data: img.data.clone(),
                        mime_type: img.mime_type.clone(),
                        uri: img.uri.clone(),
                    }),
                })
                .await;
        }
        _ => {}
    }
}

fn extract_tool_call_content(content: &[acp::ToolCallContent]) -> Option<String> {
    let texts: Vec<String> = content
        .iter()
        .filter_map(|c| match c {
            acp::ToolCallContent::Content(content_wrapper) => match &content_wrapper.content {
                ContentBlock::Text(t) => Some(t.text.clone()),
                _ => None,
            },
            _ => None,
        })
        .collect();

    if texts.is_empty() {
        None
    } else {
        Some(texts.join("\n"))
    }
}

// ========================
// Environment
// ========================

pub fn build_clean_env_with_custom(custom_env: HashMap<String, String>) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    env.remove("NODE_OPTIONS");
    env.remove("NODE_INSPECT");
    env.remove("NODE_DEBUG");

    if let Some(shell_path) = crate::providers::ProviderDetector::get_shell_path() {
        env.insert("PATH".to_string(), shell_path);
    }

    // Set default CLAUDE_CONFIG_DIR if .claude-internal exists
    let default_config_dir = if let Ok(home) = std::env::var("HOME") {
        let claude_internal = format!("{}/.claude-internal", home);
        if std::path::Path::new(&claude_internal).exists() {
            println!("[ACP] Setting default CLAUDE_CONFIG_DIR to: {}", claude_internal);
            env.insert("CLAUDE_CONFIG_DIR".to_string(), claude_internal.clone());
            Some(claude_internal)
        } else {
            None
        }
    } else {
        None
    };

    // Override with custom environment variables (including custom CLAUDE_CONFIG_DIR)
    for (key, value) in custom_env {
        let final_value = if key == "CLAUDE_CONFIG_DIR" {
            // Expand ~ to home directory
            let expanded = expand_tilde(&value);
            if let Some(ref default) = default_config_dir {
                if default != &expanded {
                    println!("[ACP] Overriding CLAUDE_CONFIG_DIR: {} -> {}", default, expanded);
                }
            } else {
                println!("[ACP] Setting custom CLAUDE_CONFIG_DIR: {}", expanded);
            }
            expanded
        } else {
            value
        };
        env.insert(key, final_value);
    }

    // Log final CLAUDE_CONFIG_DIR
    if let Some(config_dir) = env.get("CLAUDE_CONFIG_DIR") {
        println!("[ACP] Final CLAUDE_CONFIG_DIR: {}", config_dir);
    } else {
        println!("[ACP] CLAUDE_CONFIG_DIR not set, Claude Code will use default (~/.claude)");
    }

    env
}

/// Expand ~ to home directory in a path string
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return path.replacen("~", &home, 1);
        }
    } else if path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return home;
        }
    }
    path.to_string()
}

// ========================
// Connection Spawning
// ========================

/// Spawn an ACP connection on a dedicated LocalSet thread.
pub fn spawn_acp_connection(
    stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
    session_id: String,
    cwd: String,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    current_message_id: Arc<Mutex<String>>,
) -> (
    mpsc::Sender<AcpCommand>,
    oneshot::Receiver<Result<AcpHandshakeResult, String>>,
) {
    let (cmd_tx, cmd_rx) = mpsc::channel::<AcpCommand>(32);
    let (handshake_tx, handshake_rx) = oneshot::channel();
    let (perm_tx, perm_rx) = mpsc::channel::<PendingPermissionInfo>(4);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to create tokio runtime for ACP connection");

        let local = tokio::task::LocalSet::new();

        local.block_on(&rt, async move {
            run_acp_connection(
                stdin,
                stdout,
                session_id,
                cwd,
                stream_tx,
                app_handle,
                current_message_id,
                cmd_rx,
                handshake_tx,
                perm_tx,
                perm_rx,
            )
            .await;
        });
    });

    (cmd_tx, handshake_rx)
}

/// Spawn an ACP connection for resuming a session.
pub fn spawn_acp_resume_connection(
    stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
    session_id: String,
    acp_session_id: String,
    cwd: String,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    current_message_id: Arc<Mutex<String>>,
) -> (
    mpsc::Sender<AcpCommand>,
    oneshot::Receiver<Result<AcpHandshakeResult, String>>,
) {
    let (cmd_tx, cmd_rx) = mpsc::channel::<AcpCommand>(32);
    let (handshake_tx, handshake_rx) = oneshot::channel();
    let (perm_tx, perm_rx) = mpsc::channel::<PendingPermissionInfo>(4);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to create tokio runtime for ACP connection");

        let local = tokio::task::LocalSet::new();

        local.block_on(&rt, async move {
            run_acp_resume_connection(
                stdin,
                stdout,
                session_id,
                acp_session_id,
                cwd,
                stream_tx,
                app_handle,
                current_message_id,
                cmd_rx,
                handshake_tx,
                perm_tx,
                perm_rx,
            )
            .await;
        });
    });

    (cmd_tx, handshake_rx)
}

// ========================
// Connection Logic
// ========================

async fn run_acp_connection(
    stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
    session_id: String,
    cwd: String,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    current_message_id: Arc<Mutex<String>>,
    cmd_rx: mpsc::Receiver<AcpCommand>,
    handshake_tx: oneshot::Sender<Result<AcpHandshakeResult, String>>,
    perm_tx: mpsc::Sender<PendingPermissionInfo>,
    perm_rx: mpsc::Receiver<PendingPermissionInfo>,
) {
    use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

    let ctx = std::rc::Rc::new(ClientContext {
        session_id: session_id.clone(),
        current_message_id: current_message_id.clone(),
        stream_tx: stream_tx.clone(),
        app_handle,
        pending_permission_tx: perm_tx,
        last_tool_name: std::cell::RefCell::new(None),
    });

    let client = ForkClient { ctx };

    let (conn, io_future) = acp::ClientSideConnection::new(
        client,
        stdin.compat_write(),
        stdout.compat(),
        |f| {
            tokio::task::spawn_local(f);
        },
    );

    tokio::task::spawn_local(async move {
        if let Err(e) = io_future.await {
            eprintln!("[ACP] IO future error: {:?}", e);
        }
        println!("[ACP] IO future ended for session");
    });

    // Handshake: initialize + session/new
    let handshake_result = async {
        let init_response = acp_initialize_with_retry(&conn).await?;
        let supports_load = init_response.agent_capabilities.load_session;

        if let Some(ref info) = init_response.agent_info {
            println!(
                "[ACP] Agent: {} v{}",
                info.title.as_deref().unwrap_or(&info.name),
                &info.version
            );
        }

        let session_response = conn
            .new_session(NewSessionRequest::new(&cwd))
            .await
            .map_err(|e| format!("session/new failed: {:?}", e))?;

        let acp_session_id = session_response.session_id.to_string();
        println!("[ACP] Session created: {}", acp_session_id);

        let (models, current_model_id) = extract_models(
            session_response.models.as_ref(),
            session_response.config_options.as_deref(),
        );

        let (modes, current_mode_id) = extract_modes(
            session_response.modes.as_ref(),
            session_response.config_options.as_deref(),
        );

        let config_options = session_response
            .config_options
            .unwrap_or_default();

        Ok(AcpHandshakeResult {
            session_id: acp_session_id,
            models,
            current_model_id,
            modes,
            current_mode_id,
            supports_load_session: supports_load,
            config_options,
        })
    }
    .await;

    match handshake_result {
        Ok(result) => {
            let _ = handshake_tx.send(Ok(result));
        }
        Err(e) => {
            let _ = handshake_tx.send(Err(e));
            return;
        }
    }

    run_command_loop(conn, cmd_rx, perm_rx, stream_tx, session_id, current_message_id).await;
}

async fn run_acp_resume_connection(
    stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
    session_id: String,
    acp_session_id: String,
    cwd: String,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    current_message_id: Arc<Mutex<String>>,
    cmd_rx: mpsc::Receiver<AcpCommand>,
    handshake_tx: oneshot::Sender<Result<AcpHandshakeResult, String>>,
    perm_tx: mpsc::Sender<PendingPermissionInfo>,
    perm_rx: mpsc::Receiver<PendingPermissionInfo>,
) {
    use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

    let ctx = std::rc::Rc::new(ClientContext {
        session_id: session_id.clone(),
        current_message_id: current_message_id.clone(),
        stream_tx: stream_tx.clone(),
        app_handle,
        pending_permission_tx: perm_tx,
        last_tool_name: std::cell::RefCell::new(None),
    });

    let client = ForkClient { ctx };

    let (conn, io_future) = acp::ClientSideConnection::new(
        client,
        stdin.compat_write(),
        stdout.compat(),
        |f| {
            tokio::task::spawn_local(f);
        },
    );

    tokio::task::spawn_local(async move {
        if let Err(e) = io_future.await {
            eprintln!("[ACP] IO future error: {:?}", e);
        }
        println!("[ACP] IO future ended for session");
    });

    // Handshake: initialize + session/load or session/resume
    let handshake_result = async {
        let init_response = acp_initialize_with_retry(&conn).await?;
        let supports_load = init_response.agent_capabilities.load_session;

        if let Some(ref info) = init_response.agent_info {
            println!(
                "[ACP] Agent: {} v{}",
                info.title.as_deref().unwrap_or(&info.name),
                &info.version
            );
        }

        println!("[ACP] Attempting to restore session: {} (cwd: {})", acp_session_id, cwd);
        println!("[ACP] Agent supports loadSession: {}", supports_load);

        let (model_state, mode_state, config_options) = if supports_load {
            println!("[ACP] Trying session/load for {}", acp_session_id);
            match conn
                .load_session(LoadSessionRequest::new(acp_session_id.clone(), cwd.clone()))
                .await
            {
                Ok(response) => {
                    println!("[ACP] Session loaded via session/load for {}", acp_session_id);
                    (response.models, response.modes, response.config_options)
                }
                Err(e) => {
                    println!(
                        "[ACP] session/load failed for {}, falling back to session/resume: {:?}",
                        acp_session_id, e
                    );
                    println!("[ACP] Trying session/resume for {}", acp_session_id);
                    let resume_response = conn
                        .resume_session(ResumeSessionRequest::new(acp_session_id.clone(), cwd.clone()))
                        .await
                        .map_err(|e| format!("session/resume failed: {:?}", e))?;
                    println!("[ACP] Session resumed via session/resume for {}", acp_session_id);
                    (resume_response.models, resume_response.modes, resume_response.config_options)
                }
            }
        } else {
            println!(
                "[ACP] Agent does not support loadSession, using session/resume for {}",
                acp_session_id
            );
            let resume_response = conn
                .resume_session(ResumeSessionRequest::new(acp_session_id.clone(), cwd.clone()))
                .await
                .map_err(|e| format!("session/resume failed: {:?}", e))?;
            (resume_response.models, resume_response.modes, resume_response.config_options)
        };

        println!("[ACP] Session restored: {}", acp_session_id);

        let (models, current_model_id) = extract_models(
            model_state.as_ref(),
            config_options.as_deref(),
        );

        let (modes, current_mode_id) = extract_modes(
            mode_state.as_ref(),
            config_options.as_deref(),
        );

        let config_opts = config_options.unwrap_or_default();

        Ok(AcpHandshakeResult {
            session_id: acp_session_id.clone(),
            models,
            current_model_id,
            modes,
            current_mode_id,
            supports_load_session: supports_load,
            config_options: config_opts,
        })
    }
    .await;

    match handshake_result {
        Ok(result) => {
            let _ = handshake_tx.send(Ok(result));
        }
        Err(e) => {
            let _ = handshake_tx.send(Err(e));
            return;
        }
    }

    run_command_loop(conn, cmd_rx, perm_rx, stream_tx, session_id, current_message_id).await;
}

// ========================
// Command Loop
// ========================

async fn run_command_loop(
    conn: acp::ClientSideConnection,
    mut cmd_rx: mpsc::Receiver<AcpCommand>,
    mut perm_rx: mpsc::Receiver<PendingPermissionInfo>,
    stream_tx: mpsc::Sender<StreamChunk>,
    session_id: String,
    current_message_id: Arc<Mutex<String>>,
) {
    let pending_perm: std::cell::RefCell<Option<PendingPermissionInfo>> =
        std::cell::RefCell::new(None);

    // Wrap connection in Rc for sharing across tasks
    let conn = std::rc::Rc::new(conn);

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(AcpCommand::Prompt { session_id: acp_sid, message, reply }) => {
                        {
                            let mut msg_id = current_message_id.lock().await;
                            *msg_id = uuid::Uuid::new_v4().to_string();
                        }

                        let prompt = PromptRequest::new(
                            SessionId::new(&*acp_sid),
                            vec![ContentBlock::Text(TextContent::new(message))],
                        );

                        // Spawn prompt in background so Cancel can be processed immediately
                        let conn_clone = conn.clone();
                        let stream_tx_clone = stream_tx.clone();
                        let session_id_clone = session_id.clone();
                        let current_message_id_clone = current_message_id.clone();

                        tokio::task::spawn_local(async move {
                            let result = conn_clone.prompt(prompt).await;

                            match result {
                                Ok(_response) => {
                                    let msg_id = current_message_id_clone.lock().await.clone();
                                    let _ = stream_tx_clone
                                        .send(StreamChunk {
                                            session_id: session_id_clone,
                                            message_id: msg_id,
                                            content: String::new(),
                                            is_complete: true,
                                            chunk_type: None,
                                            tool_call: None,
                                            image_content: None,
                                        })
                                        .await;
                                    let _ = reply.send(Ok(()));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(format!("prompt failed: {:?}", e)));
                                }
                            }
                        });
                    }
                    Some(AcpCommand::Cancel { session_id: acp_sid, reply }) => {
                        println!("[ACP] Received Cancel command for session: {}", acp_sid);
                        let result = conn
                            .cancel(CancelNotification::new(SessionId::new(&*acp_sid)))
                            .await;

                        match result {
                            Ok(()) => {
                                println!("[ACP] Session cancel notification sent successfully for {}", acp_sid);
                                let _ = reply.send(Ok(()));
                            }
                            Err(e) => {
                                println!("[ACP] Session cancel failed for {}: {:?}", acp_sid, e);
                                let _ = reply.send(Err(format!("cancel failed: {:?}", e)));
                            }
                        }
                    }
                    Some(AcpCommand::SetModel { session_id: acp_sid, model_id, reply }) => {
                        let result = conn
                            .set_session_model(
                                SetSessionModelRequest::new(
                                    SessionId::new(&*acp_sid),
                                    acp::ModelId::new(&*model_id),
                                )
                            )
                            .await;

                        match result {
                            Ok(_) => {
                                println!("[ACP] Session model set to: {} for session {}", model_id, acp_sid);
                                let _ = reply.send(Ok(()));
                            }
                            Err(e) => {
                                let _ = reply.send(Err(format!("set_model failed: {:?}", e)));
                            }
                        }
                    }
                    Some(AcpCommand::SetMode { session_id: acp_sid, mode_id, reply }) => {
                        let result = conn
                            .set_session_mode(
                                SetSessionModeRequest::new(
                                    SessionId::new(&*acp_sid),
                                    acp::SessionModeId::new(&*mode_id),
                                )
                            )
                            .await;

                        match result {
                            Ok(_) => {
                                println!("[ACP] Session mode set to: {} for session {}", mode_id, acp_sid);
                                let _ = reply.send(Ok(()));
                            }
                            Err(e) => {
                                let _ = reply.send(Err(format!("set_mode failed: {:?}", e)));
                            }
                        }
                    }
                    Some(AcpCommand::SetConfigOption { config_id, value, reply }) => {
                        println!(
                            "[ACP] Setting config option '{}' to '{}'",
                            config_id, value
                        );

                        let result = conn
                            .set_session_config_option(
                                acp::SetSessionConfigOptionRequest::new(
                                    SessionId::new(&*session_id),
                                    acp::SessionConfigId::new(&*config_id),
                                    acp::SessionConfigValueId::new(&*value),
                                )
                            )
                            .await;

                        match result {
                            Ok(response) => {
                                println!(
                                    "[ACP] Config option updated, received {} config options",
                                    response.config_options.len()
                                );

                                let _ = reply.send(Ok(()));
                            }
                            Err(e) => {
                                eprintln!("[ACP] Failed to set config option: {:?}", e);
                                let _ = reply.send(Err(format!("Failed to set config option: {:?}", e)));
                            }
                        }
                    }
                    Some(AcpCommand::PermissionResponse { option_id, reply }) => {
                        if let Some(perm_info) = pending_perm.borrow_mut().take() {
                            let response = RequestPermissionResponse::new(
                                RequestPermissionOutcome::Selected(
                                    SelectedPermissionOutcome::new(
                                        PermissionOptionId::from(option_id)
                                    )
                                )
                            );
                            let _ = perm_info.reply.send(response);
                            let _ = reply.send(Ok(()));
                        } else {
                            let _ = reply.send(Err("No pending permission request".to_string()));
                        }
                    }
                    Some(AcpCommand::Shutdown) | None => {
                        println!("[ACP] Command loop shutting down for session {}", session_id);
                        break;
                    }
                }
            }
            perm = perm_rx.recv() => {
                if let Some(perm_info) = perm {
                    *pending_perm.borrow_mut() = Some(perm_info);
                }
            }
        }
    }
}

// ========================
// Initialize
// ========================

async fn acp_initialize_with_retry(
    conn: &acp::ClientSideConnection,
) -> Result<InitializeResponse, String> {
    let mut last_error = None;
    for attempt in 1..=15 {
        let request = InitializeRequest::new(acp::ProtocolVersion::LATEST)
            .client_info(
                acp::Implementation::new("forkestra", env!("CARGO_PKG_VERSION"))
                    .title("Forkestra"),
            );

        let result = conn.initialize(request).await;

        match result {
            Ok(response) => {
                println!("[ACP] Initialize succeeded on attempt {}", attempt);

                if response.protocol_version != acp::ProtocolVersion::LATEST {
                    return Err(format!(
                        "Protocol version mismatch: agent={}, client={}",
                        response.protocol_version, acp::ProtocolVersion::LATEST
                    ));
                }

                let caps = &response.agent_capabilities;
                println!(
                    "[ACP] Agent capabilities: loadSession={}, prompt(image={}, audio={}, embeddedContext={})",
                    caps.load_session,
                    caps.prompt_capabilities.image,
                    caps.prompt_capabilities.audio,
                    caps.prompt_capabilities.embedded_context,
                );

                return Ok(response);
            }
            Err(e) => {
                println!(
                    "[ACP] Initialize attempt {} failed: {:?}. Retrying...",
                    attempt, e
                );
                last_error = Some(format!("{:?}", e));
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }

    Err(format!(
        "ACP initialize failed after 15 attempts: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

// ========================
// Model Extraction
// ========================

/// Extract models from the session response. Prefers the `models` (SessionModelState)
/// field when available, falls back to extracting from `config_options`.
fn extract_models(
    model_state: Option<&acp::SessionModelState>,
    config_options: Option<&[acp::SessionConfigOption]>,
) -> (Vec<ModelInfo>, Option<String>) {
    // Prefer the dedicated `models` field (unstable_session_model)
    if let Some(state) = model_state {
        let models: Vec<ModelInfo> = state
            .available_models
            .iter()
            .map(|m| ModelInfo {
                model_id: m.model_id.to_string(),
                display_name: m.name.clone(),
                description: m.description.clone(),
            })
            .collect();
        let current_model_id = Some(state.current_model_id.to_string());

        println!(
            "[ACP] Extracted {} models from SessionModelState, current_model_id = {:?}",
            models.len(), current_model_id
        );

        if !models.is_empty() {
            return (models, current_model_id);
        }
    }

    // Fallback: extract from config_options
    let mut models = Vec::new();
    let mut current_model_id = None;

    println!(
        "[ACP] Extracting models from config_options: {} options",
        config_options.map_or(0, |opts| opts.len())
    );

    if let Some(options) = config_options {
        for option in options {
            println!(
                "[ACP] Config option: name={}, category={:?}",
                option.name, option.category
            );
            if option.category == Some(SessionConfigOptionCategory::Model) {
                if let SessionConfigKind::Select(select) = &option.kind {
                    current_model_id = Some(select.current_value.to_string());

                    match &select.options {
                        SessionConfigSelectOptions::Ungrouped(opts) => {
                            for opt in opts {
                                models.push(ModelInfo {
                                    model_id: opt.value.to_string(),
                                    display_name: opt.name.clone(),
                                    description: opt.description.clone(),
                                });
                            }
                        }
                        SessionConfigSelectOptions::Grouped(groups) => {
                            for group in groups {
                                for opt in &group.options {
                                    models.push(ModelInfo {
                                        model_id: opt.value.to_string(),
                                        display_name: opt.name.clone(),
                                        description: opt.description.clone(),
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    println!(
        "[ACP] Extracted {} models from config_options, current_model_id = {:?}",
        models.len(), current_model_id
    );

    (models, current_model_id)
}

/// Extract modes from the session response. Prefers the `modes` (SessionModeState)
/// field when available, falls back to extracting from `config_options`.
fn extract_modes(
    mode_state: Option<&acp::SessionModeState>,
    config_options: Option<&[acp::SessionConfigOption]>,
) -> (Vec<ModeInfo>, Option<String>) {
    // Prefer the dedicated `modes` field
    if let Some(state) = mode_state {
        let modes: Vec<ModeInfo> = state
            .available_modes
            .iter()
            .map(|m| ModeInfo {
                mode_id: m.id.to_string(),
                display_name: m.name.clone(),
                description: m.description.clone(),
            })
            .collect();
        let current_mode_id = Some(state.current_mode_id.to_string());

        println!(
            "[ACP] Extracted {} modes from SessionModeState, current_mode_id = {:?}",
            modes.len(), current_mode_id
        );

        if !modes.is_empty() {
            return (modes, current_mode_id);
        }
    }

    // Fallback: extract from config_options
    let mut modes = Vec::new();
    let mut current_mode_id = None;

    println!(
        "[ACP] Extracting modes from config_options: {} options",
        config_options.map_or(0, |opts| opts.len())
    );

    if let Some(options) = config_options {
        for option in options {
            if option.category == Some(SessionConfigOptionCategory::Mode) {
                if let SessionConfigKind::Select(select) = &option.kind {
                    current_mode_id = Some(select.current_value.to_string());

                    match &select.options {
                        SessionConfigSelectOptions::Ungrouped(opts) => {
                            for opt in opts {
                                modes.push(ModeInfo {
                                    mode_id: opt.value.to_string(),
                                    display_name: opt.name.clone(),
                                    description: opt.description.clone(),
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    println!(
        "[ACP] Extracted {} modes from config_options, current_mode_id = {:?}",
        modes.len(), current_mode_id
    );

    (modes, current_mode_id)
}

// ========================
// Stderr Reader
// ========================

pub fn spawn_stderr_reader(
    stderr: tokio::process::ChildStderr,
    provider_name: String,
    stream_tx: mpsc::Sender<StreamChunk>,
    session_id: String,
    current_message_id: Arc<Mutex<String>>,
) {
    use tokio::io::AsyncBufReadExt;

    tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stderr);
        let mut lines = reader.lines();
        let tag_re = regex::Regex::new(r"<local-command-stdout>([\s\S]*?)</local-command-stdout>")
            .expect("invalid regex");

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[ACP:{}:stderr] {}", provider_name, line);

            for cap in tag_re.captures_iter(&line) {
                if let Some(content) = cap.get(1) {
                    let text = content.as_str().to_string();
                    if !text.is_empty() {
                        let msg_id = current_message_id.lock().await.clone();
                        let _ = stream_tx
                            .send(StreamChunk {
                                session_id: session_id.clone(),
                                message_id: msg_id,
                                content: text,
                                is_complete: false,
                                chunk_type: Some(StreamChunkType::Text),
                                tool_call: None,
                                image_content: None,
                            })
                            .await;
                    }
                }
            }
        }
    });
}
