use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::error::{AppError, AppResult};
use crate::managers::SettingsManager;
use crate::models::skill::*;

pub struct SkillsManager {
    settings_manager: Arc<SettingsManager>,
    /// Cache of last-scanned discovered skills
    discovered_skills: Arc<RwLock<Vec<SkillConfig>>>,
}

impl SkillsManager {
    pub fn new(settings_manager: Arc<SettingsManager>) -> Self {
        Self {
            settings_manager,
            discovered_skills: Arc::new(RwLock::new(vec![])),
        }
    }

    // ---- Scanning ----

    /// Scan all known skill directories and cache the results.
    pub fn scan_all(&self) -> AppResult<Vec<SkillConfig>> {
        let mut discovered = Vec::new();

        // Scan Claude Code global skills: ~/.claude/skills/*/SKILL.md
        discovered.extend(self.scan_claude_skills());

        // Cache results
        *self.discovered_skills.write() = discovered.clone();

        Ok(discovered)
    }

    /// Scan Claude Code skills directory (~/.claude/skills/).
    fn scan_claude_skills(&self) -> Vec<SkillConfig> {
        let mut skills = Vec::new();

        let skills_dir = self.get_claude_skills_dir();
        if !skills_dir.exists() {
            return skills;
        }

        // Iterate over subdirectories in skills_dir
        let entries = match std::fs::read_dir(&skills_dir) {
            Ok(entries) => entries,
            Err(_) => return skills,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }

            if let Some(skill) = self.parse_skill_md(
                &skill_md,
                SkillSource::Global {
                    agent: "claude".to_string(),
                },
            ) {
                skills.push(skill);
            }
        }

