use tauri::State;

use crate::managers::SessionManager;
use crate::models::{CreateSessionRequest, Session};

#[tauri::command]
pub async fn create_session(
    manager: State<'_, SessionManager>,
    request: CreateSessionRequest,
) -> Result<Session, String> {
    manager
        .create_session(request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(manager: State<'_, SessionManager>) -> Result<Vec<Session>, String> {
    Ok(manager.list_sessions().await)
}

#[tauri::command]
pub async fn get_session(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> Result<Session, String> {
    manager
        .get_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    manager: State<'_, SessionManager>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    manager
        .send_message(&session_id, &message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminate_session(
    manager: State<'_, SessionManager>,
    session_id: String,
    cleanup_worktree: bool,
) -> Result<(), String> {
    manager
        .terminate_session(&session_id, cleanup_worktree)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_session(
    manager: State<'_, SessionManager>,
    session_id: String,
    target_branch: String,
) -> Result<(), String> {
    manager
        .merge_session(&session_id, &target_branch)
        .await
        .map_err(|e| e.to_string())
}
