use std::collections::HashMap;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    ClientCapabilities, ContentBlock, FileSystemCapabilities, InitializeParams, InteractionPrompt,
    JsonRpcRequest, JsonRpcResponse, PendingPermission, SessionNewResult, SessionPromptParams,
    SessionRequestPermissionParams, SessionUpdate, SessionUpdateParams, StreamChunk,
    StreamChunkType, ToolCallInfo,
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
    message_id: String,
) {
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }

            let json_value: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => {
                    // Not a JSON line, skip (e.g., npx output, warnings)
                    println!("[ACP] Non-JSON line: {}", &line[..line.len().min(200)]);
                    continue;
                }
            };

            // Debug: log every JSON-RPC message received
            println!("[ACP:stdout] {}", &line[..line.len().min(500)]);

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
                                let _ = stream_tx
                                    .send(StreamChunk {
                                        session_id: session_id.clone(),
                                        message_id: message_id.clone(),
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
                            match serde_json::from_value::<SessionUpdateParams>(params.clone()) {
                                Ok(update_params) => {
                                    handle_session_update(
                                        &update_params.update,
                                        &session_id,
                                        &message_id,
                                        &stream_tx,
                                    )
                                    .await;
                                }
                                Err(e) => {
                                    println!(
                                        "[ACP] Failed to deserialize session/update params: {}. Raw: {}",
                                        e,
                                        &params.to_string()[..params.to_string().len().min(300)]
                                    );
                                }
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
                                // Store the pending permission for response
                                {
                                    let mut perm = pending_permission.lock().await;
                                    *perm = Some(PendingPermission { jsonrpc_id });
                                }

                                let tool_name = perm_params
                                    .tool_name
                                    .clone()
                                    .unwrap_or_else(|| "unknown".to_string());
                                let description = perm_params
                                    .description
                                    .clone()
                                    .unwrap_or_else(|| "Permission requested".to_string());

                                let prompt = InteractionPrompt {
                                    session_id: session_id.clone(),
                                    prompt_type: "permission".to_string(),
                                    message: format!("{}: {}", tool_name, description),
                                    request_id: perm_params.request_id.clone(),
                                    tool_name: Some(tool_name),
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

        // EOF reached - send completion signal
        println!("[ACP] Stdout reader EOF for session {}", session_id);
        let _ = stream_tx
            .send(StreamChunk {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
                content: String::new(),
                is_complete: true,
                chunk_type: None,
                tool_call: None,
            })
            .await;
    });
}

/// Spawn a stderr reader task for logging
pub fn spawn_stderr_reader(stderr: tokio::process::ChildStderr, provider_name: String) {
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[ACP:{}:stderr] {}", provider_name, line);
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
            "Response channel closed unexpectedly".to_string(),
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

/// Perform the ACP handshake: initialize (with retry) + session/new
pub async fn acp_handshake(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    cwd: &str,
) -> AppResult<String> {
    // Step 1: Initialize with retry
    acp_initialize(stdin_tx, pending_requests).await?;

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

    Ok(session_result.session_id)
}

/// Perform the ACP handshake for resuming: initialize (with retry) + unstable_resumeSession
pub async fn acp_resume_handshake(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
    acp_session_id: &str,
    cwd: &str,
) -> AppResult<String> {
    // Step 1: Initialize with retry
    acp_initialize(stdin_tx, pending_requests).await?;

    // Step 2: unstable_resumeSession
    let resume_request = JsonRpcRequest::new(
        2,
        "unstable_resumeSession",
        serde_json::json!({
            "sessionId": acp_session_id,
            "cwd": cwd,
            "mcpServers": []
        }),
    );
    let resume_response = send_and_await(stdin_tx, pending_requests, resume_request, 30).await?;

    let session_result: SessionNewResult = serde_json::from_value(
        resume_response.result.unwrap_or_default(),
    )
    .map_err(|e| {
        AppError::Provider(format!(
            "Failed to parse unstable_resumeSession result: {}",
            e
        ))
    })?;

    println!(
        "[ACP] Session resumed with ACP session ID: {}",
        session_result.session_id
    );

    Ok(session_result.session_id)
}

/// Shared ACP initialize step with retry
async fn acp_initialize(
    stdin_tx: &mpsc::Sender<String>,
    pending_requests: &PendingRequests,
) -> AppResult<()> {
    let init_params = InitializeParams {
        protocol_version: 1,
        client_capabilities: ClientCapabilities {
            fs: FileSystemCapabilities {
                read_text_file: false,
                write_text_file: false,
            },
        },
    };

    let init_params_value = serde_json::to_value(init_params)
        .map_err(|e| AppError::Provider(format!("Failed to serialize init params: {}", e)))?;

    let mut last_error = None;
    for attempt in 1..=15 {
        let request = JsonRpcRequest::new(1, "initialize", init_params_value.clone());
        match send_and_await(stdin_tx, pending_requests, request, 10).await {
            Ok(_response) => {
                println!("[ACP] Initialize succeeded on attempt {}", attempt);
                last_error = None;
                break;
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

    if let Some(e) = last_error {
        return Err(AppError::Provider(format!(
            "ACP initialize failed after 15 attempts: {}",
            e
        )));
    }

    Ok(())
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

/// Build a permission response JSON-RPC message
pub fn build_permission_response(jsonrpc_id: u64, granted: bool) -> String {
    let response = serde_json::json!({
        "jsonrpc": "2.0",
        "id": jsonrpc_id,
        "result": {
            "granted": granted,
        }
    });
    serde_json::to_string(&response).unwrap_or_default()
}

/// Handle a session/update notification by routing to the appropriate StreamChunk
async fn handle_session_update(
    update: &SessionUpdate,
    session_id: &str,
    message_id: &str,
    stream_tx: &mpsc::Sender<StreamChunk>,
) {
    match update {
        SessionUpdate::AgentMessageChunk { content } => {
            if let ContentBlock::Text { text } = content {
                let _ = stream_tx
                    .send(StreamChunk {
                        session_id: session_id.to_string(),
                        message_id: message_id.to_string(),
                        content: text.clone(),
                        is_complete: false,
                        chunk_type: Some(StreamChunkType::Text),
                        tool_call: None,
                    })
                    .await;
            }
        }
        SessionUpdate::AgentThoughtChunk { content } => {
            if let ContentBlock::Text { text } = content {
                let _ = stream_tx
                    .send(StreamChunk {
                        session_id: session_id.to_string(),
                        message_id: message_id.to_string(),
                        content: text.clone(),
                        is_complete: false,
                        chunk_type: Some(StreamChunkType::Thinking),
                        tool_call: None,
                    })
                    .await;
            }
        }
        SessionUpdate::ToolCall {
            tool_call_id,
            status,
            title,
            content,
            tool_name,
            ..
        } => {
            let status_str = match status {
                crate::models::ToolCallStatus::Running
                | crate::models::ToolCallStatus::InProgress => "running",
                crate::models::ToolCallStatus::Completed => "completed",
                crate::models::ToolCallStatus::Error
                | crate::models::ToolCallStatus::Failed => "error",
            };

            let display_content = content
                .as_ref()
                .map(|c| format!("\n{}: {}\n", title, c))
                .unwrap_or_else(|| format!("\n{}\n", title));

            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id.to_string(),
                    message_id: message_id.to_string(),
                    content: display_content,
                    is_complete: false,
                    chunk_type: Some(StreamChunkType::ToolCall),
                    tool_call: Some(ToolCallInfo {
                        tool_call_id: tool_call_id.clone(),
                        tool_name: tool_name.clone(),
                        status: status_str.to_string(),
                        title: title.clone(),
                        content: content.clone(),
                    }),
                })
                .await;
        }
        SessionUpdate::ToolCallUpdate { .. } => {
            // Tool call updates are handled by the tool_call variant above
            // via status transitions. Log for debugging.
            println!("[ACP] Received tool_call_update (handled via tool_call status)");
        }
        SessionUpdate::AvailableCommandsUpdate { .. } => {
            // Informational only, no action needed
            println!("[ACP] Received available_commands_update");
        }
        SessionUpdate::ModeUpdate { .. } => {
            println!("[ACP] Received mode_update");
        }
        SessionUpdate::Unknown => {
            println!("[ACP] Received unknown session update type");
        }
    }
}

/// Build the clean environment for spawning ACP processes.
/// Cleans up Node debug-related env vars that may interfere.
pub fn build_clean_env() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    env.remove("NODE_OPTIONS");
    env.remove("NODE_INSPECT");
    env.remove("NODE_DEBUG");

    // Set shell PATH so GUI-launched apps can find user-installed tools
    if let Some(shell_path) = crate::providers::ProviderDetector::get_shell_path() {
        env.insert("PATH".to_string(), shell_path);
    }

    env
}
