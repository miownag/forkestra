use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub struct TerminalInstance {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub cwd: String,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

pub struct TerminalManager {
    terminals: Arc<Mutex<HashMap<String, TerminalInstance>>>,
    app_handle: AppHandle,
}

impl TerminalManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }

    /// Create a new terminal instance
    pub async fn create_terminal(
        &self,
        session_id: String,
        cwd: String,
        name: String,
    ) -> AppResult<String> {
        let terminal_id = Uuid::new_v4().to_string();

        // Get the native PTY system
        let pty_system = native_pty_system();

        // Open a new PTY
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Internal(format!("Failed to open PTY: {}", e)))?;

        // Spawn a shell
        let mut cmd = CommandBuilder::new("zsh");
        cmd.cwd(&cwd);

        // Set environment variables
        cmd.env("TERM", "xterm-256color");
        cmd.env("TERM_PROGRAM", "Forkestra");

        let mut child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Internal(format!("Failed to spawn shell: {}", e)))?;

        // Get the writer for sending input
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| AppError::Internal(format!("Failed to get PTY writer: {}", e)))?;

        // Clone things we need for the reader task
        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Internal(format!("Failed to get PTY reader: {}", e)))?;

        let app_handle = self.app_handle.clone();
        let terminal_id_clone = terminal_id.clone();

        // Spawn a task to read output and emit events
        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut buffer = [0u8; 1024];

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - terminal closed
                        let _ = app_handle.emit(
                            "terminal:closed",
                            serde_json::json!({ "terminalId": &terminal_id_clone }),
                        );
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]);
                        let _ = app_handle.emit(
                            "terminal:output",
                            serde_json::json!({
                                "terminalId": &terminal_id_clone,
                                "data": data.to_string()
                            }),
                        );
                        // Also emit to specific terminal channel
                        let _ = app_handle.emit(
                            &format!("terminal:output:{}", terminal_id_clone),
                            serde_json::json!({
                                "terminalId": &terminal_id_clone,
                                "data": data.to_string()
                            }),
                        );
                    }
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }

            // Wait for child process to exit
            let _ = child.wait();
        });

        // Store the terminal instance
        let instance = TerminalInstance {
            id: terminal_id.clone(),
            session_id: session_id.clone(),
            name,
            cwd,
            writer: Arc::new(Mutex::new(writer)),
        };

        self.terminals.lock().await.insert(terminal_id.clone(), instance);

        Ok(terminal_id)
    }

    /// Close a terminal instance
    pub async fn close_terminal(&self, terminal_id: &str) -> AppResult<()> {
        let mut terminals = self.terminals.lock().await;

        if let Some(terminal) = terminals.get(terminal_id) {
            // Send exit command to gracefully close the shell
            let writer = terminal.writer.clone();
            let mut writer = writer.lock().await;
            let _ = writeln!(writer, "exit");
        }

        terminals.remove(terminal_id);

        Ok(())
    }

    /// Send input to a terminal
    pub async fn send_input(&self, terminal_id: &str, input: &str) -> AppResult<()> {
        let terminals = self.terminals.lock().await;

        if let Some(terminal) = terminals.get(terminal_id) {
            let writer = terminal.writer.clone();
            let mut writer = writer.lock().await;
            writer
                .write_all(input.as_bytes())
                .map_err(|e| AppError::Internal(format!("Failed to write to PTY: {}", e)))?;
            writer
                .flush()
                .map_err(|e| AppError::Internal(format!("Failed to flush PTY: {}", e)))?;
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Terminal '{}' not found",
                terminal_id
            )))
        }
    }

    /// Resize a terminal
    pub async fn resize_terminal(
        &self,
        terminal_id: &str,
        cols: u16,
        rows: u16,
    ) -> AppResult<()> {
        // Note: Resizing would require storing the MasterPty in a way that allows
        // calling resize on it. For now, this is a placeholder.
        // In a full implementation, we'd need to refactor how we store the PTY.
        Ok(())
    }

    /// Get all terminals for a session
    pub async fn get_session_terminals(&self, session_id: &str) -> Vec<String> {
        let terminals = self.terminals.lock().await;
        terminals
            .values()
            .filter(|t| t.session_id == session_id)
            .map(|t| t.id.clone())
            .collect()
    }

    /// Close all terminals for a session
    pub async fn close_session_terminals(&self, session_id: &str) -> AppResult<()> {
        let terminal_ids: Vec<String> = self.get_session_terminals(session_id).await;

        for terminal_id in terminal_ids {
            self.close_terminal(&terminal_id).await?;
        }

        Ok(())
    }
}
