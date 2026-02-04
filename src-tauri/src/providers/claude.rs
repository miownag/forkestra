use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::models::{ProviderInfo, ProviderType, StreamChunk};
use crate::providers::adapter::ProviderAdapter;
use crate::providers::detector::ProviderDetector;

pub struct ClaudeAdapter {
    pty: Option<Arc<Mutex<PtyPair>>>,
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
    session_id: Option<String>,
    is_active: bool,
}

impl ClaudeAdapter {
    pub fn new() -> Self {
        Self {
            pty: None,
            writer: None,
            session_id: None,
            is_active: false,
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

        // Build command
        let mut cmd = CommandBuilder::new("claude");
        cmd.cwd(worktree_path);
        // Use print mode for JSON output that's easier to parse
        cmd.arg("--print");

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
        tokio::spawn(async move {
            let buf_reader = BufReader::new(reader);
            for line in buf_reader.lines() {
                match line {
                    Ok(content) => {
                        let chunk = StreamChunk {
                            session_id: session_id_clone.clone(),
                            message_id: message_id.clone(),
                            content: format!("{}\n", content),
                            is_complete: false,
                        };
                        if stream_tx.send(chunk).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
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