        skills
    }

    /// Get the Claude skills directory.
    fn get_claude_skills_dir(&self) -> PathBuf {
        let claude_config_dir = self.get_claude_config_dir();
        claude_config_dir.join("skills")
    }

    /// Get the Claude config directory, respecting CLAUDE_CONFIG_DIR from provider settings.
    fn get_claude_config_dir(&self) -> PathBuf {
        use crate::models::{ProviderSettings, ProviderType};

        let settings = self.settings_manager.get_settings();
        if let Some(ProviderSettings::Claude(claude_settings)) =
            settings.provider_settings.get(&ProviderType::Claude)
        {
            if let Some(config_dir) = claude_settings.env_vars.get("CLAUDE_CONFIG_DIR") {
                let expanded = if config_dir.starts_with('~') {
                    if let Some(home) = dirs::home_dir() {
                        home.join(&config_dir[2..])
                    } else {
                        PathBuf::from(config_dir)
                    }
                } else {
                    PathBuf::from(config_dir)
                };
                return expanded;
            }
        }

        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/"))
            .join(".claude")
    }

    /// Parse a SKILL.md file: extract YAML frontmatter (name, description) and body content.
    fn parse_skill_md(&self, path: &Path, source: SkillSource) -> Option<SkillConfig> {
        let content = std::fs::read_to_string(path).ok()?;

        let (name, description, body) = Self::parse_frontmatter(&content, path);

        let id = match &source {
            SkillSource::Global { agent } => format!("global:{}:{}", agent, name),
            SkillSource::Project { agent, project_path } => {
                format!("project:{}:{}:{}", agent, Self::short_hash(project_path), name)
            }
            SkillSource::UserInstalled => format!("user:{}", name),
        };

        Some(SkillConfig {
            id,
            name,
            description,
            path: path.to_string_lossy().to_string(),
            content: body,
            enabled: true, // Default to enabled; will be overridden by settings
            source,
        })
    }

    /// Parse YAML frontmatter from markdown content.
    /// Expected format:
    /// ```
    /// ---
    /// name: My Skill
    /// description: Does something useful
    /// ---
    /// Actual content here...
    /// ```
    fn parse_frontmatter(content: &str, path: &Path) -> (String, String, String) {
        let trimmed = content.trim();

        if !trimmed.starts_with("---") {
            // No frontmatter — use directory name as name, entire content as body
            let dir_name = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            return (dir_name, String::new(), content.to_string());
        }

        // Find the closing ---
        let after_first = &trimmed[3..];
        let close_pos = after_first.find("\n---");
        if close_pos.is_none() {
            let dir_name = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            return (dir_name, String::new(), content.to_string());
        }

        let close_pos = close_pos.unwrap();
        let yaml_str = &after_first[..close_pos].trim();
        let body_start = 3 + close_pos + 4; // "---" + yaml + "\n---"
        let body = if body_start < trimmed.len() {
            trimmed[body_start..].trim().to_string()
        } else {
            String::new()
        };

        // Parse YAML frontmatter
        let name;
        let description;
        if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
            name = yaml
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_else(|| {
                    path.parent()
                        .and_then(|p| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                })
                .to_string();
            description = yaml
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        } else {
            let dir_name = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            name = dir_name;
            description = String::new();
        }

        (name, description, body)
    }

    /// Generate a short hash from a string.
    fn short_hash(s: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        format!("{:x}", hasher.finish())[..8].to_string()
    }

    // ---- CLI operations ----

    /// Execute a `npx skills <args>` command.
    pub fn execute_cli(&self, args: &[&str], cwd: Option<&str>) -> AppResult<CliResult> {
        let mut cmd = Command::new("npx");
        cmd.arg("skills");
        cmd.args(args);

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        let output = cmd.output().map_err(|e| {
            AppError::Skill(format!("Failed to execute npx skills: {}", e))
        })?;

        Ok(CliResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    }

    /// Install a skill via `npx skills add <source>`.
    pub fn install_skill(
        &self,
        source: &str,
        global: bool,
        agent: Option<&str>,
    ) -> AppResult<CliResult> {
        let mut args = vec!["add", source];
        if global {
            args.push("-g");
        }
        if let Some(a) = agent {
            args.push("--agent");
            args.push(a);
        }
        self.execute_cli(&args, None)
    }

    /// Remove a skill via `npx skills remove <name>`.
    pub fn remove_skill(
        &self,
        name: &str,
        global: bool,
        agent: Option<&str>,
    ) -> AppResult<CliResult> {
        let mut args = vec!["remove", name];
        if global {
            args.push("-g");
        }
        if let Some(a) = agent {
            args.push("--agent");
            args.push(a);
        }
        self.execute_cli(&args, None)
    }

    /// Update skills via `npx skills update`.
    pub fn update_skills(&self) -> AppResult<CliResult> {
        self.execute_cli(&["update"], None)
    }

    // ---- Toggle ----

    /// Toggle a skill's enabled state by adding/removing from disabled list.
    pub fn toggle_skill(&self, skill_id: &str, enabled: bool) -> AppResult<()> {
        let mut skill_settings = self.get_skill_settings();

        if enabled {
            skill_settings
                .disabled_skills
                .retain(|id| id != skill_id);
        } else if !skill_settings.disabled_skills.contains(&skill_id.to_string()) {
            skill_settings
                .disabled_skills
                .push(skill_id.to_string());
        }

        self.save_skill_settings(skill_settings)
    }

    // ---- Query ----

    /// Get all skills (discovered), with enable state resolved from settings.
    pub fn list_all_skills(&self) -> Vec<SkillConfig> {
        let skill_settings = self.get_skill_settings();
        let discovered = self.discovered_skills.read().clone();

        let disabled_set: HashSet<&str> = skill_settings
            .disabled_skills
            .iter()
            .map(|s| s.as_str())
            .collect();

        discovered
            .into_iter()
            .map(|mut s| {
                s.enabled = !disabled_set.contains(s.id.as_str());
                s
            })
            .collect()
    }

    /// Get enabled skill contents as (name, content) pairs for injection.
    pub fn get_enabled_skill_contents(&self) -> Vec<(String, String)> {
        self.list_all_skills()
            .into_iter()
            .filter(|s| s.enabled)
            .map(|s| (s.name, s.content))
            .collect()
    }

    // ---- Persistence helpers ----

    fn get_skill_settings(&self) -> SkillSettings {
        self.settings_manager
            .get_settings()
            .skills
            .unwrap_or_default()
    }

    fn save_skill_settings(&self, skills: SkillSettings) -> AppResult<()> {
        let mut settings = self.settings_manager.get_settings();
        settings.skills = Some(skills);
        self.settings_manager.update_settings(settings)
    }
}
