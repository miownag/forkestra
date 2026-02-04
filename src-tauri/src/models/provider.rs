use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
