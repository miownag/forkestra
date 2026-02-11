use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::managers::SettingsManager;
use crate::models::{AppearanceSettings, AppSettings, GeneralSettings, ProviderSettings};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub general: Option<GeneralSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance: Option<AppearanceSettings>,
}

#[tauri::command]
pub async fn get_settings(manager: State<'_, Arc<SettingsManager>>) -> Result<AppSettings, String> {
    Ok(manager.get_settings())
}

#[tauri::command]
pub async fn get_settings_json(manager: State<'_, Arc<SettingsManager>>) -> Result<String, String> {
    manager.get_settings_json().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings_path(manager: State<'_, Arc<SettingsManager>>) -> Result<String, String> {
    Ok(manager.get_settings_path().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn update_settings_json(
    manager: State<'_, Arc<SettingsManager>>,
    json: String,
) -> Result<(), String> {
    manager.update_settings_from_json(&json).map_err(|e| e.to_string())
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

#[tauri::command]
pub async fn get_ui_settings(
    manager: State<'_, Arc<SettingsManager>>,
) -> Result<UiSettings, String> {
    let settings = manager.get_settings();
    Ok(UiSettings {
        general: settings.general,
        appearance: settings.appearance,
    })
}

#[tauri::command]
pub async fn update_ui_settings(
    manager: State<'_, Arc<SettingsManager>>,
    ui_settings: UiSettings,
) -> Result<(), String> {
    let mut settings = manager.get_settings();

    if let Some(general) = ui_settings.general {
        settings.general = Some(general);
    }

    if let Some(appearance) = ui_settings.appearance {
        settings.appearance = Some(appearance);
    }

    manager.update_settings(settings).map_err(|e| e.to_string())
}
