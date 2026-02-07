# Gemini CLI Desktop

Github: [Piebald-AI/gemini-cli-desktop](https://github.com/Piebald-AI/gemini-cli-desktop)

应用通过启动 Gemini CLI 子进程并使用 ACP（JSON-RPC 2.0）与其 stdin/stdout 通信，流程包括初始化握手、认证、发送消息并接收事件更新。 [1](#1-0) [2](#1-1) [3](#1-2)

### 通信流程

1. **启动 CLI 与环境准备**：根据认证方式（API Key/Vertex AI/OAuth）设置环境变量，然后启动 `gemini --model <model> --experimental-acp` 子进程，并建立 stdin/stdout 通道。 [4](#1-3) [5](#1-4)
2. **ACP 握手**：
   - `initialize`：发送协议版本与客户端能力，重试直到收到响应。 [6](#1-5)
   - `authenticate`（如需要）：根据配置选择认证方法（gemini-api-key/vertex-ai/oauth-personal）并发送认证请求。 [7](#1-6)
   - `session/new`：创建 ACP 会话并保存会话 ID。 [8](#1-7)
3. **发送消息**：将用户输入转为 ACP ContentBlock，构造 `session/prompt` 的 JSON-RPC 请求并通过消息通道发送到 CLI stdin。 [9](#1-8)
4. **接收事件**：后台任务持续解析 CLI stdout，将 `session/update`（工具调用/思考块/输出）转为 `InternalEvent` 并通过 EventEmitter 发送到前端。 [10](#1-9) [11](#1-10)

### 关键组件

- **SessionEnvironment**：RAII 管理认证相关的环境变量，支持多种 Gemini 认证方式。 [4](#1-3)
- **send_jsonrpc_request**：通过 stdin 发送请求并从 stdout 读取响应的通用函数。 [12](#1-11)
- **GeminiBackend::send_message**：构造 ACP prompt 请求并投递到会话的消息通道。 [3](#1-2)

## Notes

- 与 Qwen/LLxprt 共用同一套 ACP 流程，仅启动命令与认证配置不同。 [13](#1-12)
- 前端通过 EventEmitter 接收 `acp-session-update-{id}` 等事件实现实时更新。 [14](#1-13)

Wiki pages you might want to explore:

- [System Architecture (Piebald-AI/gemini-cli-desktop)](/wiki/Piebald-AI/gemini-cli-desktop#2)
- [Tool Call Workflow (Piebald-AI/gemini-cli-desktop)](/wiki/Piebald-AI/gemini-cli-desktop#5.3)

### Citations

**File:** crates/backend/src/session/mod.rs (L140-172)

```rust
    fn setup_gemini(auth: &GeminiAuthConfig) -> Result<Self> {
        let mut guards = Vec::new();

        match auth.method.as_str() {
            "gemini-api-key" => {
                if let Some(api_key) = &auth.api_key {
                    guards.push(EnvVarGuard::new("GEMINI_API_KEY", api_key));
                    println!("🔧 [HANDSHAKE] Set GEMINI_API_KEY");
                } else {
                    println!("⚠️ [HANDSHAKE] No API key provided for gemini-api-key auth method");
                }
            }
            "vertex-ai" => {
                if let Some(project) = &auth.vertex_project {
                    guards.push(EnvVarGuard::new("GOOGLE_CLOUD_PROJECT", project));
                    println!("🔧 [HANDSHAKE] Set GOOGLE_CLOUD_PROJECT: {}", project);
                }
                if let Some(location) = &auth.vertex_location {
                    guards.push(EnvVarGuard::new("GOOGLE_CLOUD_LOCATION", location));
                    println!("🔧 [HANDSHAKE] Set GOOGLE_CLOUD_LOCATION: {}", location);
                }
            }
            _ => {
                println!(
                    "🔧 [HANDSHAKE] Using auth method: {} (no env vars needed)",
                    auth.method
                );
            }
        }

        Ok(Self { _guards: guards })
    }
}
```

**File:** crates/backend/src/session/mod.rs (L174-197)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QwenConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub yolo: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiAuthConfig {
    pub method: String, // "oauth-personal", "gemini-api-key", "vertex-ai", or "cloud-shell"
    pub api_key: Option<String>,
    pub vertex_project: Option<String>,
    pub vertex_location: Option<String>,
    pub yolo: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLxprtConfig {
    pub provider: String, // "openai", "anthropic", "gemini", "qwen", "openrouter", etc.
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>, // For custom/self-hosted providers
}
```

**File:** crates/backend/src/session/mod.rs (L875-891)

```rust
    let mut child = cmd.spawn().map_err(|e| {
        println!("❌ [HANDSHAKE] Failed to spawn {} process: {e}", cli_name);
        #[cfg(windows)]
        {
            anyhow::anyhow!(
                "Session initialization failed: Failed to run {} command via cmd: {e}",
                cli_name
            )
        }
        #[cfg(not(windows))]
        {
            anyhow::anyhow!(
                "Session initialization failed: Failed to run {} command via shell: {e}",
                cli_name
            )
        }
    })?;
```

**File:** crates/backend/src/session/mod.rs (L937-1008)

```rust
    println!("📡 [HANDSHAKE] Set up stdin/stdout/stderr communication channels");

    // Step 1: Initialize
    let _ = event_tx.send(InternalEvent::SessionProgress {
        session_id: session_id.clone(),
        payload: SessionProgressPayload {
            stage: SessionProgressStage::Initializing,
            message: "Initializing ACP protocol".to_string(),
            progress_percent: Some(40),
            details: Some("Establishing communication protocol with CLI".to_string()),
        },
    });
    println!("🤝 [HANDSHAKE] Step 1/3: Sending initialize request");
    let init_params = InitializeParams {
        protocol_version: 1,
        client_capabilities: ClientCapabilities {
            fs: FileSystemCapabilities {
                read_text_file: false,
                write_text_file: false,
            },
        },
    };
    println!("🤝 [HANDSHAKE] Initialize params: protocol_version=1");

    let init_request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: 1,
        method: "initialize".to_string(),
        params: serde_json::to_value(init_params).context("Failed to serialize init params")?,
    };

    // { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1, "clientCapabilities": { "fs": { "readTextFile": true, "writeTextFile": true } } } }

    // The initialize message may end up getting sent before Gemini has fully started up, so we'll
    // loop and sleep for a short time until we get a JSON response back from Gemini.
    let init_response;
    let mut retries = 0;
    // Increased from 5 to 20 retries to allow for longer Gemini startup times
    const MAX_RETRIES: u32 = 20;
    loop {
        retries += 1;
        if retries == MAX_RETRIES {
            anyhow::bail!("Max number of retries reached");
        }
        let init_response_result = send_jsonrpc_request(
            &init_request,
            &mut stdin,
            &mut reader,
            &session_id,
            &emitter,
            &rpc_logger,
        )
        .await
        .map_err(|e| {
            println!("❌ [HANDSHAKE] Initialize request failed: {e}");
            e
        });

        // `None` indicates that we haven't gotten any JSON response from Gemini yet.
        match init_response_result {
            Ok(None) => {
                println!("No response received yet; sending again");
                sleep(Duration::from_secs(2)).await;
            }
            Ok(Some(res)) => {
                init_response = res;
                break;
            }
            Err(e) => return Err(e),
        }
    }

```

**File:** crates/backend/src/session/mod.rs (L1054-1123)

```rust
            // Step 3: Authenticate - choose method based on configuration
            let _ = event_tx.send(InternalEvent::SessionProgress {
                session_id: session_id.clone(),
                payload: SessionProgressPayload {
                    stage: SessionProgressStage::Authenticating,
                    message: "Authenticating with AI service".to_string(),
                    progress_percent: Some(65),
                    details: Some(
                        "Verifying credentials and establishing authenticated session".to_string(),
                    ),
                },
            });
            println!("🔐 [HANDSHAKE] Step 3/3: Determining authentication method");
            let auth_method_id = if let Some(auth) = &gemini_auth {
                println!("🔐 [HANDSHAKE] Using provided auth method: {}", auth.method);
                auth.method.clone()
            } else if llxprt_config.is_some() {
                println!("🔐 [HANDSHAKE] Using gemini-api-key auth for LLxprt backend");
                // LLxprt uses API key auth
                "gemini-api-key".to_string()
            } else if backend_config.is_some() {
                println!("🔐 [HANDSHAKE] Using gemini-api-key auth for Qwen backend");
                // Qwen uses API key auth
                "gemini-api-key".to_string()
            } else {
                println!("🔐 [HANDSHAKE] Using default oauth-personal auth method");
                // Default to OAuth for Gemini if no config provided
                "oauth-personal".to_string()
            };

            let auth_params = AuthenticateParams {
                method_id: auth_method_id.clone(),
            };
            println!("🔐 [HANDSHAKE] Sending authenticate request with method: {auth_method_id}");

            let auth_request = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: 2,
                method: "authenticate".to_string(),
                params: serde_json::to_value(auth_params)
                    .context("Failed to serialize auth params")?,
            };

            let _auth_response = send_jsonrpc_request(
                &auth_request,
                &mut stdin,
                &mut reader,
                &session_id,
                &emitter,
                &rpc_logger,
            )
            .await
            .map_err(|e| {
                println!("❌ [HANDSHAKE] Authentication request failed: {e}");
                e
            })?;

            println!(
                "✅ [HANDSHAKE] Step 3/3: Authentication completed successfully for: {session_id}"
            );

            session_response = send_jsonrpc_request(
                &session_request,
                &mut stdin,
                &mut reader,
                &session_id,
                &emitter,
                &rpc_logger,
            )
            .await;
```

**File:** crates/backend/src/session/mod.rs (L1130-1144)

```rust
    let session_response = session_response?;

    let session_result: SessionNewResult = if let Some(result) = session_response {
        serde_json::from_value(result.result.unwrap_or_default())
            .context("Failed to parse session result")?
    } else {
        anyhow::bail!(
            "No valid JSON response received from Gemini CLI initialize request. This usually indicates:\n1. Gemini CLI is not properly installed or not in PATH\n2. Authentication failed (check API keys or OAuth setup)\n3. Network connectivity issues\n4. CLI process crashed or failed to start\n\nPlease check the console output above for more details."
        );
    };

    println!(
        "✅ [HANDSHAKE] Step 3/3: ACP session created successfully with ID: {}",
        session_result.session_id
    );
```

**File:** crates/backend/src/session/mod.rs (L1437-1496)

```rust
                                            payload: GeminiOutputPayload { text },
                                        });
                                    }
                                    _ => {
                                        // Handle other content types as needed
                                        println!("Received non-text content block: {content:?}");
                                    }
                                }
                            }
                            SessionUpdate::AgentThoughtChunk { content } => {
                                match content {
                                    ContentBlock::Text { text } => {
                                        let _ = event_tx.send(InternalEvent::GeminiThought {
                                            session_id: session_id.to_string(),
                                            payload: GeminiThoughtPayload { thought: text },
                                        });
                                    }
                                    _ => {
                                        // Handle other content types as needed
                                        println!(
                                            "Received non-text thought content block: {content:?}"
                                        );
                                    }
                                }
                            }
                            SessionUpdate::ToolCall {
                                tool_call_id,
                                status,
                                title,
                                content,
                                locations,
                                kind,
                                server_name,
                                tool_name,
                            } => {
                                println!(
                                    "🔧 [EDIT-DEBUG] Backend received ToolCall from CLI: tool_call_id={tool_call_id}, status={status:?}, title={title}"
                                );

                                // Emit pure ACP SessionUpdate event - no legacy conversion
                                let emit_result = event_tx.send(InternalEvent::AcpSessionUpdate {
                                    session_id: session_id.to_string(),
                                    update: SessionUpdate::ToolCall {
                                        tool_call_id: tool_call_id.clone(),
                                        status: status.clone(),
                                        title: title.clone(),
                                        content: content.clone(),
                                        locations: locations.clone(),
                                        kind: kind.clone(),
                                        server_name: server_name.clone(),
                                        tool_name: tool_name.clone(),
                                    },
                                });

                                if emit_result.is_err() {
                                    println!(
                                        "🔧 [EDIT-DEBUG] Failed to send ToolCall event: {emit_result:?}"
                                    );
                                } else {
                                    println!(
```

**File:** crates/backend/src/session/mod.rs (L1557-1585)

```rust
                            request_id: id,
                            request: params,
                        });
                        println!(
                            "🔔 BACKEND: Sent InternalEvent::AcpPermissionRequest to event_tx"
                        );
                    } else {
                        // Try to get the specific parsing error
                        let parse_result = serde_json::from_value::<SessionRequestPermissionParams>(
                            json_value.get("params").cloned().unwrap_or_default(),
                        );
                        println!(
                            "❌ BACKEND: Failed to parse session/request_permission params: {:?}",
                            parse_result.err()
                        );
                    }
                }
                _ => {}
            }
        } else if json_value.get("result").is_some() {
            // Handle JSON-RPC responses (as opposed to notifications)
            if let Ok(result) = serde_json::from_value::<SessionPromptResult>(
                json_value.get("result").cloned().unwrap_or_default(),
            ) && result.stop_reason == "end_turn"
            {
                let _ = event_tx.send(InternalEvent::GeminiTurnFinished {
                    session_id: session_id.to_string(),
                });
            }
```

**File:** crates/backend/src/lib.rs (L99-117)

```rust
    /// Emit Gemini output event
    pub fn emit_gemini_output(&self, session_id: &str, text: &str) -> Result<()> {
        let payload = GeminiOutputPayload {
            text: text.to_string(),
        };
        self.emitter
            .emit(&format!("gemini-output-{session_id}"), payload)
            .context("Failed to emit Gemini output event")
    }

    /// Emit Gemini thought event
    pub fn emit_gemini_thought(&self, session_id: &str, thought: &str) -> Result<()> {
        let payload = GeminiThoughtPayload {
            thought: thought.to_string(),
        };
        self.emitter
            .emit(&format!("gemini-thought-{session_id}"), payload)
            .context("Failed to emit Gemini thought event")
    }
```

**File:** crates/backend/src/lib.rs (L256-328)

```rust
    /// Send a message to an existing session
    pub async fn send_message(
        &self,
        session_id: String,
        message: String,
        _conversation_history: String,
    ) -> Result<()> {
        println!("📤 Sending message to session: {session_id}");

        let (message_sender, acp_session_id) = {
            let processes = self.session_manager.get_processes();
            let processes = processes
                .lock()
                .map_err(|_| anyhow::anyhow!("Failed to lock processes mutex"))?;

            if let Some(session) = processes.get(&session_id) {
                (
                    session.message_sender.clone(),
                    session.acp_session_id.clone(),
                )
            } else {
                anyhow::bail!("Session not found: {}", session_id);
            }
        };

        let message_sender = message_sender.context("No message sender available")?;

        let acp_session_id = acp_session_id.context("No ACP session ID available")?;

        // Get working directory from session
        let working_directory = {
            let processes = self.session_manager.get_processes();
            let processes = processes.lock().unwrap();

            processes
                .get(&session_id)
                .map(|s| s.working_directory.clone())
                .unwrap_or_else(|| ".".to_string())
        };

        // Parse @-mentions and create ACP prompt content blocks
        let prompt_blocks = self.parse_mentions_to_content_blocks(&message, &working_directory);
        let prompt_params = SessionPromptParams {
            session_id: acp_session_id.clone(),
            prompt: prompt_blocks.clone(),
        };

        let request_id = {
            let mut id_guard = self.next_request_id.lock().unwrap();
            let id = *id_guard;
            *id_guard += 1;
            id
        };

        let params_value =
            serde_json::to_value(prompt_params).context("Failed to serialize prompt params")?;
        let prompt_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: request_id,
            method: "session/prompt".to_string(),
            params: params_value,
        };

        let request_json =
            serde_json::to_string(&prompt_request).context("Failed to serialize prompt request")?;

        message_sender
            .send(request_json)
            .context("Failed to send message through channel")?;

        println!("✅ ACP session/prompt sent to session: {session_id}");
        Ok(())
    }
```
