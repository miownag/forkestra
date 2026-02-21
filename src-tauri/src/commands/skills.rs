use std::sync::Arc;
use tauri::State;

use crate::managers::SkillsManager;
use crate::models::skill::{CliResult, SkillConfig};

#[tauri::command]
pub async fn list_skills(
    manager: State<'_, Arc<SkillsManager>>,
) -> Result<Vec<SkillConfig>, String> {
    Ok(manager.list_all_skills())
}

#[tauri::command]
pub async fn scan_skills(
    manager: State<'_, Arc<SkillsManager>>,
) -> Result<Vec<SkillConfig>, String> {
    manager.scan_all().map_err(|e| e.to_string())?;
    Ok(manager.list_all_skills())
}

#[tauri::command]
pub async fn toggle_skill(
    manager: State<'_, Arc<SkillsManager>>,
    skill_id: String,
    enabled: bool,
) -> Result<(), String> {
    manager
        .toggle_skill(&skill_id, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_skill(
    manager: State<'_, Arc<SkillsManager>>,
    source: String,
    global: bool,
    agent: Option<String>,
) -> Result<CliResult, String> {
    manager
        .install_skill(&source, global, agent.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_skill(
    manager: State<'_, Arc<SkillsManager>>,
    name: String,
    global: bool,
    agent: Option<String>,
) -> Result<CliResult, String> {
    manager
        .remove_skill(&name, global, agent.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_skills(
    manager: State<'_, Arc<SkillsManager>>,
) -> Result<CliResult, String> {
    manager.update_skills().map_err(|e| e.to_string())
}
