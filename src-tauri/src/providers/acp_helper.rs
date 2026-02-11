use std::collections::HashMap;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::error::{AppError, AppResult};

/// Safely truncate a string to at most `max_bytes` bytes at a valid UTF-8 char boundary.
fn truncate_str(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // Find the largest index <= max_bytes that is a char boundary
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}
use crate::managers::SessionManager;
use crate::models::{
    AvailableCommand, AvailableCommandsEvent,
    ClientCapabilities, ClientInfo, ContentBlock, FileSystemCapabilities,
    InitializeParams, InitializeResult, InteractionPrompt,
    JsonRpcRequest, JsonRpcResponse, ModelInfo, PendingPermission, PermissionOptionInfo,
    ProviderType, SessionNewResult,
    SessionPromptParams, SessionRequestPermissionParams, SessionResumeResult,
    StreamChunk, StreamChunkType, ToolCallInfo,
};

/// Shared state for ACP request-response correlation
pub type PendingRequests = Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcResponse>>>>;

/// Spawn a stdin writer task that reads from a channel and writes to the child's stdin
pub fn spawn_stdin_writer(
    mut stdin: ChildStdin,
    mut rx: mpsc::Receiver<String>,
) {
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Err(e) = stdin.write_all(msg.as_bytes()).await {
                eprintln!("[ACP] Failed to write to stdin: {}", e);
                break;
            }
            if let Err(e) = stdin.write_all(b"\n").await {
                eprintln!("[ACP] Failed to write newline to stdin: {}", e);
                break;
            }
            if let Err(e) = stdin.flush().await {
                eprintln!("[ACP] Failed to flush stdin: {}", e);
                break;
            }
        }
        println!("[ACP] Stdin writer task ended");
    });
}

