use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::managers::SettingsManager;
use crate::models::{builtin_definitions, ProviderDefinition, ProviderInfo};
use crate::providers::ProviderDetector;

#[tauri::command]
pub async fn detect_providers(
    settings_manager: State<'_, Arc<SettingsManager>>,
) -> AppResult<Vec<ProviderInfo>> {
    let settings = settings_manager.get_settings();

    // Combine builtin definitions with user's custom providers
    let mut definitions = builtin_definitions();
    definitions.extend(settings.custom_providers.clone());

    let provider_settings = settings.provider_settings.clone();

    let result = tokio::task::spawn_blocking(move || {
        ProviderDetector::detect_all_with_definitions(&definitions, &provider_settings)
    })
    .await
    .map_err(|e| crate::error::AppError::Provider(format!("Task failed: {}", e)))?;

    Ok(result)
}

#[tauri::command]
pub async fn add_custom_provider(
    settings_manager: State<'_, Arc<SettingsManager>>,
    definition: ProviderDefinition,
) -> AppResult<()> {
    let mut settings = settings_manager.get_settings();

    // Don't allow overriding builtin provider IDs
    let builtin_ids: Vec<String> = builtin_definitions().iter().map(|d| d.id.clone()).collect();
    if builtin_ids.contains(&definition.id) {
        return Err(crate::error::AppError::InvalidOperation(format!(
            "Cannot add custom provider with built-in ID '{}'",
            definition.id
        )));
    }

    // Remove existing definition with same ID if any
    settings.custom_providers.retain(|d| d.id != definition.id);
    settings.custom_providers.push(definition.clone());

    // Ensure provider_settings entry exists
    if !settings.provider_settings.contains_key(&definition.id) {
        settings.provider_settings.insert(
            definition.id,
            crate::models::ProviderSettings::default(),
        );
    }

    settings_manager.update_settings(settings)
}

#[tauri::command]
pub async fn remove_custom_provider(
    settings_manager: State<'_, Arc<SettingsManager>>,
    id: String,
) -> AppResult<()> {
    let mut settings = settings_manager.get_settings();

    // Don't allow removing builtin providers
    let builtin_ids: Vec<String> = builtin_definitions().iter().map(|d| d.id.clone()).collect();
    if builtin_ids.contains(&id) {
        return Err(crate::error::AppError::InvalidOperation(format!(
            "Cannot remove built-in provider '{}'",
            id
        )));
    }

    settings.custom_providers.retain(|d| d.id != id);
    settings.provider_settings.remove(&id);

    settings_manager.update_settings(settings)
}

#[tauri::command]
pub async fn update_custom_provider(
    settings_manager: State<'_, Arc<SettingsManager>>,
    definition: ProviderDefinition,
) -> AppResult<()> {
    let mut settings = settings_manager.get_settings();

    // Don't allow updating builtin providers through this command
    let builtin_ids: Vec<String> = builtin_definitions().iter().map(|d| d.id.clone()).collect();
    if builtin_ids.contains(&definition.id) {
        return Err(crate::error::AppError::InvalidOperation(format!(
            "Cannot update built-in provider '{}' through this command",
            definition.id
        )));
    }

    if let Some(existing) = settings.custom_providers.iter_mut().find(|d| d.id == definition.id) {
        *existing = definition;
    } else {
        return Err(crate::error::AppError::NotFound(format!(
            "Custom provider '{}' not found",
            definition.id
        )));
    }

    settings_manager.update_settings(settings)
}
