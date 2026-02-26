use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Where an MCP server definition originated from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpServerSource {
    /// User-defined in Forkestra settings (global scope)
    User,
    /// User-defined in Forkestra settings (project scope)
    UserProject { project_path: String },
    /// Discovered from Claude Code global config (~/.claude/.claude.json)
    ClaudeGlobal,
    /// Discovered from Claude Code project config
    ClaudeProject { project_path: String },
    /// Discovered from Kimi CLI global config (~/.kimi/settings.json)
    KimiGlobal,
    /// Discovered from Kimi CLI project config
    KimiProject { project_path: String },
    /// Discovered from Codex global config (~/.codex/config.json)
    CodexGlobal,
    /// Discovered from Codex project config
    CodexProject { project_path: String },
}

/// Transport configuration for an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpTransport {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

/// A single MCP server config as stored/displayed in Forkestra.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Unique identifier
    /// - Discovered: "claude_global:{name}" or "claude_project:{hash}:{name}"
    /// - User-defined: UUID
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Transport configuration
    pub transport: McpTransport,
    /// Whether this server is enabled (will be included in ACP sessions)
    pub enabled: bool,
    /// Where this config originated from
    pub source: McpServerSource,
    /// When true, this server is available to ALL sessions regardless of directory.
    /// Defaults: *Global sources → true, *Project sources → false, User → true, UserProject → false.
    #[serde(default)]
    pub globally_available: bool,
}

/// MCP settings stored in ~/.forkestra/settings.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpSettings {
    /// User-defined MCP servers
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
    /// IDs of discovered servers that the user has explicitly disabled
    #[serde(default)]
    pub disabled_discovered: Vec<String>,
    /// User overrides for the globally_available flag on discovered servers
    #[serde(default)]
    pub globally_available_overrides: HashMap<String, bool>,
}
