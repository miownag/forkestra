# ACP Rust SDK 迁移计划

## 背景

当前项目使用手写的 ACP client 实现（约 1500 行代码），包括：

- `src-tauri/src/models/acp.rs`：手写的协议数据结构（378 行）
- `src-tauri/src/providers/acp_helper.rs`：手写的 JSON-RPC 通信层（1080 行）

目标是迁移到官方 Rust SDK (`sacp` + `sacp-tokio`)，以减少代码量、提高类型安全性和长期维护性。

## 当前架构分析

### 数据流

```
Frontend (React/TS)
    ↓ Tauri IPC (stream-chunk, interaction-prompt)
SessionManager
    ↓ mpsc::Sender<StreamChunk>
Provider Adapter (ClaudeAdapter/KimiAdapter)
    ↓ spawn child process + stdio
ACP Helper (spawn_stdout_reader, spawn_stdin_writer, send_and_await)
    ↓ JSON-RPC 2.0 over stdin/stdout
Agent Process (npx @zed-industries/claude-code-acp / kimi acp)
```

### 关键组件

1. **Provider Adapter** (claude.rs / kimi.rs)
   - 管理子进程生命周期
   - 调用 acp_helper 函数
   - 处理权限请求（pending_permission）
   - 生成 message_id

2. **ACP Helper** (acp_helper.rs)
   - `spawn_stdin_writer`: 异步写 JSON-RPC 到 stdin
   - `spawn_stdout_reader`: 解析 stdout 的 JSON-RPC，路由到 pending_requests 或发送 StreamChunk
   - `spawn_stderr_reader`: 日志 + 检测进程崩溃
   - `send_and_await`: 发送请求并等待响应（超时处理）
   - `acp_handshake`: initialize + session/new
   - `acp_resume_handshake`: initialize + session/load/resume

3. **数据转换**
   - SessionUpdate → StreamChunk
   - ToolCall → ToolCallInfo
   - ContentBlock (Image) → ImageContent
   - Permission → InteractionPrompt

## 迁移策略

### 方案选择：手动管理子进程（推荐）

**不使用** `sacp_tokio::AcpAgent` 的原因：

- 需要自定义环境变量（`build_clean_env_with_custom`）
- 需要捕获 stderr 进行日志处理和错误检测
- 需要灵活控制进程启动参数（npx、kimi 等不同命令）

**使用手动方式**：

```rust
// 1. 启动子进程
let mut child = Command::new(command)
    .args(&args)
    .envs(&env)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

// 2. 提取 stdio
let stdin = child.stdin.take().unwrap();
let stdout = child.stdout.take().unwrap();
let stderr = child.stderr.take().unwrap();

// 3. 继续使用现有 stderr 处理
spawn_stderr_reader(stderr, stream_tx.clone());

// 4. 使用 SDK 创建传输层
let transport = ByteStreams::new(
    stdin.compat_write(),
    stdout.compat(),
);

// 5. 创建 Builder 并连接
Client.builder()
    .on_receive_notification(|notif: SessionNotification, cx| {
        // 处理 session/update
    })
    .on_receive_request(|req: RequestPermissionRequest, responder, cx| {
        // 处理 session/request_permission
    })
    .connect_with(transport, async |cx| {
        // 初始化
        let init_resp = cx.send_request(InitializeRequest { ... }).await?;

        // 创建会话
        let session_resp = cx.send_request(NewSessionRequest { ... }).await?;

        // 保持连接，监听命令
        while let Some(cmd) = cmd_rx.recv().await {
            match cmd {
                Command::Prompt(msg) => cx.send_request(PromptRequest { ... }).await?,
                Command::Cancel => cx.send_notification(CancelNotification { ... }).await?,
                Command::Shutdown => break,
            }
        }
        Ok(())
    })
    .await?;
```

### 未解决的关键问题

#### ❓ 问题1：如何保持长连接？

`connect_with` 的闭包执行完就会关闭连接，但我们需要：

- Session 创建后持续运行（可能运行数小时）
- 随时能发送新的 prompt
- 接收持续的 session/update 通知

**可能的解决方案**：

- A. 使用 `mpsc::channel` 在闭包中循环接收命令？
- B. 使用 `ActiveSession` + `on_session_start` 的非阻塞模式？
- C. 其他 SDK 推荐的模式？

#### ❓ 问题2：session/cancel 和 session/set_model 如何实现？

`ActiveSession` 文档中只显示了 `send_prompt` 方法，没有看到：

- `cancel()` 方法
- `set_model()` 方法

是通过底层的 `connection()` 直接发送 JSON-RPC 请求吗？

#### ❓ 问题3：sacp::schema 类型字段缺失

需要知道这些类型的完整字段定义才能转换：

- `ToolCall` → `ToolCallInfo`
- `ToolCallUpdate` → `ToolCallInfo`
- `Plan` → `Vec<PlanEntry>`
- `AvailableCommandsUpdate` → `Vec<AvailableCommand>`

文档中只显示了类型名称，没有字段定义。

