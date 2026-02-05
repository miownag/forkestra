use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{AppSettings, ProviderSettings, ProviderType};

pub struct SettingsManager {
    settings: Arc<RwLock<AppSettings>>,
    settings_path: PathBuf,
}

impl SettingsManager {
    pub fn new(app_handle: &AppHandle) -> AppResult<Self> {
        // Use Tauri's app data directory for settings
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?;

        std::fs::create_dir_all(&app_data_dir)?;
        let settings_path = app_data_dir.join("settings.json");

        // Load existing settings or create default
        let settings = if settings_path.exists() {
            let content = std::fs::read_to_string(&settings_path)?;
            serde_json::from_str(&content).unwrap_or_else(|_| AppSettings::default())
        } else {
            AppSettings::default()
        };

        Ok(Self {
            settings: Arc::new(RwLock::new(settings)),
            settings_path,
        })
    }

    pub fn get_settings(&self) -> AppSettings {
        self.settings.read().clone()
    }

    pub fn update_settings(&self, settings: AppSettings) -> AppResult<()> {
        // Update in memory
        *self.settings.write() = settings;

        // Persist to file
        self.persist()
    }

    pub fn get_provider_settings(&self, provider_type: &ProviderType) -> Option<ProviderSettings> {
        self.settings
            .read()
            .provider_settings
            .get(provider_type)
            .cloned()
    }

    pub fn update_provider_settings(&self, settings: ProviderSettings) -> AppResult<()> {
        let provider_type = settings.get_provider_type();

        {
            let mut app_settings = self.settings.write();
            app_settings
                .provider_settings
                .insert(provider_type, settings);
        }

        // Persist
        self.persist()
    }

    fn persist(&self) -> AppResult<()> {
        let settings = self.settings.read().clone();
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| AppError::Io(format!("Failed to serialize settings: {}", e)))?;
        std::fs::write(&self.settings_path, content)?;
        Ok(())
    }
}
