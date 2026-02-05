use std::io::{BufReader, Write};
use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::models::{ClaudeProviderSettings, ProviderInfo, ProviderType, StreamChunk};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct ClaudeAdapter {
    pty: Option<Arc<Mutex<PtyPair>>>,
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
    session_id: Option<String>,
    is_active: bool,
    // Configuration fields
    cli_path: String,
    disable_login_prompt: bool,
}

impl ClaudeAdapter {
    pub fn new() -> Self {
        Self {
            pty: None,
            writer: None,
            session_id: None,
            is_active: false,
            cli_path: "claude".to_string(),
            disable_login_prompt: false,
        }
    }

    pub fn with_settings(settings: &ClaudeProviderSettings) -> Self {
        Self {
            pty: None,
            writer: None,
            session_id: None,
            is_active: false,
            cli_path: settings
                .custom_cli_path
                .clone()
                .unwrap_or_else(|| "claude".to_string()),
            disable_login_prompt: settings.disable_login_prompt,
        }
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
        Ok(ProviderDetector::detect_provider(&ProviderType::Claude))
    }

    async fn start_session(
        &mut self,
        session_id: &str,
        worktree_path: &Path,
        stream_tx: mpsc::Sender<StreamChunk>,
    ) -> AppResult<()> {
        let pty_system = native_pty_system();

        // Create PTY with reasonable size
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Provider(format!("Failed to create PTY: {}", e)))?;

        // Build command using configured CLI path
        let mut cmd = CommandBuilder::new(&self.cli_path);
        cmd.cwd(worktree_path);
        // Interactive mode - no --print flag
        // --print is for non-interactive one-shot queries

        // Add disable login prompt flag if configured
        if self.disable_login_prompt {
            cmd.env("DISABLE_AUTHN", "1");
        }

        // Spawn the child process
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Provider(format!("Failed to spawn claude: {}", e)))?;

        // Get writer for sending input
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Provider(format!("Failed to get writer: {}", e)))?;

        // Get reader for receiving output
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Provider(format!("Failed to get reader: {}", e)))?;

        let session_id_clone = session_id.to_string();
        let message_id = uuid::Uuid::new_v4().to_string();

        // Spawn task to read output and send to channel
        // Use byte-by-byte reading for interactive CLI that may not output full lines
        tokio::spawn(async move {
            let mut buf_reader = BufReader::new(reader);
            let mut buffer = Vec::new();
            let mut byte = [0u8; 1];

            loop {
                use std::io::Read;
                match buf_reader.get_mut().read(&mut byte) {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        buffer.push(byte[0]);
                        // Send on newline or when we have content after a potential prompt
                        if byte[0] == b'\n' || buffer.ends_with(b"> ") || buffer.ends_with(b"? ") {
                            if let Ok(content) = String::from_utf8(buffer.clone()) {
                                let chunk = StreamChunk {
                                    session_id: session_id_clone.clone(),
                                    message_id: message_id.clone(),
                                    content,
                                    is_complete: false,
                                };
                                if stream_tx.send(chunk).await.is_err() {
                                    break;
                                }
                            }
                            buffer.clear();
                        }
                    }
                    Err(_) => break,
                }
            }

            // Send any remaining content
            if !buffer.is_empty() {
                if let Ok(content) = String::from_utf8(buffer) {
                    let _ = stream_tx
                        .send(StreamChunk {
                            session_id: session_id_clone.clone(),
                            message_id: message_id.clone(),
                            content,
                            is_complete: false,
                        })
                        .await;
                }
            }

            // Send completion signal
            let _ = stream_tx
                .send(StreamChunk {
                    session_id: session_id_clone,
                    message_id,
                    content: String::new(),
                    is_complete: true,
                })
                .await;
        });

        // Wait for child process to exit in background
        tokio::spawn(async move {
            let _ = child.wait();
        });

        self.pty = Some(Arc::new(Mutex::new(pair)));
        self.writer = Some(Arc::new(Mutex::new(writer)));
        self.session_id = Some(session_id.to_string());
        self.is_active = true;

        Ok(())
    }

    async fn send_message(&mut self, message: &str) -> AppResult<()> {
        let writer = self
            .writer
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        let mut writer = writer.lock();
        writeln!(writer, "{}", message)
            .map_err(|e| AppError::Provider(format!("Failed to send message: {}", e)))?;
        writer
            .flush()
            .map_err(|e| AppError::Provider(format!("Failed to flush: {}", e)))?;

        Ok(())
    }

    fn is_active(&self) -> bool {
        self.is_active
    }

    async fn terminate(&mut self) -> AppResult<()> {
        // Send Ctrl+C to gracefully terminate
        if let Some(writer) = &self.writer {
            let mut writer = writer.lock();
            let _ = writer.write_all(&[0x03]); // Ctrl+C
            let _ = writer.flush();
        }

        self.is_active = false;
        self.pty = None;
        self.writer = None;

        Ok(())
    }
}
