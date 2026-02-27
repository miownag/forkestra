use std::path::Path;
use tauri::State;

use crate::managers::{SessionManager, WorktreeManager};
use crate::models::{
    ChatMessage, CreateSessionRequest, PromptContent, Session,
};
use crate::models::session::{
    ConflictContent, GitScmStatus, MergeRebaseResult,
};

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
    content: Vec<PromptContent>,
) -> Result<(), String> {
    manager
        .send_message(&session_id, content)
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
pub async fn list_branches(project_path: String, include_remote: bool) -> Result<Vec<String>, String> {
    WorktreeManager::list_branches(Path::new(&project_path), include_remote).map_err(|e| e.to_string())
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
pub async fn set_session_mode(
    manager: State<'_, SessionManager>,
    session_id: String,
    mode_id: String,
) -> Result<Session, String> {
    manager
        .set_session_mode(&session_id, mode_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_session_config_option(
    manager: State<'_, SessionManager>,
    session_id: String,
    config_id: String,
    value: String,
) -> Result<(), String> {
    manager
        .set_session_config_option(&session_id, config_id, value)
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

#[tauri::command]
pub async fn git_sync(project_path: String) -> Result<String, String> {
    WorktreeManager::sync_repository(Path::new(&project_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> Result<String, String> {
    WorktreeManager::pull_repository(Path::new(&project_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_push(project_path: String) -> Result<String, String> {
    WorktreeManager::push_repository(Path::new(&project_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_status(project_path: String) -> Result<(usize, usize), String> {
    WorktreeManager::get_ahead_behind(Path::new(&project_path)).map_err(|e| e.to_string())
}

// ========== SCM Commands ==========

#[tauri::command]
pub async fn git_scm_status(repo_path: String) -> Result<GitScmStatus, String> {
    WorktreeManager::get_scm_status(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    WorktreeManager::get_file_diff(Path::new(&repo_path), &file_path, staged)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    WorktreeManager::stage_file(Path::new(&repo_path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    WorktreeManager::unstage_file(Path::new(&repo_path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    WorktreeManager::stage_all(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    WorktreeManager::unstage_all(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    WorktreeManager::commit(Path::new(&repo_path), &message).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_discard_file(repo_path: String, file_path: String) -> Result<(), String> {
    WorktreeManager::discard_file(Path::new(&repo_path), &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_merge_from(
    repo_path: String,
    source_branch: String,
) -> Result<MergeRebaseResult, String> {
    WorktreeManager::merge_from(Path::new(&repo_path), &source_branch)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_rebase_onto(
    repo_path: String,
    onto_branch: String,
) -> Result<MergeRebaseResult, String> {
    WorktreeManager::rebase_onto(Path::new(&repo_path), &onto_branch)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_merge_to(
    session_id: String,
    project_path: String,
    target_branch: String,
) -> Result<MergeRebaseResult, String> {
    WorktreeManager::merge_to_branch_with_result(
        Path::new(&project_path),
        &session_id,
        &target_branch,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_abort_merge(repo_path: String) -> Result<(), String> {
    WorktreeManager::abort_merge(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_abort_rebase(repo_path: String) -> Result<(), String> {
    WorktreeManager::abort_rebase(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_continue_merge(repo_path: String) -> Result<(), String> {
    WorktreeManager::continue_merge(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_continue_rebase(repo_path: String) -> Result<(), String> {
    WorktreeManager::continue_rebase(Path::new(&repo_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_get_conflict_content(
    repo_path: String,
    file_path: String,
) -> Result<ConflictContent, String> {
    WorktreeManager::get_conflict_content(Path::new(&repo_path), &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_resolve_conflict(
    repo_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    WorktreeManager::resolve_conflict(Path::new(&repo_path), &file_path, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_checkout_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    WorktreeManager::checkout_branch(Path::new(&repo_path), &branch_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_create_branch(
    repo_path: String,
    branch_name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    WorktreeManager::create_and_checkout_branch(
        Path::new(&repo_path),
        &branch_name,
        start_point.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_session_branch(
    manager: State<'_, SessionManager>,
    session_id: String,
    branch_name: String,
) -> Result<Vec<Session>, String> {
    manager
        .update_session_branch(&session_id, &branch_name)
        .await
        .map_err(|e| e.to_string())
}