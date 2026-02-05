use std::sync::Arc;

use tauri::State;

use crate::managers::SettingsManager;
use crate::models::{AppSettings, ProviderSettings};

#[tauri::command]
pub async fn get_settings(manager: State<'_, Arc<SettingsManager>>) -> Result<AppSettings, String> {
    Ok(manager.get_settings())
}

#[tauri::command]
pub async fn update_settings(
    manager: State<'_, Arc<SettingsManager>>,
    settings: AppSettings,
) -> Result<(), String> {
    manager.update_settings(settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_provider_settings(
    manager: State<'_, Arc<SettingsManager>>,
    settings: ProviderSettings,
) -> Result<(), String> {
    manager
        .update_provider_settings(settings)
        .map_err(|e| e.to_string())
}
