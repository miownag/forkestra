// Provider types
export type ProviderType = "claude" | "kimi";

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

// Discriminated union for all provider settings
export type ProviderSettings = ClaudeProviderSettings | KimiProviderSettings;

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
  project_path: string;
  is_local: boolean;
  acp_session_id?: string | null;
  model?: string | null;
  available_models: ModelInfo[];
  mode?: string | null;
  available_modes: ModeInfo[];
  available_commands: AvailableCommand[];
  config_options: ConfigOption[];
}

export interface CreateSessionRequest {
  name: string;
  provider: ProviderType;
  project_path: string;
  base_branch?: string;
  use_local?: boolean;
}

export interface SessionStatusEvent {
  session_id: string;
  status: SessionStatus;
  session?: Session | null;
  error?: string | null;
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
  content: string | null;
  raw_input?: Record<string, unknown>;
}

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

// App settings from backend
export interface AppSettings {
  provider_settings: Record<ProviderType, ProviderSettings>;
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
