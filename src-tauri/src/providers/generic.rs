use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    ModeInfo, ModelInfo, PromptContent, ProviderDefinition, ProviderInfo, ProviderSettings,
    ProviderType, StreamChunk,
};
use crate::providers::acp_client_sdk::{
    build_clean_env_with_custom, spawn_acp_connection, spawn_acp_resume_connection,
    spawn_stderr_reader, AcpCommand,
};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct GenericAcpAdapter {
    provider_type: ProviderType,
    provider_name: String,
    command: String,
    args: Vec<String>,
    child: Option<tokio::process::Child>,
    cmd_tx: Option<mpsc::Sender<AcpCommand>>,
    acp_session_id: Option<String>,
    session_id: Option<String>,
    current_message_id: Arc<Mutex<String>>,
    is_active: bool,
    env_vars: HashMap<String, String>,
    available_models: Vec<ModelInfo>,
    current_model_id: Option<String>,
    available_modes: Vec<ModeInfo>,
    current_mode_id: Option<String>,
    config_options: Vec<agent_client_protocol::SessionConfigOption>,
}

impl GenericAcpAdapter {
    /// Create a new adapter from a provider definition and optional user settings.
    pub fn new(def: &ProviderDefinition, settings: Option<&ProviderSettings>) -> Self {
        // Start with the definition's default env vars
        let mut env_vars = def.env.clone();

        // Determine the effective command
        let command = if let Some(s) = settings {
            if let Some(ref custom) = s.custom_cli_path {
                // Claude backward-compat: when user sets a custom CLI path for Claude,
                // the npx wrapper needs the CLAUDE_CODE_EXECUTABLE env var.
                if def.id == "claude" {
                    let resolved = ProviderDetector::find_in_path(custom)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| custom.clone());
                    env_vars.insert("CLAUDE_CODE_EXECUTABLE".to_string(), resolved);
                    def.command.clone() // still use npx
                } else if def.command == "npx" {
                    // For npx-based providers, custom_cli_path doesn't change the command
                    def.command.clone()
                } else {
                    custom.clone()
                }
            } else {
                def.command.clone()
            }
        } else {
            def.command.clone()
        };

        // Merge user env vars (overrides definition defaults)
        if let Some(s) = settings {
            for (k, v) in &s.env_vars {
                env_vars.insert(k.clone(), v.clone());
            }
        }

        Self {
            provider_type: ProviderType::from_id(&def.id),
            provider_name: def.name.clone(),
            command,
            args: def.args.clone(),
            child: None,
            cmd_tx: None,
            acp_session_id: None,
            session_id: None,
            current_message_id: Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string())),
            is_active: false,
            env_vars,
            available_models: vec![],
            current_model_id: None,
            available_modes: vec![],
            current_mode_id: None,
            config_options: vec![],
        }
    }

    /// Spawn the ACP process. Returns (child, stdin, stdout, stderr).
    fn spawn_process(
        &self,
        worktree_path: &Path,
    ) -> AppResult<(
        tokio::process::Child,
        tokio::process::ChildStdin,
        tokio::process::ChildStdout,
        tokio::process::ChildStderr,
    )> {
        let env = build_clean_env_with_custom(self.env_vars.clone());

        let resolved_cmd = ProviderDetector::find_in_path(&self.command)
            .unwrap_or_else(|| std::path::PathBuf::from(&self.command));

        println!(
            "[{}] Executing command: {} {:?}",
            self.provider_name,
            resolved_cmd.display(),
            self.args
        );
        println!("  Working directory: {}", worktree_path.display());

        let mut child = tokio::process::Command::new(&resolved_cmd)
            .args(&self.args)
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(&env)
            .spawn()
            .map_err(|e| {
                AppError::Provider(format!(
                    "Failed to spawn {} {:?}: {}",
                    resolved_cmd.display(),
                    self.args,
                    e
                ))
            })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Provider("Failed to get stdin handle".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Provider("Failed to get stdout handle".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Provider("Failed to get stderr handle".to_string()))?;

        Ok((child, stdin, stdout, stderr))
    }
}

