use crate::models::ProviderInfo;
use crate::providers::ProviderDetector;

#[tauri::command]
pub async fn detect_providers() -> Vec<ProviderInfo> {
    tokio::task::spawn_blocking(|| ProviderDetector::detect_all())
        .await
        .unwrap_or_default()
}
