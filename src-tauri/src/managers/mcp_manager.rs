use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::RwLock;

use crate::error::{AppError, AppResult};
use crate::managers::SettingsManager;
use crate::models::mcp::*;

use agent_client_protocol::{
    EnvVariable, HttpHeader, McpServer, McpServerHttp, McpServerSse, McpServerStdio,
};

pub struct McpManager {
    settings_manager: Arc<SettingsManager>,
    /// Cache of last-scanned discovered servers
    discovered_servers: Arc<RwLock<Vec<McpServerConfig>>>,
}

impl McpManager {
    pub fn new(settings_manager: Arc<SettingsManager>) -> Self {
        Self {
            settings_manager,
            discovered_servers: Arc::new(RwLock::new(vec![])),
        }
    }

    // ---- Scanning ----

    /// Scan all known agent config files and cache the discovered MCP servers.
    pub fn scan_all(&self) -> AppResult<Vec<McpServerConfig>> {
        let mut discovered = Vec::new();

        // Scan Claude Code configs
        discovered.extend(self.scan_claude_configs());

        // Scan Kimi CLI configs
        discovered.extend(self.scan_kimi_configs());

        // Scan Codex configs
        discovered.extend(self.scan_codex_configs());

        // Scan Gemini configs
        discovered.extend(self.scan_gemini_configs());

        // Cache results
        *self.discovered_servers.write() = discovered.clone();

        Ok(discovered)
    }

    /// Scan Claude Code config files for MCP servers.
    /// Reads ~/.claude/.claude.json (or CLAUDE_CONFIG_DIR/.claude.json)
    fn scan_claude_configs(&self) -> Vec<McpServerConfig> {
        let mut servers = Vec::new();

        // Determine Claude config directory
        let claude_config_dir = self.get_claude_config_dir();

        // Scan global config
        let global_config_path = claude_config_dir.join(".claude.json");
        if global_config_path.exists() {
            let global_servers =
                Self::parse_claude_config(&global_config_path, McpServerSource::ClaudeGlobal);
            servers.extend(global_servers);

            // Also scan per-project configs from the projects key
            if let Ok(content) = std::fs::read_to_string(&global_config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(projects) = json.get("projects").and_then(|p| p.as_object()) {
                        for (project_path, project_config) in projects {
                            if let Some(mcp_obj) =
                                project_config.get("mcpServers").and_then(|m| m.as_object())
                            {
                                let project_servers = Self::parse_mcp_servers_object(
                                    mcp_obj,
                                    McpServerSource::ClaudeProject {
                                        project_path: project_path.clone(),
                                    },
                                    &format!("claude_project:{}", Self::short_hash(project_path)),
                                );
                                servers.extend(project_servers);
                            }
                        }
                    }
                }
            }
        }

