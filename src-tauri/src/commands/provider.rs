use std::sync::Arc;

use tauri::State;

use crate::error::AppResult;
use crate::managers::SettingsManager;
use crate::models::{ProviderInfo, ProviderSettings, ProviderType};
use crate::providers::ProviderDetector;

#[tauri::command]
pub async fn detect_providers(
    settings_manager: State<'_, Arc<SettingsManager>>,
) -> AppResult<Vec<ProviderInfo>> {
    let settings = settings_manager.get_settings();

    // Extract custom CLI paths from settings and convert to owned Strings
    let claude_custom_path: Option<String> = settings
        .provider_settings
        .get(&ProviderType::Claude)
        .and_then(|s| match s {
            ProviderSettings::Claude(c) => c.custom_cli_path.clone(),
            _ => None,
        });

    let kimi_custom_path: Option<String> = settings
        .provider_settings
        .get(&ProviderType::Kimi)
        .and_then(|s| match s {
            ProviderSettings::Kimi(k) => k.custom_cli_path.clone(),
            _ => None,
        });

    let result = tokio::task::spawn_blocking(move || {
        ProviderDetector::detect_all_with_settings(
            claude_custom_path.as_deref(),
            kimi_custom_path.as_deref(),
        )
    })
    .await
    .map_err(|e| crate::error::AppError::Provider(format!("Task failed: {}", e)))?;

    Ok(result)
}
