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
        // Use ~/.forkestra for settings (like VSCode uses ~/.vscode)
        let home_dir = dirs::home_dir()
            .ok_or_else(|| AppError::Io("Failed to get home directory".to_string()))?;

        let forkestra_dir = home_dir.join(".forkestra");
        std::fs::create_dir_all(&forkestra_dir)?;
        let settings_path = forkestra_dir.join("settings.json");

        // Load existing settings or create default
        let mut settings = if settings_path.exists() {
            let content = std::fs::read_to_string(&settings_path)?;
            serde_json::from_str(&content).unwrap_or_else(|_| AppSettings::default())
        } else {
            AppSettings::default()
        };

        // Merge with defaults to ensure new fields are populated
        let defaults = AppSettings::default();
        if settings.general.is_none() {
            settings.general = defaults.general;
        }
        if settings.appearance.is_none() {
            settings.appearance = defaults.appearance;
        }

        // Persist merged settings if file exists
        if settings_path.exists() {
            if let Ok(json) = serde_json::to_string_pretty(&settings) {
                let _ = std::fs::write(&settings_path, json);
            }
        }

        Ok(Self {
            settings: Arc::new(RwLock::new(settings)),
            settings_path,
        })
    }

    pub fn get_settings(&self) -> AppSettings {
        self.settings.read().clone()
    }

    pub fn get_settings_path(&self) -> PathBuf {
        self.settings_path.clone()
    }

    pub fn get_settings_json(&self) -> AppResult<String> {
        let settings = self.settings.read().clone();
        serde_json::to_string_pretty(&settings)
            .map_err(|e| AppError::Io(format!("Failed to serialize settings: {}", e)))
    }

    pub fn update_settings_from_json(&self, json: &str) -> AppResult<()> {
        let settings: AppSettings = serde_json::from_str(json)
            .map_err(|e| AppError::InvalidOperation(format!("Invalid JSON: {}", e)))?;

        // Update in memory
        *self.settings.write() = settings;

        // Persist to file
        self.persist()
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
