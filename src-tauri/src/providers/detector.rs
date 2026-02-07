use std::process::Command;
use std::sync::OnceLock;

use crate::error::AppResult;
use crate::models::{ProviderInfo, ProviderType};

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

    /// Detect all available providers
    pub fn detect_all() -> Vec<ProviderInfo> {
        let providers = vec![ProviderType::Claude, ProviderType::Kimi];

        providers
            .into_iter()
            .map(|p| Self::detect_provider(&p, None))
            .collect()
    }

    /// Detect all available providers with custom CLI paths
    pub fn detect_all_with_settings(
        claude_custom_path: Option<&str>,
        kimi_custom_path: Option<&str>,
    ) -> Vec<ProviderInfo> {
        vec![
            Self::detect_provider(&ProviderType::Claude, claude_custom_path),
            Self::detect_provider(&ProviderType::Kimi, kimi_custom_path),
        ]
    }

    /// Detect a specific provider
    pub fn detect_provider(
        provider_type: &ProviderType,
        custom_cli_path: Option<&str>,
    ) -> ProviderInfo {
        let cli_command = provider_type.cli_command();

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
            provider_type: provider_type.clone(),
            name: provider_type.display_name().to_string(),
            cli_command: cli_command.to_string(),
            cli_path,
            installed,
            version,
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
        // Claude Code: "claude x.y.z"
        // Kimi Code: "kimi, version 1.8.0"
        // Extract the last token that looks like a version number
        let version = version_str
            .split(|c: char| c.is_whitespace() || c == ',')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or(&version_str)
            .to_string();

        Ok(version)
    }
}
