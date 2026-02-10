use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};
use crate::models::{
    ClaudeProviderSettings, ModelInfo, PendingPermission, ProviderInfo, ProviderType, StreamChunk,
};
use crate::providers::acp_helper::{
    acp_handshake, acp_resume_handshake, build_clean_env, build_permission_response,
    build_prompt_request, set_session_model, spawn_stderr_reader, spawn_stdin_writer,
    spawn_stdout_reader, PendingRequests,
};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct ClaudeAdapter {
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
    disable_login_prompt: bool,
    available_models: Vec<ModelInfo>,
    current_model_id: Option<String>,
}

impl ClaudeAdapter {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            acp_session_id: None,
            session_id: None,
            next_request_id: Arc::new(Mutex::new(10)), // Start at 10 to avoid colliding with handshake IDs
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            pending_permission: Arc::new(Mutex::new(None)),
            current_message_id: Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string())),
            is_active: false,
            cli_path: "claude".to_string(),
            disable_login_prompt: false,
            available_models: vec![],
            current_model_id: None,
        }
    }

    pub fn with_settings(settings: &ClaudeProviderSettings) -> Self {
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
                .unwrap_or_else(|| "claude".to_string()),
            disable_login_prompt: settings.disable_login_prompt,
            available_models: vec![],
            current_model_id: None,
        }
    }

    /// Get the next JSON-RPC request ID
    async fn next_id(&self) -> u64 {
        let mut id = self.next_request_id.lock().await;
        let current = *id;
        *id += 1;
        current
    }

    /// Spawn the ACP bridge process and set up I/O tasks.
    /// Returns (child, stdin_tx, pending_requests_clone, pending_permission_clone).
    fn spawn_acp_process(
        &self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<(
        tokio::process::Child,
        mpsc::Sender<String>,
    )> {
        // Resolve npx path
        let npx_path = ProviderDetector::find_in_path("npx")
            .ok_or_else(|| {
                AppError::Provider(
                    "npx not found in PATH. Please install Node.js to use Claude Code ACP."
                        .to_string(),
                )
            })?;

        // Build clean environment
        let mut env = build_clean_env();

        // Set custom CLI path if configured (non-default)
        if self.cli_path != "claude" {
            let resolved = ProviderDetector::find_in_path(&self.cli_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| self.cli_path.clone());
            println!("[ClaudeAdapter] Using custom CLI path: {}", resolved);
            env.insert("CLAUDE_CODE_EXECUTABLE".to_string(), resolved);
        }

        // Set disable login prompt if configured
        if self.disable_login_prompt {
            env.insert("DISABLE_AUTHN".to_string(), "1".to_string());
        }

        // Spawn the ACP bridge process
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
                "[ClaudeAdapter] Stream forwarder ended for session {}",
                session_id_for_forwarder
            );
        });

        spawn_stderr_reader(
            stderr,
            "claude".to_string(),
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

        let (child, stdin_tx) =
            self.spawn_acp_process(session_id, worktree_path, stream_tx, app_handle)?;

        // Perform ACP handshake
        println!("[ClaudeAdapter] Starting ACP handshake...");
        let pending_requests = self.pending_requests.clone();
        let handshake =
            acp_handshake(&stdin_tx, &pending_requests, &worktree_path.to_string_lossy()).await?;

        println!(
            "[ClaudeAdapter] ACP session established: {}",
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
        stream_tx: mpsc::Sender<StreamChunk>,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        println!(
            "[ClaudeAdapter] Resuming ACP session {} for {}",
            acp_session_id, session_id
        );

        let (child, stdin_tx) =
            self.spawn_acp_process(session_id, worktree_path, stream_tx, app_handle)?;

        // Perform ACP resume handshake
        println!("[ClaudeAdapter] Starting ACP resume handshake...");
        let pending_requests = self.pending_requests.clone();
        let handshake = acp_resume_handshake(
            &stdin_tx,
            &pending_requests,
            acp_session_id,
            &worktree_path.to_string_lossy(),
            &ProviderType::Claude,
        )
        .await?;

        println!(
            "[ClaudeAdapter] ACP session resumed: {}",
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
                "[ClaudeAdapter] Sending permission response: option_id={}",
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

        println!(
            "[ClaudeAdapter] Sending session/prompt (id={})",
            request_id
        );

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

    async fn terminate(&mut self) -> AppResult<()> {
        println!("[ClaudeAdapter] Terminating session");

        // Drop stdin channel to signal the writer to stop
        self.stdin_tx = None;

        // Kill the child process
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }

        self.is_active = false;
        self.acp_session_id = None;
        self.session_id = None;
        self.available_models.clear();
        self.current_model_id = None;

        // Clear pending requests
        {
            let mut pending = self.pending_requests.lock().await;
            pending.clear();
        }

        Ok(())
    }
}