/// Spawn a stdout reader task that parses JSON-RPC messages and routes them
pub fn spawn_stdout_reader(
    stdout: tokio::process::ChildStdout,
    stream_tx: mpsc::Sender<StreamChunk>,
    app_handle: AppHandle,
    pending_requests: PendingRequests,
    pending_permission: Arc<Mutex<Option<PendingPermission>>>,
    session_id: String,
    current_message_id: Arc<Mutex<String>>,
) {
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        // Track the last tool name from session/update tool_call events
        let mut last_tool_name: Option<String> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }

            let json_value: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => {
                    // Not a JSON line, skip (e.g., npx output, warnings)
                    println!("[ACP] Non-JSON line: {}", truncate_str(&line, 200));
                    continue;
                }
            };

            // Debug: log every JSON-RPC message received
            println!("[ACP:stdout] {}", truncate_str(&line, 500));

            // Check if this is a response (has "id" and "result" or "error")
            if json_value.get("id").is_some()
                && (json_value.get("result").is_some() || json_value.get("error").is_some())
            {
                if let Ok(response) = serde_json::from_value::<JsonRpcResponse>(json_value.clone())
                {
                    // Route to pending request handler
                    if let Some(id) = response.id {
                        let mut pending = pending_requests.lock().await;
                        if let Some(tx) = pending.remove(&id) {
                            let _ = tx.send(response.clone());
                        }
                    }

                    // Check if this is a session/prompt response with stop_reason: "end_turn"
                    if let Some(result) = &response.result {
                        if let Ok(prompt_result) =
                            serde_json::from_value::<crate::models::SessionPromptResult>(
                                result.clone(),
                            )
                        {
                            if prompt_result.stop_reason == "end_turn" {
                                let msg_id = current_message_id.lock().await.clone();
                                let _ = stream_tx
                                    .send(StreamChunk {
                                        session_id: session_id.clone(),
                                        message_id: msg_id,
                                        content: String::new(),
                                        is_complete: true,
                                        chunk_type: None,
                                        tool_call: None,
                                    })
                                    .await;
                            }
                        }
                    }
                }
                continue;
            }

            // Check if this is a notification (has "method" but no "id",
            // or has "method" and "id" for request_permission which is a server->client request)
            if let Some(method) = json_value.get("method").and_then(|m| m.as_str()) {
                match method {
                    "session/update" => {
                        if let Some(params) = json_value.get("params") {
                            if let Some(update) = params.get("update") {
                                // Track tool name from tool_call updates for permission requests
                                if update.get("sessionUpdate").and_then(|v| v.as_str()) == Some("tool_call") {
                                    let tool_name = update
                                        .get("_meta")
                                        .and_then(|m| m.get("claudeCode"))
                                        .and_then(|cc| cc.get("toolName"))
                                        .and_then(|v| v.as_str())
                                        .or_else(|| update.get("toolName").and_then(|v| v.as_str()));
                                    if let Some(name) = tool_name {
                                        last_tool_name = Some(name.to_string());
                                    }
                                }

                                let msg_id = current_message_id.lock().await.clone();
                                handle_session_update_raw(
                                    update,
                                    &session_id,
                                    &msg_id,
                                    &stream_tx,
                                    &app_handle,
                                )
                                .await;
                            }
                        }
                    }
                    "session/request_permission" => {
                        let jsonrpc_id = json_value
                            .get("id")
                            .and_then(|id| id.as_u64())
                            .unwrap_or(0);

                        if let Some(params) = json_value.get("params") {
                            if let Ok(perm_params) =
                                serde_json::from_value::<SessionRequestPermissionParams>(
                                    params.clone(),
                                )
                            {
                                // Store the pending permission for response (including options)
                                {
                                    let mut perm = pending_permission.lock().await;
                                    *perm = Some(PendingPermission {
                                        jsonrpc_id,
                                        options: perm_params.options.clone(),
                                    });
                                }

                                // Resolve tool name: prefer perm_params.tool_name, then last tracked tool name
                                let tool_name = perm_params
                                    .tool_name
                                    .clone()
                                    .or_else(|| last_tool_name.clone())
                                    .unwrap_or_else(|| "unknown".to_string());
                                let description = perm_params
                                    .description
                                    .clone()
                                    .unwrap_or_else(|| "Permission requested".to_string());

                                // Convert options to frontend format
                                let options_info: Vec<PermissionOptionInfo> = perm_params
                                    .options
                                    .iter()
                                    .map(|o| PermissionOptionInfo {
                                        kind: o.kind.clone(),
                                        name: o.name.clone(),
                                        option_id: o.option_id.clone(),
                                    })
                                    .collect();

                                let prompt = InteractionPrompt {
                                    session_id: session_id.clone(),
                                    prompt_type: "permission".to_string(),
                                    message: format!("{}: {}", tool_name, description),
                                    request_id: perm_params.request_id.clone(),
                                    tool_name: Some(tool_name),
                                    options: if options_info.is_empty() {
                                        None
                                    } else {
                                        Some(options_info)
                                    },
                                };

                                if let Err(e) =
                                    app_handle.emit("interaction-prompt", &prompt)
                                {
                                    eprintln!(
                                        "[ACP] Failed to emit interaction-prompt event: {}",
                                        e
                                    );
                                }
                            }
                        }
                    }
                    _ => {
                        println!("[ACP] Unhandled method: {}", method);
                    }
                }
            }
        }

        // EOF reached - clear pending requests so callers fail immediately instead of waiting for timeout
        {
            let mut pending = pending_requests.lock().await;
            pending.clear();
        }

        // Send completion signal
        println!("[ACP] Stdout reader EOF for session {}", session_id);
        let msg_id = current_message_id.lock().await.clone();
        let _ = stream_tx
            .send(StreamChunk {
                session_id: session_id.clone(),
                message_id: msg_id,
                content: String::new(),
                is_complete: true,
                chunk_type: None,
                tool_call: None,
            })
            .await;
    });
}

/// Spawn a stderr reader task for logging
/// Also monitors for fatal CLI errors and clears pending requests so callers fail immediately.
/// Detects `<local-command-stdout>` content and forwards it to the frontend as text chunks.
pub fn spawn_stderr_reader(
    stderr: tokio::process::ChildStderr,
    provider_name: String,
    pending_requests: PendingRequests,
    stream_tx: mpsc::Sender<StreamChunk>,
    session_id: String,
    current_message_id: Arc<Mutex<String>>,
) {
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        // Regex to extract content between <local-command-stdout> tags
        let tag_re = regex::Regex::new(r"<local-command-stdout>([\s\S]*?)</local-command-stdout>")
            .expect("invalid regex");

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[ACP:{}:stderr] {}", provider_name, line);

            // Detect fatal CLI exit and clear pending requests immediately
            if line.contains("CLI exited with code") {
                println!(
                    "[ACP:{}] Fatal CLI error detected, clearing pending requests",
                    provider_name
                );
                let mut pending = pending_requests.lock().await;
                pending.clear();
            }

            // Forward <local-command-stdout> content as text chunks
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
                            })
                            .await;
                    }
                }
            }
        }
    });
}

