use serde::{Deserialize, Serialize};

/// Where a skill definition originated from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SkillSource {
    /// Discovered from an agent's global skills directory
    Global { agent: String },
    /// Discovered from a project-level skills directory
    Project {
        agent: String,
        project_path: String,
    },
    /// Installed by the user via `npx skills add`
    UserInstalled,
}

/// A single skill config as stored/displayed in Forkestra.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillConfig {
    /// Unique identifier (e.g. "global:claude:skill-name" or UUID)
    pub id: String,
    /// Human-readable name (from frontmatter or directory name)
    pub name: String,
    /// Short description (from frontmatter)
    pub description: String,
    /// File system path to the SKILL.md
    pub path: String,
    /// Full markdown content of the skill
    pub content: String,
    /// Whether this skill is enabled
    pub enabled: bool,
    /// Where this skill originated from
    pub source: SkillSource,
}

/// Skill settings stored in ~/.forkestra/settings.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillSettings {
    /// IDs of skills that the user has explicitly disabled
    #[serde(default)]
    pub disabled_skills: Vec<String>,
}

/// Options for `npx skills add` command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInstallOptions {
    /// Source repository (e.g. "vercel-labs/agent-skills")
    pub source: String,
    /// Install globally (-g)
    #[serde(default)]
    pub global: bool,
    /// Target agents (--agent), supports multiple and `*` wildcard
    #[serde(default)]
    pub agent: Option<Vec<String>>,
    /// Specific skills to install (--skill), supports multiple and `*` wildcard
    #[serde(default)]
    pub skill: Option<Vec<String>>,
    /// Skip all confirmation prompts (-y)
    #[serde(default)]
    pub yes: bool,
    /// Install all skills to all agents (--all)
    #[serde(default)]
    pub all: bool,
    /// Search all subdirectories even if root has SKILL.md (--full-depth)
    #[serde(default)]
    pub full_depth: bool,
    /// Copy files instead of symlinking (--copy)
    #[serde(default)]
    pub copy: bool,
    /// Project directory for non-global installs (used as cwd)
    #[serde(default)]
    pub project_path: Option<String>,
}

/// Result from running a CLI command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}
