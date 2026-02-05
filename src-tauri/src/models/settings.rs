use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::provider::{
    ClaudeProviderSettings, KimiProviderSettings, ProviderSettings, ProviderType,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
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

        Self { provider_settings }
    }
}
