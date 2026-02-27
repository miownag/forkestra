// Provider types
export type ProviderType = "claude" | "kimi" | "codex" | "gemini";

export interface ProviderInfo {
  provider_type: ProviderType;
  name: string;
  cli_command: string;
  cli_path: string | null;
  installed: boolean;
  version: string | null;
}

export interface ProviderConfig {
  provider_type: ProviderType;
  custom_cli_path: string | null;
  api_key: string | null;
  enabled: boolean;
}

// Provider-specific settings
export interface ClaudeProviderSettings {
  provider_type: "claude";
  enabled: boolean;
  custom_cli_path: string | null;
  disable_login_prompt: boolean;
  env_vars?: Record<string, string>;
}

export interface KimiProviderSettings {
  provider_type: "kimi";
  enabled: boolean;
  custom_cli_path: string | null;
  env_vars?: Record<string, string>;
}

export interface CodexProviderSettings {
  provider_type: "codex";
  enabled: boolean;
  custom_cli_path: string | null;
  env_vars?: Record<string, string>;
}

export interface GeminiProviderSettings {
  provider_type: "gemini";
  enabled: boolean;
  custom_cli_path: string | null;
  env_vars?: Record<string, string>;
}

// Discriminated union for all provider settings
export type ProviderSettings = ClaudeProviderSettings | KimiProviderSettings | CodexProviderSettings | GeminiProviderSettings;

// Type guards
export function isClaudeSettings(
  settings: ProviderSettings
): settings is ClaudeProviderSettings {
  return settings.provider_type === "claude";
}

export function isKimiSettings(
  settings: ProviderSettings
): settings is KimiProviderSettings {
  return settings.provider_type === "kimi";
}

export function isCodexSettings(
  settings: ProviderSettings
): settings is CodexProviderSettings {
  return settings.provider_type === "codex";
}

export function isGeminiSettings(
  settings: ProviderSettings
): settings is GeminiProviderSettings {
  return settings.provider_type === "gemini";
}

// Default settings factory
export function createDefaultProviderSettings(
  providerType: ProviderType
): ProviderSettings {
  switch (providerType) {
    case "claude":
      return {
        provider_type: "claude",
        enabled: true,
        custom_cli_path: null,
        disable_login_prompt: false,
        env_vars: {},
      };
    case "kimi":
      return {
        provider_type: "kimi",
        enabled: true,
        custom_cli_path: null,
        env_vars: {},
      };
    case "codex":
      return {
        provider_type: "codex",
        enabled: true,
        custom_cli_path: null,
        env_vars: {},
      };
    case "gemini":
      return {
        provider_type: "gemini",
        enabled: true,
        custom_cli_path: null,
        env_vars: {},
      };
  }
}

// Session types
export type SessionStatus =
  | "creating"
  | "active"
  | "paused"
  | "terminated"
  | "error";

// Model types
export interface ModelInfo {
  model_id: string;
  display_name: string;
  description?: string;
}

// Mode types
export interface ModeInfo {
  mode_id: string;
  display_name: string;
  description?: string;
}

export interface Session {
  id: string;
  name: string;
  provider: ProviderType;
  status: SessionStatus;
  worktree_path: string;
  branch_name: string;
  created_at: string;
  updated_at?: string | null;
  project_path: string;
  is_local: boolean;
  acp_session_id?: string | null;
  model?: string | null;
  available_models: ModelInfo[];
  mode?: string | null;
  available_modes: ModeInfo[];
  available_commands: AvailableCommand[];
  config_options: ConfigOption[];
  error?: SessionError | null;
}

export interface CreateSessionRequest {
  name: string;
  provider: ProviderType;
  project_path: string;
  base_branch?: string;
  use_local?: boolean;
  fetch_first?: boolean;
  excluded_mcp_ids?: string[];
}

export interface SessionError {
  code: string;
  message: string;
}

export interface SessionStatusEvent {
  session_id: string;
  status: SessionStatus;
  session?: Session | null;
  error?: SessionError | null;
}

// Message types
export type MessageRole = "user" | "assistant" | "system";
export type MessageContentType = "text" | "tool_use" | "tool_result" | "error";

export interface ToolUseInfo {
  tool_name: string;
  tool_input: unknown;
  tool_result?: string;
  is_error: boolean;
}

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "image"; content: ImageContent }
  | { type: "resource_link"; content: ResourceLinkContent }
  | { type: "tool_call"; tool_call: ToolCallInfo };

export interface ImageContent {
  data: string; // Base64-encoded
  mimeType: string;
  uri?: string;
}

export interface ResourceLinkContent {
  uri: string;
  name: string;
  mimeType?: string;
}

export type PromptContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri?: string }
  | { type: "resource_link"; uri: string; name: string; mimeType?: string };

