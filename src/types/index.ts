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
}

export interface KimiProviderSettings {
  provider_type: "kimi";
  enabled: boolean;
  custom_cli_path: string | null;
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
      };
    case "kimi":
      return {
        provider_type: "kimi",
        enabled: true,
        custom_cli_path: null,
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
  | { type: "tool_call"; tool_call: ToolCallInfo };

export interface ChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  content_type: MessageContentType;
  tool_use?: ToolUseInfo;
  tool_calls?: ToolCallInfo[];
  parts?: MessagePart[];
  timestamp: string;
  is_streaming: boolean;
}

// Stream chunk types (ACP structured data)
export type StreamChunkType = "text" | "thinking" | "tool_call";

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
}

export interface InteractionPrompt {
  session_id: string;
  prompt_type: string;
  message: string;
  request_id?: string;
  tool_name?: string;
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
