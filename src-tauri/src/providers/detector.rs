use std::process::Command;
use std::sync::OnceLock;

use crate::error::AppResult;
use crate::models::{
    builtin_definitions, ProviderDefinition, ProviderInfo, ProviderSettings, ProviderType,
};

pub struct ProviderDetector;

/// Cached shell PATH environment variable
static SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();

impl ProviderDetector {
    /// Get the PATH from user's shell configuration
    pub fn get_shell_path() -> Option<String> {
        SHELL_PATH
            .get_or_init(|| {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

                // Try login+interactive shell first (-li loads both .zprofile and .zshrc)
                // Fall back to login-only (-l) if that fails
                for args in [&["-li", "-c", "echo $PATH"][..], &["-l", "-c", "echo $PATH"][..]] {
                    if let Ok(output) = Command::new(&shell).args(args).output() {
                        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !path.is_empty() {
                            return Some(path);
                        }
                    }
                }

                None
            })
            .clone()
    }

    /// Find executable in PATH, trying shell PATH first
    pub fn find_in_path(command: &str) -> Option<std::path::PathBuf> {
        // First try with shell's PATH (more likely to have user-installed tools)
        if let Some(shell_path) = Self::get_shell_path() {
            for dir in shell_path.split(':') {
                let full_path = std::path::Path::new(dir).join(command);
                if full_path.is_file() {
                    return Some(full_path);
                }
            }
        }

        // Fall back to standard which (current process PATH)
        if let Ok(path) = which::which(command) {
            return Some(path);
        }

        // Last resort: check common user-level bin directories that GUI apps may miss
        if let Some(home) = std::env::var("HOME").ok() {
            let common_dirs = [
                format!("{home}/.local/bin"),
                format!("{home}/.bun/bin"),
                format!("{home}/.cargo/bin"),
                format!("{home}/.npm-global/bin"),
                "/usr/local/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
            ];
            for dir in &common_dirs {
                let full_path = std::path::Path::new(dir).join(command);
                if full_path.is_file() {
                    return Some(full_path);
                }
            }
        }

        None
    }

    /// Detect all providers from definitions + settings.
    /// `definitions` should be `builtin_definitions()` merged with `AppSettings.custom_providers`.
    pub fn detect_all_with_definitions(
        definitions: &[ProviderDefinition],
        provider_settings: &std::collections::HashMap<String, ProviderSettings>,
    ) -> Vec<ProviderInfo> {
        definitions
            .iter()
            .map(|def| {
                let settings = provider_settings.get(&def.id);
                let custom_cli_path = settings.and_then(|s| s.custom_cli_path.as_deref());
                Self::detect_provider_from_def(def, custom_cli_path)
            })
            .collect()
    }

    /// Detect a provider from its definition and optional custom CLI path.
    pub fn detect_provider_from_def(
        def: &ProviderDefinition,
        custom_cli_path: Option<&str>,
    ) -> ProviderInfo {
        let provider_type = ProviderType::from_id(&def.id);

        // npx-based providers that don't have a cli_command are always "installed"
        if def.cli_command.is_none() && def.command == "npx" {
            return ProviderInfo {
                provider_type,
                name: def.name.clone(),
                cli_command: def.command.clone(),
                cli_path: None,
                installed: true,
                version: None,
                builtin: def.builtin,
            };
        }

        let cli_command = def
            .cli_command
            .as_deref()
            .unwrap_or(&def.command);

        // Try custom CLI path first, then fall back to PATH
        let (cli_path, installed) = if let Some(custom_path) = custom_cli_path {
            let path = std::path::Path::new(custom_path);
            if path.exists() {
                (Some(custom_path.to_string()), true)
            } else {
                // Custom path doesn't exist, try PATH
                let path_from_which = Self::find_in_path(cli_command);
                let installed = path_from_which.is_some();
                (
                    path_from_which.map(|p| p.to_string_lossy().to_string()),
                    installed,
                )
            }
        } else {
            // Try to find the CLI in PATH (including shell PATH)
            let path = Self::find_in_path(cli_command);
            let installed = path.is_some();
            (path.map(|p| p.to_string_lossy().to_string()), installed)
        };

        // Try to get version if installed
        let version = if installed {
            let version_cmd = cli_path.as_deref().unwrap_or(cli_command);
            Self::get_version(version_cmd).ok()
        } else {
            None
        };

        ProviderInfo {
            provider_type,
            name: def.name.clone(),
            cli_command: cli_command.to_string(),
            cli_path,
            installed,
            version,
            builtin: def.builtin,
        }
    }

    /// Detect a specific provider (backward-compat helper for built-in types)
    pub fn detect_provider(
        provider_type: &ProviderType,
        custom_cli_path: Option<&str>,
    ) -> ProviderInfo {
        let id = provider_type.as_id();
        let defs = builtin_definitions();
        if let Some(def) = defs.iter().find(|d| d.id == id) {
            Self::detect_provider_from_def(def, custom_cli_path)
        } else {
            // Unknown provider without a definition
            ProviderInfo {
                provider_type: provider_type.clone(),
                name: provider_type.display_name().to_string(),
                cli_command: id.to_string(),
                cli_path: None,
                installed: false,
                version: None,
                builtin: false,
            }
        }
    }

    /// Get the version of a CLI tool
    fn get_version(cli_command: &str) -> AppResult<String> {
        // Build command with shell PATH so GUI-launched apps can find the CLI
        let mut cmd = Command::new(cli_command);
        cmd.arg("--version");
        if let Some(shell_path) = Self::get_shell_path() {
            cmd.env("PATH", &shell_path);
        }

        let result = cmd.output();

        let output = match result {
            Ok(output) => output,
            Err(_) => {
                // If direct execution fails, try through shell
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                Command::new(&shell)
                    .args(["-li", "-c", &format!("{} --version", cli_command)])
                    .output()
                    .map_err(|e| crate::error::AppError::Provider(e.to_string()))?
            }
        };

        let version_str = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();

        // Parse version string (format varies by CLI)
        let version = version_str
            .split(|c: char| c.is_whitespace() || c == ',')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or(&version_str)
            .to_string();

        Ok(version)
    }
}
