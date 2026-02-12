use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    ClaudeProviderSettings, ModelInfo, ProviderInfo, ProviderType, StreamChunk,
};
use crate::providers::acp_client_sdk::{
    build_clean_env_with_custom, spawn_acp_connection, spawn_acp_resume_connection,
    spawn_stderr_reader, AcpCommand,
};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct ClaudeAdapter {
    child: Option<tokio::process::Child>,
    cmd_tx: Option<mpsc::Sender<AcpCommand>>,
    acp_session_id: Option<String>,
    session_id: Option<String>,
    current_message_id: Arc<Mutex<String>>,
    is_active: bool,
    cli_path: String,
    disable_login_prompt: bool,
    available_models: Vec<ModelInfo>,
    current_model_id: Option<String>,
    env_vars: HashMap<String, String>,
}

impl ClaudeAdapter {
    pub fn new() -> Self {
        Self {
            child: None,
            cmd_tx: None,
            acp_session_id: None,
            session_id: None,
            current_message_id: Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string())),
            is_active: false,
            cli_path: "claude".to_string(),
            disable_login_prompt: false,
            available_models: vec![],
            current_model_id: None,
            env_vars: HashMap::new(),
        }
    }

    pub fn with_settings(settings: &ClaudeProviderSettings) -> Self {
        Self {
            child: None,
            cmd_tx: None,
            acp_session_id: None,
            session_id: None,
            current_message_id: Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string())),
            is_active: false,
            cli_path: settings
                .custom_cli_path
                .clone()
                .unwrap_or_else(|| "claude".to_string()),
            disable_login_prompt: settings.disable_login_prompt,
            available_models: vec![],
            current_model_id: None,
            env_vars: settings.env_vars.clone(),
        }
    }

    /// Spawn the ACP bridge process. Returns (child, stdin, stdout, stderr).
    fn spawn_process(
        &self,
        worktree_path: &Path,
    ) -> AppResult<(
        tokio::process::Child,
        tokio::process::ChildStdin,
        tokio::process::ChildStdout,
        tokio::process::ChildStderr,
    )> {
        let npx_path = ProviderDetector::find_in_path("npx").ok_or_else(|| {
            AppError::Provider(
                "npx not found in PATH. Please install Node.js to use Claude Code ACP.".to_string(),
            )
        })?;

        let mut env = build_clean_env_with_custom(self.env_vars.clone());

        if self.cli_path != "claude" {
            let resolved = ProviderDetector::find_in_path(&self.cli_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| self.cli_path.clone());
            println!("[ClaudeAdapter] Using custom CLI path: {}", resolved);
            env.insert("CLAUDE_CODE_EXECUTABLE".to_string(), resolved);
        }

        if self.disable_login_prompt {
            env.insert("DISABLE_AUTHN".to_string(), "1".to_string());
        }

        // Print command details for debugging
        println!("[ClaudeAdapter] Executing command:");
        println!("  Command: {} @zed-industries/claude-code-acp", npx_path.display());
        println!("  Working directory: {}", worktree_path.display());
        println!("  Environment variables:");
        for (key, value) in &env {
            if key.starts_with("CLAUDE_") || key == "DISABLE_AUTHN" || key == "PATH" {
                println!("    {}={}", key, value);
            }
        }

        let mut child = tokio::process::Command::new(npx_path.as_os_str())
            .args(["@zed-industries/claude-code-acp"])
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(&env)
            .spawn()
            .map_err(|e| {
                AppError::Provider(format!(
                    "Failed to spawn npx @zed-industries/claude-code-acp: {}",
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

impl Default for ClaudeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for ClaudeAdapter {
    fn provider_type(&self) -> ProviderType {
        ProviderType::Claude
    }

    fn detect(&self) -> AppResult<ProviderInfo> {
        Ok(ProviderDetector::detect_provider(
            &ProviderType::Claude,
            None,
        ))
    }

    async fn start_session(
        &mut self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        println!(
            "[ClaudeAdapter] Starting ACP session for {}",
            session_id
        );

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        // Spawn stderr reader (stays on the tokio multi-threaded runtime)
        spawn_stderr_reader(
            stderr,
            "claude".to_string(),
            stream_tx.clone(),
            session_id.to_string(),
            self.current_message_id.clone(),
        );

        // Spawn the ACP connection on a dedicated LocalSet thread
        let (cmd_tx, handshake_rx) = spawn_acp_connection(
            stdin,
            stdout,
            session_id.to_string(),
            worktree_path.to_string_lossy().to_string(),
            stream_tx,
            app_handle,
            self.current_message_id.clone(),
        );

        // Wait for the handshake result
        let handshake = handshake_rx
            .await
            .map_err(|_| AppError::Provider("Handshake channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))?;

        println!(
            "[ClaudeAdapter] ACP session established: {}",
            handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[ClaudeAdapter] Handshake complete: available_models = {:?}, current_model = {:?}",
            handshake.models, handshake.current_model_id
        );
        self.available_models = handshake.models;
        self.current_model_id = handshake.current_model_id;
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
    ) -> AppResult<()> {
        println!(
            "[ClaudeAdapter] Resuming ACP session {} for {} (worktree: {}, project: {})",
            acp_session_id,
            session_id,
            worktree_path.display(),
            project_path.display()
        );

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        spawn_stderr_reader(
            stderr,
            "claude".to_string(),
            stream_tx.clone(),
            session_id.to_string(),
            self.current_message_id.clone(),
        );

        let (cmd_tx, handshake_rx) = spawn_acp_resume_connection(
            stdin,
            stdout,
            session_id.to_string(),
            acp_session_id.to_string(),
            project_path.to_string_lossy().to_string(),
            stream_tx,
            app_handle,
            self.current_message_id.clone(),
        );

        let handshake = handshake_rx
            .await
            .map_err(|_| AppError::Provider("Handshake channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))?;

        println!(
            "[ClaudeAdapter] ACP session resumed: {}",
            handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[ClaudeAdapter] Handshake complete: available_models = {:?}, current_model = {:?}",
            handshake.models, handshake.current_model_id
        );
        self.available_models = handshake.models;
        self.current_model_id = handshake.current_model_id;
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

    async fn send_message(&mut self, message: &str) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

        // Check if this is a permission response (starts with an option_id)
        // The frontend sends the option_id directly as the message
        // We determine if it's a permission response by trying to send it as one first
        let cmd = AcpCommand::PermissionResponse {
            option_id: message.trim().to_string(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send command: {}", e))
        })?;

        match reply_rx.await {
            Ok(Ok(())) => {
                println!(
                    "[ClaudeAdapter] Sent permission response: option_id={}",
                    message.trim()
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

        // Normal message: send as prompt
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::Prompt {
            session_id: acp_session_id.clone(),
            message: message.to_string(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send prompt command: {}", e))
        })?;

        // Don't wait for the prompt to complete - it's long-running.
        // The completion signal will come via stream_tx from the SDK.
        // We just fire-and-forget the prompt command.
        // Actually, we need to spawn a task to handle the reply to avoid leaking.
        tokio::spawn(async move {
            match reply_rx.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    eprintln!("[ClaudeAdapter] Prompt error: {}", e);
                }
                Err(_) => {
                    eprintln!("[ClaudeAdapter] Prompt reply channel closed");
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

    fn is_active(&self) -> bool {
        self.is_active
    }

    async fn cancel(&mut self) -> AppResult<()> {
        let cmd_tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = AcpCommand::Cancel {
            session_id: acp_session_id.clone(),
            reply: reply_tx,
        };

        cmd_tx.send(cmd).await.map_err(|e| {
            AppError::Provider(format!("Failed to send cancel command: {}", e))
        })?;

        reply_rx
            .await
            .map_err(|_| AppError::Provider("Cancel reply channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))
    }

    async fn terminate(&mut self) -> AppResult<()> {
        println!("[ClaudeAdapter] Terminating session");

        // Send shutdown command
        if let Some(cmd_tx) = self.cmd_tx.take() {
            let _ = cmd_tx.send(AcpCommand::Shutdown).await;
        }

        // Kill the child process
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