#### ❓ 问题4：session/load 和 session/resume 如何调用？

`SessionBuilder` 文档中只看到 `start_session()` (对应 session/new)，没有看到：

- `load_session()` 方法
- `resume_session()` 方法

是通过直接发送 JSON-RPC 请求实现吗？

## 迁移步骤

### 阶段 1：准备工作

- [ ] 更新 Cargo.toml 依赖
  ```toml
  sacp = "11.0.0-alpha.1"
  sacp-tokio = "11.0.0-alpha.1"
  tokio-util = { version = "0.7", features = ["compat"] }
  ```
- [ ] 移除 `agent-client-protocol = "0.9.4"`（未使用）

### 阶段 2：创建新的通信层 (acp_client_sdk.rs)

- [ ] 创建 `src-tauri/src/providers/acp_client_sdk.rs`
- [ ] 实现 `AcpSession` 结构体（封装 SDK 连接）
- [ ] 实现 handshake 逻辑（initialize + session/new）
- [ ] 实现 resume handshake（initialize + session/load/resume）
- [ ] 实现通知处理（SessionUpdate → StreamChunk）
- [ ] 实现权限请求处理（RequestPermissionRequest → InteractionPrompt）
- [ ] 保留 stderr 处理逻辑（检测崩溃、本地命令输出）

### 阶段 3：适配 Provider Adapters

- [ ] 修改 `ClaudeAdapter::spawn_acp_process` 使用新的 SDK 层
- [ ] 修改 `KimiAdapter::spawn_acp_process` 使用新的 SDK 层
- [ ] 保持现有接口不变（ProviderAdapter trait）

### 阶段 4：类型映射

- [ ] 创建转换函数：`sacp::schema::SessionUpdate` → `StreamChunk`
- [ ] 创建转换函数：`sacp::schema::ToolCall` → `ToolCallInfo`
- [ ] 创建转换函数：`sacp::schema::RequestPermissionRequest` → `InteractionPrompt`
- [ ] 保留前端需要的类型（StreamChunk, ToolCallInfo 等）在 models/message.rs

### 阶段 5：清理

- [ ] 删除 `src-tauri/src/models/acp.rs`（约 378 行）
- [ ] 删除 `src-tauri/src/providers/acp_helper.rs`（约 1080 行）
- [ ] 更新 `src-tauri/src/models/mod.rs` 的 re-exports
- [ ] 更新所有引用旧类型的代码

### 阶段 6：测试

- [ ] 测试 Claude Code provider（新建会话）
- [ ] 测试 Kimi provider（新建会话）
- [ ] 测试会话恢复（session/load 或 session/resume）
- [ ] 测试权限请求处理
- [ ] 测试取消操作
- [ ] 测试模型切换
- [ ] 测试进程崩溃恢复

## 关键文件清单

**需要创建**：

- `src-tauri/src/providers/acp_client_sdk.rs` - 新的 SDK 封装层

**需要修改**：

- `src-tauri/Cargo.toml` - 依赖更新
- `src-tauri/src/providers/claude.rs` - 使用新 SDK
- `src-tauri/src/providers/kimi.rs` - 使用新 SDK
- `src-tauri/src/models/mod.rs` - re-exports 更新
- `src-tauri/src/models/message.rs` - 保留前端类型，可能需要添加转换函数

**需要删除**：

- `src-tauri/src/models/acp.rs`
- `src-tauri/src/providers/acp_helper.rs`

**不需修改**（接口保持兼容）：

- `src-tauri/src/providers/adapter.rs` - ProviderAdapter trait
- `src-tauri/src/managers/session_manager.rs` - SessionManager
- `src-tauri/src/commands/session.rs` - Tauri commands
- Frontend 代码 - 事件格式不变

## 风险评估

### 高风险

- ⚠️ **长连接管理**：SDK 的连接生命周期管理与当前架构的差异较大
- ⚠️ **API 不完整**：文档中未找到 cancel、set_model、load_session、resume_session 的明确 API

### 中风险

- ⚠️ **类型字段缺失**：部分 schema 类型的字段定义不明确，可能需要查看源码
- ⚠️ **错误处理**：SDK 的错误处理模式可能与现有代码不同

### 低风险

- ✅ 子进程管理：保持现有逻辑
- ✅ stderr 处理：保持现有逻辑
- ✅ 前端接口：完全兼容

## 待确认问题

在开始实现前，需要解答上述 4 个关键问题（问题1-4），建议通过以下方式获取答案：

1. 查看 sacp GitHub 仓库的示例代码
2. 阅读 sacp 的集成测试代码
3. 查看 Agent Client Protocol 规范文档
4. 直接查看 sacp 源码（如果文档不够详细）

## 预期成果

- ✅ 代码量减少 70-80%（删除约 1450 行手写代码）
- ✅ 类型安全：使用官方协议类型定义
- ✅ 维护性提升：协议更新只需升级依赖
- ✅ 功能完整：所有现有功能保持不变
- ✅ 向后兼容：前端无需修改
