use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    KimiProviderSettings, ModelInfo, PendingPermission, ProviderInfo, ProviderType, StreamChunk,
};
use crate::providers::acp_helper::{
    acp_handshake, acp_resume_handshake, build_clean_env_with_custom, build_permission_response,
    build_prompt_request, cancel_session, set_session_model, spawn_stderr_reader,
    spawn_stdin_writer, spawn_stdout_reader, PendingRequests,
};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct KimiAdapter {
    child: Option<tokio::process::Child>,
    stdin_tx: Option<mpsc::Sender<String>>,
    acp_session_id: Option<String>,
    session_id: Option<String>,
    next_request_id: Arc<Mutex<u64>>,
    pending_requests: PendingRequests,
    pending_permission: Arc<Mutex<Option<PendingPermission>>>,
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
            stdin_tx: None,
            acp_session_id: None,
            session_id: None,
            next_request_id: Arc::new(Mutex::new(10)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            pending_permission: Arc::new(Mutex::new(None)),
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
            stdin_tx: None,
            acp_session_id: None,
            session_id: None,
            next_request_id: Arc::new(Mutex::new(10)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            pending_permission: Arc::new(Mutex::new(None)),
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

    async fn next_id(&self) -> u64 {
        let mut id = self.next_request_id.lock().await;
        let current = *id;
        *id += 1;
        current
    }

    /// Spawn the kimi ACP process and set up I/O tasks.
    fn spawn_acp_process(
        &self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<(tokio::process::Child, mpsc::Sender<String>)> {
        // Resolve kimi CLI path
        let cli_path = ProviderDetector::find_in_path(&self.cli_path)
            .unwrap_or_else(|| std::path::PathBuf::from(&self.cli_path));

        // Build clean environment with user-configured env vars
        let env = build_clean_env_with_custom(self.env_vars.clone());

        // Spawn kimi with ACP subcommand
        let mut child = tokio::process::Command::new(&cli_path)
            .arg("acp")
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(&env)
            .spawn()
            .map_err(|e| {
                AppError::Provider(format!("Failed to spawn kimi acp: {}", e))
            })?;

        // Take stdin, stdout, stderr
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

        // Create stdin writer channel
        let (stdin_tx, stdin_rx) = mpsc::channel::<String>(100);

        // Spawn tasks
        spawn_stdin_writer(stdin, stdin_rx);

        let current_message_id = self.current_message_id.clone();
        let pending_requests = self.pending_requests.clone();
        let pending_permission = self.pending_permission.clone();

        // Forward stream chunks to frontend
        let (internal_tx, mut internal_rx) = mpsc::channel::<StreamChunk>(100);
        let session_id_for_forwarder = session_id.to_string();
        tokio::spawn(async move {
            while let Some(chunk) = internal_rx.recv().await {
                if stream_tx.send(chunk).await.is_err() {
                    break;
                }
            }
            println!(
                "[KimiAdapter] Stream forwarder ended for session {}",
                session_id_for_forwarder
            );
        });

        spawn_stderr_reader(
            stderr,
            "kimi".to_string(),
            self.pending_requests.clone(),
            internal_tx.clone(),
            session_id.to_string(),
            current_message_id.clone(),
        );

        spawn_stdout_reader(
            stdout,
            internal_tx,
            app_handle,
            pending_requests,
            pending_permission,
            session_id.to_string(),
            current_message_id,
        );

        Ok((child, stdin_tx))
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

        let (child, stdin_tx) =
            self.spawn_acp_process(session_id, worktree_path, stream_tx, app_handle)?;

        // Perform ACP handshake
        println!("[KimiAdapter] Starting ACP handshake...");
        let pending_requests = self.pending_requests.clone();
        let handshake =
            acp_handshake(&stdin_tx, &pending_requests, &worktree_path.to_string_lossy()).await?;

        println!(
            "[KimiAdapter] ACP session established: {}",
            handshake.session_id
        );

        // Store state
        self.child = Some(child);
        self.stdin_tx = Some(stdin_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
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
            acp_session_id, session_id, worktree_path.display(), project_path.display()
        );

        // Spawn ACP process in worktree (for file access isolation)
        let (child, stdin_tx) =
            self.spawn_acp_process(session_id, worktree_path, stream_tx, app_handle)?;

        // Perform ACP resume handshake with project_path as cwd (for session file lookup)
        println!("[KimiAdapter] Starting ACP resume handshake...");
        let pending_requests = self.pending_requests.clone();
        let handshake = acp_resume_handshake(
            &stdin_tx,
            &pending_requests,
            acp_session_id,
            &project_path.to_string_lossy(),  // ← Use project_path for session file lookup
            &ProviderType::Kimi,
            true, // new process — always true since we spawn a fresh ACP process
        )
        .await?;

        println!(
            "[KimiAdapter] ACP session resumed: {}",
            handshake.session_id
        );

        // Store state
        self.child = Some(child);
        self.stdin_tx = Some(stdin_tx);
        self.acp_session_id = Some(handshake.session_id);
        self.session_id = Some(session_id.to_string());
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
        let stdin_tx = self
            .stdin_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        // Check if there's a pending permission request
        let pending_perm = {
            let mut perm = self.pending_permission.lock().await;
            perm.take()
        };

        if let Some(perm) = pending_perm {
            // The message is the selected option_id from the frontend
            let option_id = message.trim();
            let response_json = build_permission_response(perm.jsonrpc_id, option_id);

            println!(
                "[KimiAdapter] Sending permission response: option_id={}",
                option_id
            );
            stdin_tx.send(response_json).await.map_err(|e| {
                AppError::Provider(format!("Failed to send permission response: {}", e))
            })?;

            return Ok(());
        }

        // Generate a new message_id for this prompt's response
        {
            let mut msg_id = self.current_message_id.lock().await;
            *msg_id = uuid::Uuid::new_v4().to_string();
        }

        // Normal message: send as session/prompt
        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let request_id = self.next_id().await;
        let request = build_prompt_request(request_id, acp_session_id, message)?;

        let json_str = serde_json::to_string(&request)
            .map_err(|e| AppError::Provider(format!("Failed to serialize prompt request: {}", e)))?;

        println!("[KimiAdapter] Sending session/prompt (id={})", request_id);

        // Register the pending request for response tracking
        {
            let (tx, _rx) = tokio::sync::oneshot::channel();
            let mut pending = self.pending_requests.lock().await;
            pending.insert(request_id, tx);
        }

        stdin_tx.send(json_str).await.map_err(|e| {
            AppError::Provider(format!("Failed to send prompt to stdin: {}", e))
        })?;

        Ok(())
    }

    async fn set_model(&mut self, model_id: &str) -> AppResult<()> {
        let stdin_tx = self
            .stdin_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        set_session_model(stdin_tx, &self.pending_requests, acp_session_id, model_id).await?;

        Ok(())
    }

    fn is_active(&self) -> bool {
        self.is_active
    }

    async fn cancel(&mut self) -> AppResult<()> {
        let stdin_tx = self
            .stdin_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("ACP session not established".to_string()))?;

        let request_id = self.next_id().await;
        cancel_session(stdin_tx, &self.pending_requests, acp_session_id, request_id).await
    }

    async fn terminate(&mut self) -> AppResult<()> {
        println!("[KimiAdapter] Terminating session");

        // Try graceful cancel first, then force kill
        if self.stdin_tx.is_some() && self.acp_session_id.is_some() {
            if let Err(e) = self.cancel().await {
                println!("[KimiAdapter] Graceful cancel failed, force killing: {}", e);
            }
        }

        self.stdin_tx = None;

        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }

        self.is_active = false;
        self.acp_session_id = None;
        self.session_id = None;
        self.available_models.clear();
        self.current_model_id = None;

        {
            let mut pending = self.pending_requests.lock().await;
            pending.clear();
        }

        Ok(())
    }
}