        servers
    }

    /// Get the Claude config directory, respecting CLAUDE_CONFIG_DIR from provider settings.
    fn get_claude_config_dir(&self) -> PathBuf {
        let settings = self.settings_manager.get_settings();
        if let Some(provider_settings) = settings.provider_settings.get("claude") {
            if let Some(config_dir) = provider_settings.env_vars.get("CLAUDE_CONFIG_DIR") {
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

        // Default: ~/.claude
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/"))
            .join(".claude")
    }

    /// Scan Kimi CLI config files for MCP servers.
    /// Reads ~/.kimi/settings.json
    fn scan_kimi_configs(&self) -> Vec<McpServerConfig> {
        let mut servers = Vec::new();

        let kimi_config_dir = self.get_provider_config_dir(
            "kimi",
            "KIMI_CONFIG_DIR",
            ".kimi",
        );

        let global_config_path = kimi_config_dir.join("settings.json");
        if global_config_path.exists() {
            let global_servers = Self::parse_generic_mcp_config(
                &global_config_path,
                McpServerSource::KimiGlobal,
                "kimi_global",
            );
            servers.extend(global_servers);

            // Scan per-project configs from the projects key
            if let Ok(content) = std::fs::read_to_string(&global_config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(projects) = json.get("projects").and_then(|p| p.as_object()) {
                        for (project_path, project_config) in projects {
                            if let Some(mcp_obj) =
                                project_config.get("mcpServers").and_then(|m| m.as_object())
                            {
                                let project_servers = Self::parse_mcp_servers_object(
                                    mcp_obj,
                                    McpServerSource::KimiProject {
                                        project_path: project_path.clone(),
                                    },
                                    &format!("kimi_project:{}", Self::short_hash(project_path)),
                                );
                                servers.extend(project_servers);
                            }
                        }
                    }
                }
            }
        }

        servers
    }

    /// Scan Codex config files for MCP servers.
    /// Reads ~/.codex/config.json
    fn scan_codex_configs(&self) -> Vec<McpServerConfig> {
        let mut servers = Vec::new();

        let codex_config_dir = self.get_provider_config_dir(
            "codex",
            "CODEX_CONFIG_DIR",
            ".codex",
        );

        let global_config_path = codex_config_dir.join("config.json");
        if global_config_path.exists() {
            let global_servers = Self::parse_generic_mcp_config(
                &global_config_path,
                McpServerSource::CodexGlobal,
                "codex_global",
            );
            servers.extend(global_servers);

            // Scan per-project configs from the projects key
            if let Ok(content) = std::fs::read_to_string(&global_config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(projects) = json.get("projects").and_then(|p| p.as_object()) {
                        for (project_path, project_config) in projects {
                            if let Some(mcp_obj) =
                                project_config.get("mcpServers").and_then(|m| m.as_object())
                            {
                                let project_servers = Self::parse_mcp_servers_object(
                                    mcp_obj,
                                    McpServerSource::CodexProject {
                                        project_path: project_path.clone(),
                                    },
                                    &format!("codex_project:{}", Self::short_hash(project_path)),
                                );
                                servers.extend(project_servers);
                            }
                        }
                    }
                }
            }
        }

        servers
    }

    /// Scan Gemini CLI config files for MCP servers.
    /// Reads ~/.gemini/settings.json
    fn scan_gemini_configs(&self) -> Vec<McpServerConfig> {
        let mut servers = Vec::new();

        let gemini_config_dir = self.get_provider_config_dir(
            "gemini",
            "GEMINI_CONFIG_DIR",
            ".gemini",
        );

        let global_config_path = gemini_config_dir.join("settings.json");
        if global_config_path.exists() {
            let global_servers = Self::parse_generic_mcp_config(
                &global_config_path,
                McpServerSource::GeminiGlobal,
                "gemini_global",
            );
            servers.extend(global_servers);

            // Scan per-project configs from the projects key
            if let Ok(content) = std::fs::read_to_string(&global_config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(projects) = json.get("projects").and_then(|p| p.as_object()) {
                        for (project_path, project_config) in projects {
                            if let Some(mcp_obj) =
                                project_config.get("mcpServers").and_then(|m| m.as_object())
                            {
                                let project_servers = Self::parse_mcp_servers_object(
                                    mcp_obj,
                                    McpServerSource::GeminiProject {
                                        project_path: project_path.clone(),
                                    },
                                    &format!("gemini_project:{}", Self::short_hash(project_path)),
                                );
                                servers.extend(project_servers);
                            }
                        }
                    }
                }
            }
        }

        servers
    }

    /// Get config directory for a provider, respecting env var overrides from settings.
    fn get_provider_config_dir(
        &self,
        provider_id: &str,
        env_var_name: &str,
        default_dir: &str,
    ) -> PathBuf {
        let settings = self.settings_manager.get_settings();

        // Check if provider has a custom config dir env var
        if let Some(provider_settings) = settings.provider_settings.get(provider_id) {
            if let Some(config_dir) = provider_settings.env_vars.get(env_var_name) {
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
            .join(default_dir)
    }

    /// Parse a generic config file for mcpServers (works for any provider config format).
    fn parse_generic_mcp_config(
        path: &Path,
        source: McpServerSource,
        id_prefix: &str,
    ) -> Vec<McpServerConfig> {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return vec![],
        };

        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(j) => j,
            Err(_) => return vec![],
        };

        let mcp_obj = match json.get("mcpServers").and_then(|m| m.as_object()) {
            Some(obj) => obj,
            None => return vec![],
        };

        Self::parse_mcp_servers_object(mcp_obj, source, id_prefix)
    }

    /// Parse a Claude Code config file and extract global-level mcpServers.
    fn parse_claude_config(path: &Path, source: McpServerSource) -> Vec<McpServerConfig> {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return vec![],
        };

        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(j) => j,
            Err(_) => return vec![],
        };

        let mcp_obj = match json.get("mcpServers").and_then(|m| m.as_object()) {
            Some(obj) => obj,
            None => return vec![],
        };

        let id_prefix = match &source {
            McpServerSource::ClaudeGlobal => "claude_global".to_string(),
            McpServerSource::ClaudeProject { project_path } => {
                format!("claude_project:{}", Self::short_hash(project_path))
            }
            McpServerSource::KimiGlobal => "kimi_global".to_string(),
            McpServerSource::KimiProject { project_path } => {
                format!("kimi_project:{}", Self::short_hash(project_path))
            }
            McpServerSource::CodexGlobal => "codex_global".to_string(),
            McpServerSource::CodexProject { project_path } => {
                format!("codex_project:{}", Self::short_hash(project_path))
            }
            McpServerSource::GeminiGlobal => "gemini_global".to_string(),
            McpServerSource::GeminiProject { project_path } => {
                format!("gemini_project:{}", Self::short_hash(project_path))
            }
            _ => "unknown".to_string(),
        };

        Self::parse_mcp_servers_object(mcp_obj, source, &id_prefix)
    }

    /// Parse an mcpServers JSON object (shared between global and project configs).
    fn parse_mcp_servers_object(
        mcp_obj: &serde_json::Map<String, serde_json::Value>,
        source: McpServerSource,
        id_prefix: &str,
    ) -> Vec<McpServerConfig> {
        let mut servers = Vec::new();

        for (name, config) in mcp_obj {
            if let Some(transport) = Self::parse_transport(config) {
                let globally_available = matches!(
                    source,
                    McpServerSource::ClaudeGlobal
                        | McpServerSource::KimiGlobal
                        | McpServerSource::CodexGlobal
                        | McpServerSource::GeminiGlobal
                        | McpServerSource::User
                );
                servers.push(McpServerConfig {
                    id: format!("{}:{}", id_prefix, name),
                    name: name.clone(),
                    transport,
                    enabled: true, // Discovered servers default to enabled
                    source: source.clone(),
                    globally_available,
                });
            }
        }

        servers
    }

    /// Parse transport from a Claude config MCP server entry.
    fn parse_transport(config: &serde_json::Value) -> Option<McpTransport> {
        let obj = config.as_object()?;

        // Check for explicit type field
        if let Some(type_val) = obj.get("type").and_then(|t| t.as_str()) {
            match type_val {
                "http" => {
                    let url = obj.get("url").and_then(|u| u.as_str())?.to_string();
                    let headers = Self::parse_headers_object(obj.get("headers"));
                    return Some(McpTransport::Http { url, headers });
                }
                "sse" => {
                    let url = obj.get("url").and_then(|u| u.as_str())?.to_string();
                    let headers = Self::parse_headers_object(obj.get("headers"));
                    return Some(McpTransport::Sse { url, headers });
                }
                _ => {}
            }
        }

        // If "command" field is present, it's stdio
        if let Some(command) = obj.get("command").and_then(|c| c.as_str()) {
            let args = obj
                .get("args")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let env = obj
                .get("env")
                .and_then(|e| e.as_object())
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            return Some(McpTransport::Stdio {
                command: command.to_string(),
                args,
                env,
            });
        }

        // If "url" field is present without explicit type, treat as http
        if let Some(url) = obj.get("url").and_then(|u| u.as_str()) {
            let headers = Self::parse_headers_object(obj.get("headers"));
            return Some(McpTransport::Http {
                url: url.to_string(),
                headers,
            });
        }

        None
    }

    /// Parse headers from either an object {"key": "value"} format.
    fn parse_headers_object(val: Option<&serde_json::Value>) -> HashMap<String, String> {
        val.and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Generate a short hash from a string (first 8 chars of hex-encoded hash).
    fn short_hash(s: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        format!("{:x}", hasher.finish())[..8].to_string()
    }

    // ---- CRUD for user-defined servers ----

    pub fn add_server(&self, mut config: McpServerConfig) -> AppResult<McpServerConfig> {
        // Ensure id is set for user-defined servers
        if config.id.is_empty() {
            config.id = uuid::Uuid::new_v4().to_string();
        }
        // Preserve UserProject source if provided, otherwise default to User
        match &config.source {
            McpServerSource::UserProject { .. } => {}
            _ => config.source = McpServerSource::User,
        }

        let mut mcp_settings = self.get_mcp_settings();
        mcp_settings.servers.push(config.clone());
        self.save_mcp_settings(mcp_settings)?;

        Ok(config)
    }

    pub fn update_server(&self, config: McpServerConfig) -> AppResult<McpServerConfig> {
        let mut mcp_settings = self.get_mcp_settings();

        if let Some(existing) = mcp_settings.servers.iter_mut().find(|s| s.id == config.id) {
            existing.name = config.name.clone();
            existing.transport = config.transport.clone();
            existing.enabled = config.enabled;
        } else {
            return Err(AppError::InvalidOperation(format!(
                "Server '{}' not found",
                config.id
            )));
        }

        self.save_mcp_settings(mcp_settings)?;
        Ok(config)
    }

    pub fn delete_server(&self, server_id: &str) -> AppResult<()> {
        let mut mcp_settings = self.get_mcp_settings();

        let before = mcp_settings.servers.len();
        mcp_settings.servers.retain(|s| s.id != server_id);

        if mcp_settings.servers.len() == before {
            return Err(AppError::InvalidOperation(format!(
                "Server '{}' not found",
                server_id
            )));
        }

        self.save_mcp_settings(mcp_settings)
    }

    // ---- Toggle ----

    /// Toggle a server's enabled state.
    /// For user-defined, updates the server directly.
    /// For discovered, adds/removes from disabled_discovered list.
    pub fn toggle_server(&self, server_id: &str, enabled: bool) -> AppResult<()> {
        let mut mcp_settings = self.get_mcp_settings();

        // Check if it's a user-defined server
        if let Some(server) = mcp_settings.servers.iter_mut().find(|s| s.id == server_id) {
            server.enabled = enabled;
        } else {
            // It's a discovered server - manage the deny-list
            if enabled {
                mcp_settings
                    .disabled_discovered
                    .retain(|id| id != server_id);
            } else if !mcp_settings.disabled_discovered.contains(&server_id.to_string()) {
                mcp_settings
                    .disabled_discovered
                    .push(server_id.to_string());
            }
        }

        self.save_mcp_settings(mcp_settings)
    }

    // ---- Query ----

    /// Get all servers (discovered + user-defined), with enable state and globally_available resolved.
    pub fn list_all_servers(&self) -> Vec<McpServerConfig> {
        let mcp_settings = self.get_mcp_settings();
        let discovered = self.discovered_servers.read().clone();

        let disabled_set: HashSet<&str> = mcp_settings
            .disabled_discovered
            .iter()
            .map(|s| s.as_str())
            .collect();

        let mut all: Vec<McpServerConfig> = discovered
            .into_iter()
            .map(|mut s| {
                s.enabled = !disabled_set.contains(s.id.as_str());
                // Apply globally_available override if present
                if let Some(&override_val) = mcp_settings.globally_available_overrides.get(&s.id) {
                    s.globally_available = override_val;
                }
                s
            })
            .collect();

        all.extend(mcp_settings.servers);
        all
    }

    /// Get only enabled servers, converted to the ACP SDK McpServer enum.
    pub fn get_enabled_acp_servers(&self) -> Vec<McpServer> {
        self.list_all_servers()
            .into_iter()
            .filter(|s| s.enabled)
            .filter_map(|s| Self::to_acp_mcp_server(&s))
            .collect()
    }

    /// Toggle the globally_available flag on a server.
    pub fn toggle_globally_available(&self, server_id: &str, globally_available: bool) -> AppResult<()> {
        let mut mcp_settings = self.get_mcp_settings();

        // Check if it's a user-defined server
        if let Some(server) = mcp_settings.servers.iter_mut().find(|s| s.id == server_id) {
            server.globally_available = globally_available;
        } else {
            // It's a discovered server - store override
            mcp_settings
                .globally_available_overrides
                .insert(server_id.to_string(), globally_available);
        }

        self.save_mcp_settings(mcp_settings)
    }

    /// Get enabled MCP servers applicable to a given project directory.
    /// Returns: globally_available servers + servers whose project_path matches the directory.
    pub fn get_servers_for_directory(&self, project_path: &str) -> Vec<McpServerConfig> {
        self.list_all_servers()
            .into_iter()
            .filter(|s| s.enabled)
            .filter(|s| {
                if s.globally_available {
                    return true;
                }
                // Check if this server's project_path matches the given directory
                match &s.source {
                    McpServerSource::ClaudeProject { project_path: pp }
                    | McpServerSource::KimiProject { project_path: pp }
                    | McpServerSource::CodexProject { project_path: pp }
                    | McpServerSource::GeminiProject { project_path: pp }
                    | McpServerSource::UserProject { project_path: pp } => {
                        Self::paths_match(pp, project_path)
                    }
                    _ => false,
                }
            })
            .collect()
    }

    /// Get enabled ACP servers for a specific directory, optionally excluding some by ID.
    pub fn get_enabled_acp_servers_for_directory(
        &self,
        project_path: &str,
        excluded_ids: &[String],
    ) -> Vec<McpServer> {
        let excluded_set: HashSet<&str> = excluded_ids.iter().map(|s| s.as_str()).collect();
        self.get_servers_for_directory(project_path)
            .into_iter()
            .filter(|s| !excluded_set.contains(s.id.as_str()))
            .filter_map(|s| Self::to_acp_mcp_server(&s))
            .collect()
    }

    /// Compare two paths for equivalence (normalize trailing slashes).
    fn paths_match(a: &str, b: &str) -> bool {
        let a = a.trim_end_matches('/');
        let b = b.trim_end_matches('/');
        a == b
    }

    /// Convert our internal McpServerConfig to the ACP SDK McpServer type.
    fn to_acp_mcp_server(config: &McpServerConfig) -> Option<McpServer> {
        match &config.transport {
            McpTransport::Stdio { command, args, env } => {
                let server = McpServerStdio::new(&config.name, command)
                    .args(args.clone())
                    .env(
                        env.iter()
                            .map(|(k, v)| EnvVariable::new(k, v))
                            .collect(),
                    );
                Some(McpServer::Stdio(server))
            }
            McpTransport::Http { url, headers } => {
                let server = McpServerHttp::new(&config.name, url).headers(
                    headers
                        .iter()
                        .map(|(k, v)| HttpHeader::new(k, v))
                        .collect(),
                );
                Some(McpServer::Http(server))
            }
            McpTransport::Sse { url, headers } => {
                let server = McpServerSse::new(&config.name, url).headers(
                    headers
                        .iter()
                        .map(|(k, v)| HttpHeader::new(k, v))
                        .collect(),
                );
                Some(McpServer::Sse(server))
            }
        }
    }

    // ---- Persistence helpers ----

    fn get_mcp_settings(&self) -> McpSettings {
        self.settings_manager
            .get_settings()
            .mcp
            .unwrap_or_default()
    }

    fn save_mcp_settings(&self, mcp: McpSettings) -> AppResult<()> {
        let mut settings = self.settings_manager.get_settings();
        settings.mcp = Some(mcp);
        self.settings_manager.update_settings(settings)
    }
}
