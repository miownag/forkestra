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

// Session types
export type SessionStatus =
  | "creating"
  | "active"
  | "paused"
  | "terminated"
  | "error";

export interface Session {
  id: string;
  name: string;
  provider: ProviderType;
  status: SessionStatus;
  worktree_path: string;
  branch_name: string;
  created_at: string;
  project_path: string;
}

export interface CreateSessionRequest {
  name: string;
  provider: ProviderType;
  project_path: string;
  base_branch?: string;
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

export interface ChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  content_type: MessageContentType;
  tool_use?: ToolUseInfo;
  timestamp: string;
  is_streaming: boolean;
}

export interface StreamChunk {
  session_id: string;
  message_id: string;
  content: string;
  is_complete: boolean;
}

// Settings types
export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  providers: ProviderConfig[];
  default_provider: string | null;
  worktree_base_path: string | null;
  theme: Theme;
}
