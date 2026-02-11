use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::provider::{
    ClaudeProviderSettings, KimiProviderSettings, ProviderSettings, ProviderType,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_work_mode: Option<String>,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            default_project_path: None,
            default_work_mode: Some("worktree".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: Some("system".to_string()),
            font_size: Some("base".to_string()),
            accent_color: Some("default".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub general: Option<GeneralSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance: Option<AppearanceSettings>,
    pub provider_settings: HashMap<ProviderType, ProviderSettings>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut provider_settings = HashMap::new();
        provider_settings.insert(
            ProviderType::Claude,
            ProviderSettings::Claude(ClaudeProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::Kimi,
            ProviderSettings::Kimi(KimiProviderSettings::default()),
        );

        Self {
            general: Some(GeneralSettings::default()),
            appearance: Some(AppearanceSettings::default()),
            provider_settings,
        }
    }
}