/// Send a JSON-RPC request and await the response
pub async fn send_and_await(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    request: JsonRpcRequest,
    timeout_secs: u64,
) -> AppResult<JsonRpcResponse> {
    let id = request.id;

    // Register the oneshot channel for the response
    let (tx, rx) = oneshot::channel();
    {
        let mut pending = pending_requests.lock().await;
        pending.insert(id, tx);
    }

    // Serialize and send the request
    let json_str = serde_json::to_string(&request)
        .map_err(|e| AppError::Provider(format!("Failed to serialize JSON-RPC request: {}", e)))?;

    stdin_tx.send(json_str).await.map_err(|e| {
        AppError::Provider(format!("Failed to send JSON-RPC request to stdin: {}", e))
    })?;

    // Await the response with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx).await {
        Ok(Ok(response)) => {
            if let Some(error) = &response.error {
                Err(AppError::Provider(format!(
                    "JSON-RPC error ({}): {}",
                    error.code, error.message
                )))
            } else {
                Ok(response)
            }
        }
        Ok(Err(_)) => Err(AppError::Provider(
            "ACP process exited unexpectedly. Check if the CLI is properly configured and the session is still valid.".to_string(),
        )),
        Err(_) => {
            // Clean up the pending request
            let mut pending = pending_requests.lock().await;
            pending.remove(&id);
            Err(AppError::Provider(format!(
                "Request timed out after {} seconds",
                timeout_secs
            )))
        }
    }
}

/// Result of an ACP handshake, including available models and agent capabilities
pub struct AcpHandshakeResult {
    pub session_id: String,
    pub models: Vec<ModelInfo>,
    pub current_model_id: Option<String>,
    pub initialize_result: InitializeResult,
}

/// Perform the ACP handshake: initialize (with retry) + session/new
pub async fn acp_handshake(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    cwd: &str,
) -> AppResult<AcpHandshakeResult> {
    // Step 1: Initialize with retry
    let initialize_result = acp_initialize(stdin_tx, pending_requests).await?;

    // Step 2: session/new with required cwd and mcpServers
    let session_request = JsonRpcRequest::new(
        2,
        "session/new",
        serde_json::json!({
            "cwd": cwd,
            "mcpServers": []
        }),
    );
    let session_response = send_and_await(stdin_tx, pending_requests, session_request, 30).await?;

    let session_result: SessionNewResult = serde_json::from_value(
        session_response.result.unwrap_or_default(),
    )
    .map_err(|e| AppError::Provider(format!("Failed to parse session/new result: {}", e)))?;

    println!(
        "[ACP] Session created with ACP session ID: {}",
        session_result.session_id
    );

    let current_model_id = session_result.models.current_model_id;
    let models = session_result
        .models
        .available_models
        .into_iter()
        .map(|m| ModelInfo {
            model_id: m.model_id,
            display_name: m.name,
            description: m.description,
        })
        .collect();

    Ok(AcpHandshakeResult {
        session_id: session_result.session_id,
        models,
        current_model_id,
        initialize_result,
    })
}

