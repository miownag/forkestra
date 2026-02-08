use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{
    ChatMessage, MessageContentType, MessageRole, ProviderType, Session, SessionStatus,
    ToolUseInfo,
};

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

// Safety: Connection is only accessed while the Mutex is held
unsafe impl Send for Database {}
unsafe impl Sync for Database {}

impl Database {
    pub fn new(app_handle: &AppHandle) -> AppResult<Self> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data dir: {}", e)))?;

        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("forkestra.db");

        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Database(format!("Failed to open database: {}", e)))?;

        // WAL mode + foreign keys
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| AppError::Database(format!("Failed to set pragmas: {}", e)))?;

        // Initialize schema
        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| AppError::Database(format!("Failed to initialize schema: {}", e)))?;

        // Run migrations for existing databases
        Self::migrate(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Run database migrations for schema changes on existing databases
    fn migrate(conn: &Connection) -> AppResult<()> {
        let has_acp_col: bool = conn
            .prepare("PRAGMA table_info(sessions)")
            .and_then(|mut stmt| {
                let cols: Vec<String> = stmt
                    .query_map([], |row| row.get::<_, String>(1))
                    .unwrap()
                    .filter_map(|r| r.ok())
                    .collect();
                Ok(cols.contains(&"acp_session_id".to_string()))
            })
            .unwrap_or(false);

        if !has_acp_col {
            conn.execute_batch("ALTER TABLE sessions ADD COLUMN acp_session_id TEXT")
                .map_err(|e| {
                    AppError::Database(format!("Failed to add acp_session_id column: {}", e))
                })?;
            println!("[Database] Migrated: added acp_session_id column to sessions");
        }

        // Migration for model column
        let has_model_col: bool = conn
            .prepare("PRAGMA table_info(sessions)")
            .and_then(|mut stmt| {
                let cols: Vec<String> = stmt
                    .query_map([], |row| row.get::<_, String>(1))
                    .unwrap()
                    .filter_map(|r| r.ok())
                    .collect();
                Ok(cols.contains(&"model".to_string()))
            })
            .unwrap_or(false);

        if !has_model_col {
            conn.execute_batch("ALTER TABLE sessions ADD COLUMN model TEXT")
                .map_err(|e| {
                    AppError::Database(format!("Failed to add model column: {}", e))
                })?;
            println!("[Database] Migrated: added model column to sessions");
        }

        // Migrate old enum-style model values to model_id strings
        let old_to_new: &[(&str, &str)] = &[
            ("claude_haiku", "claude-haiku-4-20250514"),
            ("claude_sonnet", "claude-sonnet-4-20250514"),
            ("claude_opus", "claude-opus-4-20250514"),
            ("kimi_moonshot", "moonshot-v1-128k"),
        ];
        for (old_val, new_val) in old_to_new {
            conn.execute(
                "UPDATE sessions SET model = ?1 WHERE model = ?2",
                params![new_val, old_val],
            )
            .map_err(|e| {
                AppError::Database(format!("Failed to migrate model values: {}", e))
            })?;
        }

        Ok(())
    }

    // ── Session operations ──

    pub fn save_session(&self, session: &Session) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute(
            "INSERT OR REPLACE INTO sessions
             (id, name, provider, status, worktree_path, branch_name,
              project_path, is_local, created_at, acp_session_id, model)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                session.name,
                provider_type_to_str(&session.provider),
                session_status_to_str(&session.status),
                session.worktree_path,
                session.branch_name,
                session.project_path,
                session.is_local as i32,
                session.created_at.to_rfc3339(),
                session.acp_session_id,
                session.model.as_deref(),
            ],
        )
        .map_err(|e| AppError::Database(format!("Failed to save session: {}", e)))?;
        Ok(())
    }

    pub fn update_session_status(
        &self,
        session_id: &str,
        status: &SessionStatus,
    ) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![session_status_to_str(status), session_id],
        )
        .map_err(|e| AppError::Database(format!("Failed to update session status: {}", e)))?;
        Ok(())
    }

    pub fn update_session_name(&self, session_id: &str, name: &str) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute(
            "UPDATE sessions SET name = ?1 WHERE id = ?2",
            params![name, session_id],
        )
        .map_err(|e| AppError::Database(format!("Failed to update session name: {}", e)))?;
        Ok(())
    }

    pub fn update_session_acp_id(
        &self,
        session_id: &str,
        acp_session_id: &str,
    ) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute(
            "UPDATE sessions SET acp_session_id = ?1 WHERE id = ?2",
            params![acp_session_id, session_id],
        )
        .map_err(|e| {
            AppError::Database(format!("Failed to update session acp_session_id: {}", e))
        })?;
        Ok(())
    }

    pub fn update_session_model(
        &self,
        session_id: &str,
        model_id: &str,
    ) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute(
            "UPDATE sessions SET model = ?1 WHERE id = ?2",
            params![model_id, session_id],
        )
        .map_err(|e| {
            AppError::Database(format!("Failed to update session model: {}", e))
        })?;
        Ok(())
    }

    pub fn load_sessions(&self) -> AppResult<Vec<Session>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, provider, status, worktree_path,
                        branch_name, project_path, is_local, created_at,
                        acp_session_id, model
                 FROM sessions ORDER BY created_at DESC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {}", e)))?;

        let sessions = stmt
            .query_map([], |row| {
                let provider_str: String = row.get(2)?;
                let status_str: String = row.get(3)?;
                let created_at_str: String = row.get(8)?;
                let model_str: Option<String> = row.get(10)?;

                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    provider: str_to_provider_type(&provider_str),
                    status: str_to_session_status(&status_str),
                    worktree_path: row.get(4)?,
                    branch_name: row.get(5)?,
                    project_path: row.get(6)?,
                    is_local: row.get::<_, i32>(7)? != 0,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                    acp_session_id: row.get(9)?,
                    model: model_str,
                    available_models: vec![],
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query sessions: {}", e)))?;

        let mut result = Vec::new();
        for session in sessions {
            result.push(
                session
                    .map_err(|e| AppError::Database(format!("Failed to read session row: {}", e)))?,
            );
        }
        Ok(result)
    }

    pub fn delete_session(&self, session_id: &str) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
            .map_err(|e| AppError::Database(format!("Failed to delete session: {}", e)))?;
        Ok(())
    }

    // ── Message operations ──

    pub fn save_message(&self, message: &ChatMessage) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;

        let tool_use_json = message
            .tool_use
            .as_ref()
            .map(|tu| serde_json::to_string(tu).unwrap_or_default());

        conn.execute(
            "INSERT OR REPLACE INTO messages
             (id, session_id, role, content, content_type, tool_use,
              timestamp, is_streaming)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message.id,
                message.session_id,
                message_role_to_str(&message.role),
                message.content,
                content_type_to_str(&message.content_type),
                tool_use_json,
                message.timestamp.to_rfc3339(),
                message.is_streaming as i32,
            ],
        )
        .map_err(|e| AppError::Database(format!("Failed to save message: {}", e)))?;
        Ok(())
    }

    pub fn get_messages(&self, session_id: &str) -> AppResult<Vec<ChatMessage>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("Database lock poisoned: {}", e)))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, role, content, content_type,
                        tool_use, timestamp, is_streaming
                 FROM messages
                 WHERE session_id = ?1
                 ORDER BY timestamp ASC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {}", e)))?;

        let messages = stmt
            .query_map(params![session_id], |row| {
                let role_str: String = row.get(2)?;
                let content_type_str: String = row.get(4)?;
                let tool_use_str: Option<String> = row.get(5)?;
                let timestamp_str: String = row.get(6)?;

                let tool_use: Option<ToolUseInfo> =
                    tool_use_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(ChatMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: str_to_message_role(&role_str),
                    content: row.get(3)?,
                    content_type: str_to_content_type(&content_type_str),
                    tool_use,
                    timestamp: chrono::DateTime::parse_from_rfc3339(&timestamp_str)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                    is_streaming: row.get::<_, i32>(7)? != 0,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query messages: {}", e)))?;

        let mut result = Vec::new();
        for msg in messages {
            result.push(
                msg.map_err(|e| AppError::Database(format!("Failed to read message row: {}", e)))?,
            );
        }
        Ok(result)
    }
}

// ── Enum conversion helpers ──

fn provider_type_to_str(p: &ProviderType) -> &'static str {
    match p {
        ProviderType::Claude => "claude",
        ProviderType::Kimi => "kimi",
    }
}