// File entry from list_directory command
export interface FileEntry {
  name: string;
  path: string; // relative path from project root
  is_dir: boolean;
  is_file: boolean;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  content_type: MessageContentType;
  tool_use?: ToolUseInfo;
  tool_calls?: ToolCallInfo[];
  parts?: MessagePart[];
  plan_entries?: PlanEntry[];
  timestamp: string;
  is_streaming: boolean;
}

// Stream chunk types (ACP structured data)
export type StreamChunkType = "text" | "thinking" | "tool_call" | "image";

export interface ToolCallInfo {
  tool_call_id: string;
  tool_name: string | null;
  status: string;
  title: string;
  content: ToolCallContentItem[] | null;
  kind?: ToolKind;
  locations?: ToolCallLocation[];
  raw_input?: Record<string, unknown>;
  raw_output?: Record<string, unknown>;
}

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "other";

export type ToolCallContentItem =
  | { type: "content"; content: ContentBlock }
  | { type: "diff"; path: string; oldText?: string; newText: string }
  | { type: "terminal"; terminalId: string };

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri?: string }
  | { type: "resource_link"; uri: string; name: string; mimeType?: string };

export interface StreamChunk {
  session_id: string;
  message_id: string;
  content: string;
  is_complete: boolean;
  chunk_type?: StreamChunkType;
  tool_call?: ToolCallInfo;
  image_content?: ImageContent;
}

export interface PermissionOptionInfo {
  kind: string;
  name: string;
  option_id: string;
}

export interface InteractionPrompt {
  session_id: string;
  prompt_type: string;
  message: string;
  request_id?: string;
  tool_name?: string;
  options?: PermissionOptionInfo[];
}

// Slash command types (from ACP available_commands_update)
export interface AvailableCommandInput {
  hint: string;
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: AvailableCommandInput | null;
}

export interface AvailableCommandsEvent {
  session_id: string;
  available_commands: AvailableCommand[];
}

// Agent Plan types (from ACP plan updates)
export type PlanEntryPriority = "high" | "medium" | "low";
export type PlanEntryStatus = "pending" | "in_progress" | "completed";

export interface PlanEntry {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
}

export interface PlanUpdateEvent {
  session_id: string;
  message_id: string;
  entries: PlanEntry[];
}

// MCP types
export type McpServerSource =
  | { type: "user" }
  | { type: "user_project"; project_path: string }
  | { type: "claude_global" }
  | { type: "claude_project"; project_path: string }
  | { type: "kimi_global" }
  | { type: "kimi_project"; project_path: string }
  | { type: "codex_global" }
  | { type: "codex_project"; project_path: string }
  | { type: "gemini_global" }
  | { type: "gemini_project"; project_path: string };

export type McpTransport =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { type: "http"; url: string; headers: Record<string, string> }
  | { type: "sse"; url: string; headers: Record<string, string> };

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  source: McpServerSource;
  globally_available: boolean;
}

// Skill types
export type SkillSource =
  | { type: "global"; agent: string }
  | { type: "project"; agent: string; project_path: string }
  | { type: "user_installed" };

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
  enabled: boolean;
  source: SkillSource;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface SkillInstallOptions {
  source: string;
  global: boolean;
  agent?: string[];
  skill?: string[];
  yes: boolean;
  all: boolean;
  full_depth: boolean;
  copy: boolean;
  project_path?: string;
}

// Settings types
export type Theme = "light" | "dark" | "system";
export type FontSize = "small" | "base" | "large";
export type AccentColor =
  | "default"
  | "zinc"
  | "slate"
  | "stone"
  | "gray"
  | "neutral"
  | "red"
  | "rose"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink";

export type DefaultWorkMode = "worktree" | "local";
export type PostMergeAction = "ask" | "keep" | "cleanup";

// App settings from backend
export interface AppSettings {
  provider_settings: Record<ProviderType, ProviderSettings>;
}

// ========== Git SCM Types ==========

export type GitFileStatusKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export interface GitFileStatus {
  path: string;
  status: GitFileStatusKind;
  old_path?: string;
}

export interface GitScmStatus {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  conflicts: GitFileStatus[];
  merge_in_progress: boolean;
  rebase_in_progress: boolean;
  branch_name: string;
}

export type MergeRebaseResult =
  | "success"
  | { conflicts: string[] }
  | "up_to_date";

export interface ConflictContent {
  path: string;
  ours: string | null;
  theirs: string | null;
  base: string | null;
  working: string;
}

// ========== Session Config Options ==========

export interface ConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: ConfigOptionCategory;
  type: "select"; // ACP 目前只支持 select 类型
  currentValue: string;
  options: ConfigOptionValue[];
}

export type ConfigOptionCategory = "mode" | "model" | "thought_level" | string; // 支持自定义 category（以 _ 开头）

export interface ConfigOptionValue {
  value: string;
  name: string;
  description?: string;
}