/// Perform the ACP handshake for resuming: initialize + session/load or session/resume.
///
/// - `is_new_process`: If true, this is a freshly spawned Agent process. `session/load` is used
///   because the Agent needs to restore the session from persistent storage (per ACP spec).
///   If the Agent doesn't support `loadSession` or `session/load` fails, falls back to `session/resume`.
/// - If false, the Agent process already has this session in memory (future use case), so
///   `session/resume` is used directly.
pub async fn acp_resume_handshake(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    acp_session_id: &str,
    cwd: &str,
    _provider_type: &ProviderType,
    is_new_process: bool,
) -> AppResult<AcpHandshakeResult> {
    // Step 1: Initialize with retry
    let initialize_result = acp_initialize(stdin_tx, pending_requests).await?;

    // Step 2: Decide between session/load and session/resume
    // session/load: Agent restores session from persistent storage and replays history
    // session/resume: Agent reconnects to an existing in-memory session
    let supports_load = initialize_result
        .agent_capabilities
        .as_ref()
        .map_or(false, |caps| caps.load_session);

    let params = serde_json::json!({
        "sessionId": acp_session_id,
        "cwd": cwd,
        "mcpServers": []
    });

    let (models, method_used) = if is_new_process && supports_load {
        // New process: try session/load first (Agent replays conversation history via session/update)
        let load_request = JsonRpcRequest::new(2, "session/load", params.clone());
        match send_and_await(stdin_tx, pending_requests, load_request, 60).await {
            Ok(_response) => {
                // session/load response result is null per spec
                println!("[ACP] Session loaded via session/load for {}", acp_session_id);
                (SessionResumeResult::default(), "session/load")
            }
            Err(e) => {
                // session/load failed — fallback to session/resume
                println!(
                    "[ACP] session/load failed for {}, falling back to session/resume: {}",
                    acp_session_id, e
                );
                let resume_request = JsonRpcRequest::new(3, "session/resume", params);
                let resume_response =
                    send_and_await(stdin_tx, pending_requests, resume_request, 30).await?;
                let resume_result: SessionResumeResult = serde_json::from_value(
                    resume_response.result.unwrap_or_default(),
                )
                .map_err(|e| {
                    AppError::Provider(format!("Failed to parse session/resume result: {}", e))
                })?;
                (resume_result, "session/resume (fallback from load)")
            }
        }
    } else {
        // Either not a new process or Agent doesn't support loadSession — use session/resume
        if is_new_process && !supports_load {
            println!(
                "[ACP] Agent does not support loadSession, using session/resume for {}",
                acp_session_id
            );
        }
        let resume_request = JsonRpcRequest::new(2, "session/resume", params);
        let resume_response =
            send_and_await(stdin_tx, pending_requests, resume_request, 30).await?;
        let resume_result: SessionResumeResult = serde_json::from_value(
            resume_response.result.unwrap_or_default(),
        )
        .map_err(|e| {
            AppError::Provider(format!("Failed to parse session/resume result: {}", e))
        })?;
        (resume_result, "session/resume")
    };

    println!(
        "[ACP] Session restored via {} with ACP session ID: {}",
        method_used, acp_session_id
    );

    let current_model_id = models.models.current_model_id;
    let model_list = models
        .models
        .available_models
        .into_iter()
        .map(|m| ModelInfo {
            model_id: m.model_id,
            display_name: m.name,
            description: m.description,
        })
        .collect();

    Ok(AcpHandshakeResult {
        session_id: acp_session_id.to_string(),
        models: model_list,
        current_model_id,
        initialize_result,
    })
}

/// The protocol version supported by this client
const CLIENT_PROTOCOL_VERSION: u32 = 1;

