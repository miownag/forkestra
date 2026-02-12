use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    KimiProviderSettings, ModelInfo, ProviderInfo, ProviderType, StreamChunk,
};
use crate::providers::acp_client_sdk::{
    build_clean_env_with_custom, spawn_acp_connection, spawn_acp_resume_connection,
    spawn_stderr_reader, AcpCommand,
};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct KimiAdapter {
    child: Option<tokio::process::Child>,
    cmd_tx: Option<mpsc::Sender<AcpCommand>>,
    acp_session_id: Option<String>,
    session_id: Option<String>,
    current_message_id: Arc<Mutex<String>>,
    is_active: bool,
    cli_path: String,
    available_models: Vec<ModelInfo>,
    current_model_id: Option<String>,
    env_vars: HashMap<String, String>,
}

impl KimiAdapter {
    pub fn new() -> Self {
        Self {
            child: None,
            cmd_tx: None,
            acp_session_id: None,
            session_id: None,
            current_message_id: Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string())),
            is_active: false,
            cli_path: "kimi".to_string(),
            available_models: vec![],
            current_model_id: None,
            env_vars: HashMap::new(),
        }
    }

    pub fn with_settings(settings: &KimiProviderSettings) -> Self {
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
                .unwrap_or_else(|| "kimi".to_string()),
            available_models: vec![],
            current_model_id: None,
            env_vars: settings.env_vars.clone(),
        }
    }

    /// Spawn the kimi ACP process. Returns (child, stdin, stdout, stderr).
    fn spawn_process(
        &self,
        worktree_path: &Path,
    ) -> AppResult<(
        tokio::process::Child,
        tokio::process::ChildStdin,
        tokio::process::ChildStdout,
        tokio::process::ChildStderr,
    )> {
        let cli_path = ProviderDetector::find_in_path(&self.cli_path)
            .unwrap_or_else(|| std::path::PathBuf::from(&self.cli_path));

        let env = build_clean_env_with_custom(self.env_vars.clone());

        let mut child = tokio::process::Command::new(&cli_path)
            .arg("acp")
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(&env)
            .spawn()
            .map_err(|e| AppError::Provider(format!("Failed to spawn kimi acp: {}", e)))?;

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

impl Default for KimiAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for KimiAdapter {
    fn provider_type(&self) -> ProviderType {
        ProviderType::Kimi
    }

    fn detect(&self) -> AppResult<ProviderInfo> {
        Ok(ProviderDetector::detect_provider(&ProviderType::Kimi, None))
    }

    async fn start_session(
        &mut self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        println!("[KimiAdapter] Starting ACP session for {}", session_id);

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        spawn_stderr_reader(
            stderr,
            "kimi".to_string(),
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
        );

        let handshake = handshake_rx
            .await
            .map_err(|_| AppError::Provider("Handshake channel closed".to_string()))?
            .map_err(|e| AppError::Provider(e))?;

        println!(
            "[KimiAdapter] ACP session established: {}",
            handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[KimiAdapter] Handshake complete: available_models = {:?}, current_model = {:?}",
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
            "[KimiAdapter] Resuming ACP session {} for {} (worktree: {}, project: {})",
            acp_session_id,
            session_id,
            worktree_path.display(),
            project_path.display()
        );

        let (child, stdin, stdout, stderr) = self.spawn_process(worktree_path)?;

        spawn_stderr_reader(
            stderr,
            "kimi".to_string(),
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
            "[KimiAdapter] ACP session resumed: {}",
            handshake.session_id
        );

        self.child = Some(child);
        self.cmd_tx = Some(cmd_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
        println!(
            "[KimiAdapter] Handshake complete: available_models = {:?}, current_model = {:?}",
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

        // Try permission response first
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
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
                    "[KimiAdapter] Sent permission response: option_id={}",
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

        tokio::spawn(async move {
            match reply_rx.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    eprintln!("[KimiAdapter] Prompt error: {}", e);
                }
                Err(_) => {
                    eprintln!("[KimiAdapter] Prompt reply channel closed");
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
        println!("[KimiAdapter] Terminating session");

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