#[async_trait]
impl ProviderAdapter for GenericAcpAdapter {
    fn provider_type(&self) -> ProviderType {
        self.provider_type.clone()
    }

    fn detect(&self) -> AppResult<ProviderInfo> {
        Ok(ProviderDetector::detect_provider(
            &self.provider_type,
            None,
        ))
    }

    async fn start_session(
        &mut self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
        mcp_servers: Vec<agent_client_protocol::McpServer>,
    ) -> AppResult<()> {
        println!(
            "[{}] Starting ACP session for {}",
            self.provider_name, session_id
        );

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        spawn_stderr_reader(
            stderr,
            self.provider_type.as_id().to_string(),
            stream_tx.clone(),
            session_id.to_string(),
            self.current_message_id.clone(),
        );

        let (cmd_tx, handshake_rx) = spawn_acp_connection(
            stdin,
            stdout,
            session_id.to_string(),
            worktree_path.to_string_lossy().to_string(),
            stream_tx,
            app_handle,
            self.current_message_id.clone(),
            mcp_servers,
        );

        let handshake = handshake_rx
            .await
            .map_err(|_| AppError::Provider("Handshake channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))?;

        println!(
            "[{}] ACP session established: {}",
            self.provider_name, handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[{}] Handshake complete: available_models = {:?}, current_model = {:?}, available_modes = {:?}, current_mode = {:?}",
            self.provider_name, handshake.models, handshake.current_model_id, handshake.modes, handshake.current_mode_id
        );
        self.available_models = handshake.models;
        self.current_model_id = handshake.current_model_id;
        self.available_modes = handshake.modes;
        self.current_mode_id = handshake.current_mode_id;
        self.config_options = handshake.config_options;
        self.is_active = true;

        Ok(())
    }

    async fn resume_session(
        &mut self,
        session_id: &str,
        acp_session_id: &str,
        worktree_path: &Path,
        project_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
        mcp_servers: Vec<agent_client_protocol::McpServer>,
    ) -> AppResult<()> {
        println!(
            "[{}] Resuming ACP session {} for {} (worktree: {}, project: {})",
            self.provider_name,
            acp_session_id,
            session_id,
            worktree_path.display(),
            project_path.display()
        );

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        spawn_stderr_reader(
            stderr,
            self.provider_type.as_id().to_string(),
            stream_tx.clone(),
            session_id.to_string(),
            self.current_message_id.clone(),
        );

        let (cmd_tx, handshake_rx) = spawn_acp_resume_connection(
            stdin,
            stdout,
            session_id.to_string(),
            acp_session_id.to_string(),
            worktree_path.to_string_lossy().to_string(),
            stream_tx,
            app_handle,
            self.current_message_id.clone(),
            mcp_servers,
        );

        let handshake = handshake_rx
            .await
            .map_err(|_| AppError::Provider("Handshake channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))?;

        println!(
            "[{}] ACP session resumed: {}",
            self.provider_name, handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[{}] Handshake complete: available_models = {:?}, current_model = {:?}, available_modes = {:?}, current_mode = {:?}",
            self.provider_name, handshake.models, handshake.current_model_id, handshake.modes, handshake.current_mode_id
        );
        self.available_models = handshake.models;
        self.current_model_id = handshake.current_model_id;
        self.available_modes = handshake.modes;
        self.current_mode_id = handshake.current_mode_id;
        self.config_options = handshake.config_options;
        self.is_active = true;

        Ok(())
    }

    fn acp_session_id(&self) -> Option<&str> {
        self.acp_session_id.as_deref()
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        self.available_models.clone()
    }

    fn current_model_id(&self) -> Option<&str> {
        self.current_model_id.as_deref()
    }

    fn available_modes(&self) -> Vec<ModeInfo> {
        self.available_modes.clone()
    }

    fn current_mode_id(&self) -> Option<&str> {
        self.current_mode_id.as_deref()
    }

    fn config_options(&self) -> Vec<agent_client_protocol::SessionConfigOption> {
        self.config_options.clone()
    }

    async fn send_message(&mut self, content: Vec<PromptContent>) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        // Check if this is a permission response (single text content with option_id)
        if content.len() == 1 {
            if let PromptContent::Text { text } = &content[0] {
                let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
                let cmd = AcpCommand::PermissionResponse {
                    option_id: text.trim().to_string(),
                    reply: reply_tx,
                };

                cmd_tx.send(cmd).await.map_err(|e| {
                    AppError::Provider(format!("Failed to send command: {}", e))
                })?;

                match reply_rx.await {
                    Ok(Ok(())) => {
                        println!(
                            "[{}] Sent permission response: option_id={}",
                            self.provider_name,
                            text.trim()
                        );
                        return Ok(());
                    }
                    Ok(Err(_)) => {
                        // No pending permission - treat as a normal prompt
                    }
                    Err(_) => {
                        return Err(AppError::Provider("Command channel closed".to_string()));
                    }
                }
            }
        }

        // Convert PromptContent to ACP ContentBlock
        use agent_client_protocol::{ContentBlock, ImageContent as AcpImageContent, TextContent};
        let content_blocks: Vec<ContentBlock> = content
            .into_iter()
            .map(|c| match c {
                PromptContent::Text { text } => ContentBlock::Text(TextContent::new(text)),
                PromptContent::Image(img) => {
                    let mut image_content = AcpImageContent::new(img.data, img.mime_type);
                    if let Some(uri) = img.uri {
                        image_content = image_content.uri(uri);
                    }
                    ContentBlock::Image(image_content)
                }
                PromptContent::ResourceLink(rl) => {
                    let mut resource_link =
                        agent_client_protocol::ResourceLink::new(rl.name, rl.uri);
                    if let Some(mime) = rl.mime_type {
                        resource_link = resource_link.mime_type(mime);
                    }
                    ContentBlock::ResourceLink(resource_link)
                }
            })
            .collect();

        // Normal message: send as prompt
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::Prompt {
            session_id: acp_session_id.clone(),
            content: content_blocks,
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send prompt command: {}", e))
        })?;

        let provider_name = self.provider_name.clone();
        tokio::spawn(async move {
            match reply_rx.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    eprintln!("[{}] Prompt error: {}", provider_name, e);
                }
                Err(_) => {
                    eprintln!("[{}] Prompt reply channel closed", provider_name);
                }
            }
        });

        Ok(())
    }

