# Forkestra SQLite 持久化方案

## 目标

实现会话历史持久化，应用重启后能恢复会话列表和消息记录。

## 技术选型

- **rusqlite** - Rust SQLite 库，使用 `bundled` 特性避免系统依赖
- **WAL 模式** - 提升并发性能
- **复用现有类型** - Session/ChatMessage 直接序列化存储

## 数据库表结构

```sql
-- 会话表
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    project_path TEXT NOT NULL,
    is_local INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 消息表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    timestamp TEXT NOT NULL,
    is_streaming INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

## 实现步骤

### 1. 添加依赖

```toml
# src-tauri/Cargo.toml
[dependencies]
rusqlite = { version = "0.38", features = ["bundled", "chrono"] }
```

### 2. 创建数据库模块

```rust
// src-tauri/src/db/mod.rs
use rusqlite::{Connection, Result};
use tauri::AppHandle;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_dir = app_handle.path().app_data_dir()?;
        std::fs::create_dir_all(&app_dir)?;

        let db_path = app_dir.join("forkestra.db");
        let conn = Connection::open(db_path)?;

        // WAL 模式 + 外键约束
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
        ")?;

        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        self.conn.execute_batch(include_str!("schema.sql"))?;
        Ok(())
    }
}
```

### 3. 会话 CRUD

```rust
impl Database {
    pub fn save_session(&self, session: &Session) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO sessions
             (id, name, provider, status, worktree_path, branch_name, project_path, is_local, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &session.id, &session.name,
                serde_json::to_string(&session.provider)?,
                serde_json::to_string(&session.status)?,
                &session.worktree_path, &session.branch_name,
                &session.project_path, session.is_local as i32,
                session.created_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn load_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM sessions ORDER BY created_at DESC"
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get("id")?,
                name: row.get("name")?,
                provider: serde_json::from_str(&row.get::<_, String>("provider")?)?,
                status: serde_json::from_str(&row.get::<_, String>("status")?)?,
                worktree_path: row.get("worktree_path")?,
                branch_name: row.get("branch_name")?,
                project_path: row.get("project_path")?,
                is_local: row.get::<_, i32>("is_local")? != 0,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>("created_at")?)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
            })
        })?;

        sessions.collect::<Result<Vec<_>>>()
    }

    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            [session_id],
        )?;
        Ok(())
    }
}
```

### 4. 消息 CRUD

```rust
impl Database {
    pub fn save_message(&self, message: &ChatMessage) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO messages
             (id, session_id, role, content, content_type, timestamp, is_streaming)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &message.id, &message.session_id, &message.role,
                &message.content, &message.content_type,
                &message.timestamp, message.is_streaming as i32
            ],
        )?;
        Ok(())
    }

    pub fn get_messages(&self, session_id: &str) -> Result<Vec<ChatMessage>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC"
        )?;

        let messages = stmt.query_map([session_id], |row| {
            Ok(ChatMessage {
                id: row.get("id")?,
                session_id: row.get("session_id")?,
                role: row.get("role")?,
                content: row.get("content")?,
                content_type: row.get("content_type")?,
                timestamp: row.get("timestamp")?,
                is_streaming: row.get::<_, i32>("is_streaming")? != 0,
            })
        })?;

        messages.collect::<Result<Vec<_>>>()
    }
}
```

### 5. 集成到 SessionManager

```rust
// src-tauri/src/managers/session_manager.rs
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
    db: Arc<Database>,  // 新增
    app_handle: AppHandle,
    settings_manager: Arc<SettingsManager>,
}

impl SessionManager {
    pub fn new(app_handle: AppHandle, settings_manager: Arc<SettingsManager>) -> Result<Self> {
        let db = Arc::new(Database::new(&app_handle)?);

        // 启动时从数据库加载会话
        let sessions = Arc::new(RwLock::new(Self::load_sessions_from_db(&db)?));

        Ok(Self {
            sessions,
            db,
            app_handle,
            settings_manager,
        })
    }

    fn load_sessions_from_db(db: &Database) -> Result<HashMap<String, SessionEntry>> {
        let sessions = db.load_sessions()?;
        let mut map = HashMap::new();

        for session in sessions {
            // 只加载非活跃会话（活跃会话需要重新初始化 adapter）
            if session.status == SessionStatus::Active {
                // 标记为需要恢复或关闭
            }
            // ...
        }

        Ok(map)
    }

    pub async fn create_session(&self, request: CreateSessionRequest) -> AppResult<Session> {
        // ... 原有逻辑 ...

        // 保存到数据库
        self.db.save_session(&session)?;

        Ok(session)
    }

    pub async fn save_message(&self, session_id: &str, message: ChatMessage) -> AppResult<()> {
        self.db.save_message(&message)?;

        // 同时更新内存状态
        let mut sessions = self.sessions.write().await;
        if let Some(entry) = sessions.get_mut(session_id) {
            // ...
        }

        Ok(())
    }
}
```

### 6. Tauri 命令

```rust
// src-tauri/src/commands/session.rs
#[tauri::command]
pub async fn get_session_messages(
    session_id: String,
    session_manager: State<'_, Arc<SessionManager>>,
) -> Result<Vec<ChatMessage>, String> {
    session_manager
        .db
        .get_messages(&session_id)
        .map_err(|e| e.to_string())
}
```

## 前端适配

```typescript
// src/stores/session-storage.ts
// 移除 persist 中的 messages，改为从数据库加载

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set, get) => ({
        // ...
        loadSessionMessages: async (sessionId: string) => {
          const messages = await invoke<ChatMessage[]>("get_session_messages", {
            sessionId,
          });
          set((state) => ({
            messages: { ...state.messages, [sessionId]: messages },
          }));
        },
      }),
      {
        name: "forkestra-sessions",
        partialize: (state) => ({
          activeSessionId: state.activeSessionId,
          // 不再持久化 sessions 和 messages
        }),
      },
    ),
  ),
);
```

## 文件变更清单

| 文件                                        | 操作 | 说明                 |
| ------------------------------------------- | ---- | -------------------- |
| `src-tauri/Cargo.toml`                      | 修改 | 添加 rusqlite 依赖   |
| `src-tauri/src/db/mod.rs`                   | 新增 | 数据库连接和初始化   |
| `src-tauri/src/db/schema.sql`               | 新增 | 表结构定义           |
| `src-tauri/src/managers/session_manager.rs` | 修改 | 集成数据库操作       |
| `src-tauri/src/commands/session.rs`         | 修改 | 添加消息查询命令     |
| `src/stores/session-storage.ts`             | 修改 | 移除 messages 持久化 |

## 存储位置

- macOS: `~/Library/Application Support/forkestra/forkestra.db`
- Windows: `%APPDATA%/forkestra/forkestra.db`
- Linux: `~/.config/forkestra/forkestra.db`

## 后续优化

1. **分页加载** - 消息量大时使用 LIMIT/OFFSET
2. **搜索功能** - 利用 SQLite FTS 全文搜索
3. **数据迁移** - 版本升级时自动迁移表结构
4. **备份导出** - 支持导出为 JSON/CSV
