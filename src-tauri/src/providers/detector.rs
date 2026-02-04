use std::process::Command;

use crate::error::AppResult;
use crate::models::{ProviderInfo, ProviderType};

pub struct ProviderDetector;

impl ProviderDetector {
    /// Detect all available providers
    pub fn detect_all() -> Vec<ProviderInfo> {
        let providers = vec![ProviderType::Claude, ProviderType::Kimi];

        providers
            .into_iter()
            .map(|p| Self::detect_provider(&p))
            .collect()
    }

    /// Detect a specific provider
    pub fn detect_provider(provider_type: &ProviderType) -> ProviderInfo {
        let cli_command = provider_type.cli_command();

        // Try to find the CLI in PATH
        let cli_path = which::which(cli_command).ok();
        let installed = cli_path.is_some();

        // Try to get version if installed
        let version = if installed {
            Self::get_version(cli_command).ok()
        } else {
            None
        };

        ProviderInfo {
            provider_type: provider_type.clone(),
            name: provider_type.display_name().to_string(),
            cli_command: cli_command.to_string(),
            cli_path: cli_path.map(|p| p.to_string_lossy().to_string()),
            installed,
            version,
        }
    }

    /// Get the version of a CLI tool
    fn get_version(cli_command: &str) -> AppResult<String> {
        let output = Command::new(cli_command)
            .arg("--version")
            .output()
            .map_err(|e| crate::error::AppError::Provider(e.to_string()))?;

        let version = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();

        // Parse version string (format varies by CLI)
        // Claude Code: "claude x.y.z"
        // Kimi Code: "kimi x.y.z"
        let version = version
            .split_whitespace()
            .last()
            .unwrap_or(&version)
            .to_string();

        Ok(version)
    }
}