fn str_to_provider_type(s: &str) -> ProviderType {
    match s {
        "kimi" => ProviderType::Kimi,
        _ => ProviderType::Claude,
    }
}

fn session_status_to_str(s: &SessionStatus) -> &'static str {
    match s {
        SessionStatus::Creating => "creating",
        SessionStatus::Active => "active",
        SessionStatus::Paused => "paused",
        SessionStatus::Terminated => "terminated",
        SessionStatus::Error => "error",
    }
}

fn str_to_session_status(s: &str) -> SessionStatus {
    match s {
        "creating" => SessionStatus::Creating,
        "active" => SessionStatus::Active,
        "paused" => SessionStatus::Paused,
        "error" => SessionStatus::Error,
        _ => SessionStatus::Terminated,
    }
}

fn message_role_to_str(r: &MessageRole) -> &'static str {
    match r {
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::System => "system",
    }
}

fn str_to_message_role(s: &str) -> MessageRole {
    match s {
        "assistant" => MessageRole::Assistant,
        "system" => MessageRole::System,
        _ => MessageRole::User,
    }
}

fn content_type_to_str(ct: &MessageContentType) -> &'static str {
    match ct {
        MessageContentType::Text => "text",
        MessageContentType::ToolUse => "tool_use",
        MessageContentType::ToolResult => "tool_result",
        MessageContentType::Error => "error",
    }
}

fn str_to_content_type(s: &str) -> MessageContentType {
    match s {
        "tool_use" => MessageContentType::ToolUse,
        "tool_result" => MessageContentType::ToolResult,
        "error" => MessageContentType::Error,
        _ => MessageContentType::Text,
    }
}
