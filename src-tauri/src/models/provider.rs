use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

/// Known built-in provider IDs. Unknown strings deserialize as `Custom(String)`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ProviderType {
    Claude,
    Codex,
    Gemini,
    OpenCode,
    Kimi,
    Qoder,
    QwenCode,
    Custom(String),
}

impl ProviderType {
    /// The canonical string id (used in JSON, DB, and settings keys).
    pub fn as_id(&self) -> &str {
        match self {
            ProviderType::Claude => "claude",
            ProviderType::Codex => "codex",
            ProviderType::Gemini => "gemini",
            ProviderType::OpenCode => "open_code",
            ProviderType::Kimi => "kimi",
            ProviderType::Qoder => "qoder",
            ProviderType::QwenCode => "qwen_code",
            ProviderType::Custom(id) => id.as_str(),
        }
    }

    /// Parse from a string id. Known ids map to built-in variants; unknown → Custom.
    pub fn from_id(id: &str) -> Self {
        match id {
            "claude" => ProviderType::Claude,
            "codex" => ProviderType::Codex,
            "gemini" => ProviderType::Gemini,
            "open_code" => ProviderType::OpenCode,
            "kimi" => ProviderType::Kimi,
            "qoder" => ProviderType::Qoder,
            "qwen_code" => ProviderType::QwenCode,
            other => ProviderType::Custom(other.to_string()),
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            ProviderType::Claude => "Claude Code",
            ProviderType::Kimi => "Kimi Code",
            ProviderType::Codex => "Codex",
            ProviderType::Gemini => "Gemini CLI",
            ProviderType::OpenCode => "OpenCode",
            ProviderType::Qoder => "Qoder CLI",
            ProviderType::QwenCode => "Qwen Code",
            ProviderType::Custom(id) => id.as_str(),
        }
    }
}

impl Serialize for ProviderType {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_id())
    }
}

impl<'de> Deserialize<'de> for ProviderType {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(ProviderType::from_id(&s))
    }
}

/// Describes how to launch an ACP provider process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDefinition {
    /// Unique id matching ProviderType's string form, e.g. "claude", "my-agent"
    pub id: String,
    /// Human-readable name, e.g. "Claude Code"
    pub name: String,
    /// Executable to run, e.g. "npx", "kimi", "/usr/local/bin/agent"
    pub command: String,
    /// Arguments to pass after the command, e.g. ["@zed-industries/claude-agent-acp"]
    pub args: Vec<String>,
    /// CLI binary name used for detection in PATH, e.g. "claude". None for npx-based.
    #[serde(default)]
    pub cli_command: Option<String>,
    /// Default environment variables to set when spawning
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Whether this is a built-in provider (cannot be deleted by user)
    #[serde(default)]
    pub builtin: bool,
}

/// Returns the 7 built-in provider definitions with their launch configurations.
pub fn builtin_definitions() -> Vec<ProviderDefinition> {
    vec![
        ProviderDefinition {
            id: "claude".to_string(),
            name: "Claude Code".to_string(),
            command: "npx".to_string(),
            args: vec!["@zed-industries/claude-agent-acp".to_string()],
            cli_command: Some("claude".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            command: "npx".to_string(),
            args: vec!["@zed-industries/codex-acp".to_string()],
            cli_command: None, // npx-based, always available
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "gemini".to_string(),
            name: "Gemini CLI".to_string(),
            command: "gemini".to_string(),
            args: vec!["--experimental-acp".to_string()],
            cli_command: Some("gemini".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "open_code".to_string(),
            name: "OpenCode".to_string(),
            command: "opencode".to_string(),
            args: vec!["acp".to_string()],
            cli_command: Some("opencode".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "kimi".to_string(),
            name: "Kimi Code".to_string(),
            command: "kimi".to_string(),
            args: vec!["acp".to_string()],
            cli_command: Some("kimi".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "qoder".to_string(),
            name: "Qoder CLI".to_string(),
            command: "qodercli".to_string(),
            args: vec!["--acp".to_string()],
            cli_command: Some("qodercli".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
        ProviderDefinition {
            id: "qwen_code".to_string(),
            name: "Qwen Code".to_string(),
            command: "qwen".to_string(),
            args: vec!["--acp".to_string()],
            cli_command: Some("qwen".to_string()),
            env: HashMap::new(),
            builtin: true,
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub provider_type: ProviderType,
    pub name: String,
    pub cli_command: String,
    pub cli_path: Option<String>,
    pub installed: bool,
    pub version: Option<String>,
    #[serde(default)]
    pub builtin: bool,
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

/// Unified provider settings — replaces the previous per-provider settings structs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub custom_cli_path: Option<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
}

fn default_true() -> bool {
    true
}

impl Default for ProviderSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            custom_cli_path: None,
            env_vars: HashMap::new(),
        }
    }
}
