use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    Claude,
    Kimi,
}

impl ProviderType {
    pub fn cli_command(&self) -> &'static str {
        match self {
            ProviderType::Claude => "claude",
            ProviderType::Kimi => "kimi",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            ProviderType::Claude => "Claude Code",
            ProviderType::Kimi => "Kimi Code",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub provider_type: ProviderType,
    pub name: String,
    pub cli_command: String,
    pub cli_path: Option<String>,
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider_type: ProviderType,
    pub custom_cli_path: Option<String>,
    pub api_key: Option<String>,
    pub enabled: bool,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            provider_type: ProviderType::Claude,
            custom_cli_path: None,
            api_key: None,
            enabled: true,
        }
    }
}

// Claude-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeProviderSettings {
    pub enabled: bool,
    pub custom_cli_path: Option<String>,
    pub disable_login_prompt: bool,
}

impl Default for ClaudeProviderSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            custom_cli_path: None,
            disable_login_prompt: false,
        }
    }
}

// Kimi-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KimiProviderSettings {
    pub enabled: bool,
    pub custom_cli_path: Option<String>,
}

impl Default for KimiProviderSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            custom_cli_path: None,
        }
    }
}

// Tagged enum for all provider settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider_type", rename_all = "snake_case")]
pub enum ProviderSettings {
    Claude(ClaudeProviderSettings),
    Kimi(KimiProviderSettings),
}

impl ProviderSettings {
    pub fn get_provider_type(&self) -> ProviderType {
        match self {
            ProviderSettings::Claude(_) => ProviderType::Claude,
            ProviderSettings::Kimi(_) => ProviderType::Kimi,
        }
    }

    pub fn custom_cli_path(&self) -> Option<&str> {
        match self {
            ProviderSettings::Claude(s) => s.custom_cli_path.as_deref(),
            ProviderSettings::Kimi(s) => s.custom_cli_path.as_deref(),
        }
    }

    pub fn is_enabled(&self) -> bool {
        match self {
            ProviderSettings::Claude(s) => s.enabled,
            ProviderSettings::Kimi(s) => s.enabled,
        }
    }
}
