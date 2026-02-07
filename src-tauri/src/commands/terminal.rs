use tauri::State;

use crate::error::AppResult;
use crate::managers::TerminalManager;

#[derive(serde::Deserialize)]
pub struct CreateTerminalRequest {
    pub session_id: String,
    pub cwd: String,
    pub name: String,
}

#[derive(serde::Serialize)]
pub struct TerminalResponse {
    pub terminal_id: String,
}

#[tauri::command]
pub async fn create_terminal(
    terminal_manager: State<'_, TerminalManager>,
    request: CreateTerminalRequest,
) -> AppResult<String> {
    let terminal_id = terminal_manager
        .create_terminal(request.session_id, request.cwd, request.name)
        .await?;
    Ok(terminal_id)
}

#[tauri::command]
pub async fn close_terminal(
    terminal_manager: State<'_, TerminalManager>,
    terminal_id: String,
) -> AppResult<()> {
    terminal_manager.close_terminal(&terminal_id).await
}

#[derive(serde::Deserialize)]
pub struct SendTerminalInputRequest {
    pub terminal_id: String,
    pub input: String,
}

#[tauri::command]
pub async fn send_terminal_input(
    terminal_manager: State<'_, TerminalManager>,
    request: SendTerminalInputRequest,
) -> AppResult<()> {
    terminal_manager
        .send_input(&request.terminal_id, &request.input)
        .await
}

#[derive(serde::Deserialize)]
pub struct ResizeTerminalRequest {
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn resize_terminal(
    terminal_manager: State<'_, TerminalManager>,
    request: ResizeTerminalRequest,
) -> AppResult<()> {
    terminal_manager
        .resize_terminal(&request.terminal_id, request.cols, request.rows)
        .await
}
