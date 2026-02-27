use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::mcp::McpSettings;
use super::provider::{
    ClaudeProviderSettings, CodexProviderSettings, GeminiProviderSettings, KimiProviderSettings,
    OpenCodeProviderSettings, QoderProviderSettings, QwenCodeProviderSettings,
    ProviderSettings, ProviderType,
};
use super::skill::SkillSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_work_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_merge_action: Option<String>,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            default_project_path: None,
            default_work_mode: Some("worktree".to_string()),
            post_merge_action: Some("ask".to_string()),
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
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sound_enabled: Option<bool>,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            sound_enabled: Some(true),
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp: Option<McpSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<SkillSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification: Option<NotificationSettings>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut provider_settings = HashMap::new();
        provider_settings.insert(
            ProviderType::Claude,
            ProviderSettings::Claude(ClaudeProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::Codex,
            ProviderSettings::Codex(CodexProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::Gemini,
            ProviderSettings::Gemini(GeminiProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::OpenCode,
            ProviderSettings::OpenCode(OpenCodeProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::Kimi,
            ProviderSettings::Kimi(KimiProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::Qoder,
            ProviderSettings::Qoder(QoderProviderSettings::default()),
        );
        provider_settings.insert(
            ProviderType::QwenCode,
            ProviderSettings::QwenCode(QwenCodeProviderSettings::default()),
        );

        Self {
            general: Some(GeneralSettings::default()),
            appearance: Some(AppearanceSettings::default()),
            provider_settings,
            mcp: None,
            skills: None,
            notification: None,
        }
    }
}