    async fn set_model(&mut self, model_id: &str) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::SetModel {
            session_id: acp_session_id.clone(),
            model_id: model_id.to_string(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send set_model command: {}", e))
        })?;

        reply_rx
            .await
            .map_err(|_| AppError::Provider("Set model reply channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))
    }

    async fn set_mode(&mut self, mode_id: &str) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::SetMode {
            session_id: acp_session_id.clone(),
            mode_id: mode_id.to_string(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send set_mode command: {}", e))
        })?;

        reply_rx
            .await
            .map_err(|_| AppError::Provider("Set mode reply channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))
    }

    async fn set_config_option(&mut self, config_id: &str, value: &str) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::SetConfigOption {
            config_id: config_id.to_string(),
            value: value.to_string(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send set_config_option command: {}", e))
        })?;

        reply_rx
            .await
            .map_err(|_| AppError::Provider("Set config option reply channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))
    }

    fn is_active(&self) -> bool {
        self.is_active
    }

    async fn cancel(&mut self) -> AppResult<()> {
        println!("[{}] cancel() called", self.provider_name);
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        println!(
            "[{}] Sending Cancel command for session: {}",
            self.provider_name, acp_session_id
        );
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::Cancel {
            session_id: acp_session_id.clone(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send cancel command: {}", e))
        })?;

        let result = reply_rx
            .await
            .map_err(|_| AppError::Provider("Cancel reply channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e));

        println!("[{}] Cancel command result: {:?}", self.provider_name, result);
        result
    }

    async fn terminate(&mut self) -> AppResult<()> {
        println!("[{}] Terminating session", self.provider_name);

        if let Some(cmd_tx) = self.cmd_tx.take() {
            let _ = cmd_tx.send(AcpCommand::Shutdown).await;
        }

        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }

        self.is_active = false;
        self.acp_session_id = None;
        self.session_id = None;
        self.available_models.clear();
        self.current_model_id = None;

        Ok(())
    }
}
