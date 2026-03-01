use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::{AppSettings, ProviderSettings};

pub struct SettingsManager {
    settings: Arc<RwLock<AppSettings>>,
    settings_path: PathBuf,
}

impl SettingsManager {
    pub fn new(_app_handle: &AppHandle) -> AppResult<Self> {
        // Use ~/.forkestra for settings (like VSCode uses ~/.vscode)
        let home_dir = dirs::home_dir()
            .ok_or_else(|| AppError::Io("Failed to get home directory".to_string()))?;

        let forkestra_dir = home_dir.join(".forkestra");
        std::fs::create_dir_all(&forkestra_dir)?;
        let settings_path = forkestra_dir.join("settings.json");

        // Load existing settings or create default
        let mut settings = if settings_path.exists() {
            let content = std::fs::read_to_string(&settings_path)?;
            match serde_json::from_str::<AppSettings>(&content) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[SettingsManager] Failed to parse settings.json, attempting migration: {}", e);
                    // Try to migrate from old format
                    Self::migrate_settings(&content).unwrap_or_else(|| {
                        eprintln!("[SettingsManager] Migration failed, using defaults");
                        AppSettings::default()
                    })
                }
            }
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
        // Ensure all builtin providers have settings entries
        for (id, default_settings) in &defaults.provider_settings {
            settings
                .provider_settings
                .entry(id.clone())
                .or_insert_with(|| default_settings.clone());
        }

        // Persist merged settings
        if let Ok(json) = serde_json::to_string_pretty(&settings) {
            let _ = std::fs::write(&settings_path, json);
        }

        Ok(Self {
            settings: Arc::new(RwLock::new(settings)),
            settings_path,
        })
    }

    /// Attempt to migrate old-format settings (tagged enum provider_settings) to new flat format.
    fn migrate_settings(content: &str) -> Option<AppSettings> {
        // Parse as generic JSON value
        let mut value: serde_json::Value = serde_json::from_str(content).ok()?;

        // Check if provider_settings contains old-format entries (with provider_type field)
        if let Some(ps) = value.get_mut("provider_settings") {
            if let Some(ps_obj) = ps.as_object_mut() {
                let mut migrated = serde_json::Map::new();
                for (key, val) in ps_obj.iter() {
                    if let Some(obj) = val.as_object() {
                        // Old format has a "provider_type" field inside each entry
                        if obj.contains_key("provider_type") {
                            // Migrate: extract enabled, custom_cli_path, env_vars
                            let mut new_entry = serde_json::Map::new();
                            new_entry.insert(
                                "enabled".to_string(),
                                obj.get("enabled")
                                    .cloned()
                                    .unwrap_or(serde_json::Value::Bool(true)),
                            );
                            new_entry.insert(
                                "custom_cli_path".to_string(),
                                obj.get("custom_cli_path")
                                    .cloned()
                                    .unwrap_or(serde_json::Value::Null),
                            );
                            let mut env_vars = obj
                                .get("env_vars")
                                .and_then(|v| v.as_object().cloned())
                                .unwrap_or_default();

                            // Migrate Claude's disable_login_prompt → DISABLE_AUTHN env var
                            if key == "claude" {
                                if let Some(disable) = obj.get("disable_login_prompt") {
                                    if disable.as_bool().unwrap_or(false) {
                                        env_vars.insert(
                                            "DISABLE_AUTHN".to_string(),
                                            serde_json::Value::String("1".to_string()),
                                        );
                                    }
                                }
                            }

                            new_entry.insert(
                                "env_vars".to_string(),
                                serde_json::Value::Object(env_vars),
                            );
                            migrated.insert(key.clone(), serde_json::Value::Object(new_entry));
                        } else {
                            // Already new format
                            migrated.insert(key.clone(), val.clone());
                        }
                    }
                }
                *ps = serde_json::Value::Object(migrated);
            }
        }

        serde_json::from_value(value).ok()
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

    /// Get provider settings by provider id string.
    pub fn get_provider_settings_by_id(&self, provider_id: &str) -> Option<ProviderSettings> {
        self.settings
            .read()
            .provider_settings
            .get(provider_id)
            .cloned()
    }

    /// Update provider settings by provider id string.
    pub fn update_provider_settings_by_id(
        &self,
        provider_id: &str,
        settings: ProviderSettings,
    ) -> AppResult<()> {
        {
            let mut app_settings = self.settings.write();
            app_settings
                .provider_settings
                .insert(provider_id.to_string(), settings);
        }

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
