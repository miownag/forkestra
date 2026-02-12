use std::path::Path;
use tauri::State;

use crate::managers::{SessionManager, WorktreeManager};
use crate::models::{ChatMessage, CreateSessionRequest, Session};

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

#[tauri::command]
pub async fn list_branches(project_path: String) -> Result<Vec<String>, String> {
    WorktreeManager::list_branches(Path::new(&project_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_session(
    manager: State<'_, SessionManager>,
    session_id: String,
    new_name: String,
) -> Result<Session, String> {
    manager
        .rename_session(&session_id, &new_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_interaction_response(
    manager: State<'_, SessionManager>,
    session_id: String,
    response: String,
) -> Result<(), String> {
    manager
        .send_interaction_response(&session_id, &response)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_session(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> Result<Session, String> {
    manager
        .resume_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_messages(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let db = manager.database().clone();
    let result = tokio::task::spawn_blocking(move || db.get_messages(&session_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?;
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_message(
    manager: State<'_, SessionManager>,
    message: ChatMessage,
) -> Result<(), String> {
    let db = manager.database().clone();
    let result = tokio::task::spawn_blocking(move || db.save_message(&message))
        .await
        .map_err(|e| format!("Task join error: {}", e))?;
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_session_model(
    manager: State<'_, SessionManager>,
    session_id: String,
    model_id: String,
) -> Result<Session, String> {
    manager
        .set_session_model(&session_id, model_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_generation(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    println!("[Command] cancel_generation called for session: {}", session_id);
    manager
        .cancel_generation(&session_id)
        .await
        .map_err(|e| e.to_string())
}