/// Shared ACP initialize step with retry
async fn acp_initialize(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
) -> AppResult<InitializeResult> {
    let init_params = InitializeParams {
        protocol_version: CLIENT_PROTOCOL_VERSION,
        client_capabilities: ClientCapabilities {
            fs: FileSystemCapabilities {
                read_text_file: false,
                write_text_file: false,
            },
            terminal: false,
        },
        client_info: Some(ClientInfo {
            name: "forkestra".to_string(),
            title: Some("Forkestra".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
        }),
    };

    let init_params_value = serde_json::to_value(init_params)
        .map_err(|e| AppError::Provider(format!("Failed to serialize init params: {}", e)))?;

    let mut last_error = None;
    for attempt in 1..=15 {
        let request = JsonRpcRequest::new(1, "initialize", init_params_value.clone());
        match send_and_await(stdin_tx, pending_requests, request, 10).await {
            Ok(response) => {
                println!("[ACP] Initialize succeeded on attempt {}", attempt);

                // Parse the initialize result
                let init_result: InitializeResult = serde_json::from_value(
                    response.result.unwrap_or_default(),
                )
                .map_err(|e| {
                    AppError::Provider(format!("Failed to parse initialize result: {}", e))
                })?;

                // Protocol version negotiation check
                if init_result.protocol_version != CLIENT_PROTOCOL_VERSION {
                    println!(
                        "[ACP] Warning: Agent returned protocol version {}, client supports {}",
                        init_result.protocol_version, CLIENT_PROTOCOL_VERSION
                    );
                    return Err(AppError::Provider(format!(
                        "Protocol version mismatch: agent supports v{}, client supports v{}",
                        init_result.protocol_version, CLIENT_PROTOCOL_VERSION
                    )));
                }

                // Log agent info if available
                if let Some(ref info) = init_result.agent_info {
                    println!(
                        "[ACP] Agent: {} v{}",
                        info.title.as_deref().unwrap_or(&info.name),
                        info.version.as_deref().unwrap_or("unknown")
                    );
                }

                // Log agent capabilities
                if let Some(ref caps) = init_result.agent_capabilities {
                    println!(
                        "[ACP] Agent capabilities: loadSession={}, prompt(image={}, audio={}, embeddedContext={})",
                        caps.load_session,
                        caps.prompt_capabilities.as_ref().map_or(false, |p| p.image),
                        caps.prompt_capabilities.as_ref().map_or(false, |p| p.audio),
                        caps.prompt_capabilities.as_ref().map_or(false, |p| p.embedded_context),
                    );
                }

                return Ok(init_result);
            }
            Err(e) => {
                println!(
                    "[ACP] Initialize attempt {} failed: {}. Retrying...",
                    attempt, e
                );
                last_error = Some(e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }

    Err(AppError::Provider(format!(
        "ACP initialize failed after 15 attempts: {}",
        last_error.map_or("unknown error".to_string(), |e| e.to_string())
    )))
}

/// Build a session/prompt JSON-RPC request
pub fn build_prompt_request(
    request_id: u64,
    acp_session_id: &str,
    message: &str,
) -> AppResult<JsonRpcRequest> {
    let prompt_params = SessionPromptParams {
        session_id: acp_session_id.to_string(),
        prompt: vec![ContentBlock::Text {
            text: message.to_string(),
        }],
    };

    let params_value = serde_json::to_value(prompt_params)
        .map_err(|e| AppError::Provider(format!("Failed to serialize prompt params: {}", e)))?;

    Ok(JsonRpcRequest::new(
        request_id,
        "session/prompt",
        params_value,
    ))
}

/// Build a permission response JSON-RPC message with the selected option ID
pub fn build_permission_response(jsonrpc_id: u64, option_id: &str) -> String {
    let response = serde_json::json!({
        "jsonrpc": "2.0",
        "id": jsonrpc_id,
        "result": {
            "optionId": option_id,
        }
    });
    serde_json::to_string(&response).unwrap_or_default()
}

/// Send session/cancel to gracefully stop the current prompt.
/// Returns Ok(()) if the cancel was acknowledged, Err if it failed or timed out.
pub async fn cancel_session(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    session_id: &str,
    request_id: u64,
) -> AppResult<()> {
    let request = JsonRpcRequest::new(
        request_id,
        "session/cancel",
        serde_json::json!({
            "sessionId": session_id,
        }),
    );

    send_and_await(stdin_tx, pending_requests, request, 10).await?;

    println!("[ACP] Session cancel acknowledged for {}", session_id);
    Ok(())
}

/// Set the model for a session using the session/set_model JSON-RPC method
pub async fn set_session_model(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    session_id: &str,
    model_id: &str,
) -> AppResult<()> {
    let request = JsonRpcRequest::new(
        3,
        "session/set_model",
        serde_json::json!({
            "sessionId": session_id,
            "modelId": model_id
        }),
    );

    send_and_await(stdin_tx, pending_requests, request, 30).await?;

    println!(
        "[ACP] Session model set to: {} for session {}",
        model_id, session_id
    );

    Ok(())
}

/// Handle a session/update notification by parsing the raw JSON `update` object directly.
/// This avoids serde internally-tagged enum issues where optional fields may fail to deserialize.
async fn handle_session_update_raw(
    update: &serde_json::Value,
    session_id: &str,
    message_id: &str,
    stream_tx: &mpsc::Sender<StreamChunk>,
    app_handle: &AppHandle,
) {
    let update_type = match update.get("sessionUpdate").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => {
            println!("[ACP] session/update missing sessionUpdate field");
            return;
        }
    };

    match update_type {
        "agent_message_chunk" => {
            if let Some(text) = update
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
            {
                let _ = stream_tx
                    .send(StreamChunk {
                        session_id: session_id.to_string(),
                        message_id: message_id.to_string(),
                        content: text.to_string(),
                        is_complete: false,
                        chunk_type: Some(StreamChunkType::Text),
                        tool_call: None,
                    })
                    .await;
            }
        }
        "agent_thought_chunk" => {
            if let Some(text) = update
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
            {
                let _ = stream_tx
                    .send(StreamChunk {
                        session_id: session_id.to_string(),
                        message_id: message_id.to_string(),
                        content: text.to_string(),
                        is_complete: false,
                        chunk_type: Some(StreamChunkType::Thinking),
                        tool_call: None,
                    })
                    .await;
            }
        }
        "tool_call" => {
            let tool_call_id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let meta = update.get("_meta");
            let claude_code = meta.and_then(|m| m.get("claudeCode"));
            let tool_response = claude_code.and_then(|cc| cc.get("toolResponse"));
            let has_tool_response = tool_response.is_some();

            // Determine status
            let status_str = match update.get("status").and_then(|v| v.as_str()) {
                Some("pending") | Some("running") | Some("in_progress") => "running",
                Some("completed") => "completed",
                Some("error") | Some("failed") => "error",
                _ if has_tool_response => "completed",
                _ => "running",
            };

            let title_str = update
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Resolve tool name: prefer _meta.claudeCode.toolName, then top-level toolName
            let resolved_tool_name = claude_code
                .and_then(|cc| cc.get("toolName"))
                .and_then(|v| v.as_str())
                .or_else(|| update.get("toolName").and_then(|v| v.as_str()))
                .map(|s| s.to_string());

            // Extract content from toolResponse or from content field
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
                update.get("content").and_then(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s.to_string())
                    } else if v.is_array() {
                        v.as_array().and_then(|arr| {
                            let texts: Vec<String> = arr
                                .iter()
                                .filter_map(|item| {
                                    item.get("text")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string())
                                })
                                .collect();
                            if texts.is_empty() {
                                None
                            } else {
                                Some(texts.join("\n"))
                            }
                        })
                    } else {
                        None
                    }
                })
            };

            // Extract rawInput for tool call parameters
            let raw_input = update.get("rawInput").cloned();

            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: String::new(),
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::ToolCall),
                    tool_call: Some(ToolCallInfo {
                        tool_call_id,
                        tool_name: resolved_tool_name,
                        status: status_str.to_string(),
                        title: title_str,
                        content: content_str,
                        raw_input,
                    }),
                })
                .await;
        }
        "tool_call_update" => {
            // Tool call status update - also parse manually
            let tool_call_id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let status_str = match update.get("status").and_then(|v| v.as_str()) {
                Some("pending") | Some("running") | Some("in_progress") => "running",
                Some("completed") => "completed",
                Some("error") | Some("failed") => "error",
                _ => "running",
            };

            let content_str = update.get("content").and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else if v.is_array() {
                    v.as_array().and_then(|arr| {
                        let texts: Vec<String> = arr
                            .iter()
                            .filter_map(|item| {
                                item.get("text")
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect();
                        if texts.is_empty() {
                            None
                        } else {
                            Some(texts.join("\n"))
                        }
                    })
                } else {
                    None
                }
            });

            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: String::new(),
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::ToolCall),
                    tool_call: Some(ToolCallInfo {
                        tool_call_id,
                        tool_name: None,
                        status: status_str.to_string(),
                        title: String::new(),
                        content: content_str,
                        raw_input: None,
                    }),
                })
                .await;
        }
        "available_commands_update" => {
            let commands: Vec<AvailableCommand> = update
                .get("availableCommands")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            println!(
                "[ACP] Received available_commands_update with {} commands",
                commands.len()
            );

            // Store commands on the session so they survive frontend refreshes
            if let Some(manager) = app_handle.try_state::<SessionManager>() {
                manager.update_session_commands(session_id, commands.clone()).await;
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
        "mode_update" => {
            println!("[ACP] Received mode_update");
        }
        _ => {
            println!("[ACP] Received unknown session update type: {}", update_type);
        }
    }
}

/// Build the clean environment for spawning ACP processes.
/// Cleans up Node debug-related env vars that may interfere.
pub fn build_clean_env() -> HashMap<String, String> {
    build_clean_env_with_custom(HashMap::new())
}

pub fn build_clean_env_with_custom(
    custom_env: HashMap<String, String>,
) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    env.remove("NODE_OPTIONS");
    env.remove("NODE_INSPECT");
    env.remove("NODE_DEBUG");

    // Set shell PATH so GUI-launched apps can find user-installed tools
    if let Some(shell_path) = crate::providers::ProviderDetector::get_shell_path() {
        env.insert("PATH".to_string(), shell_path);
    }

    // Set CLAUDE_CONFIG_DIR to match the actual config directory used by the system
    // Claude Code ACP defaults to ~/.claude, but the actual config may be elsewhere
    if let Ok(home) = std::env::var("HOME") {
        // Check if ~/.claude-internal exists (custom config directory)
        let claude_internal = format!("{}/.claude-internal", home);
        if std::path::Path::new(&claude_internal).exists() {
            env.insert("CLAUDE_CONFIG_DIR".to_string(), claude_internal);
        }
    }

    // Merge user-configured environment variables (these take precedence)
    for (key, value) in custom_env {
        env.insert(key, value);
    }

    env
}
