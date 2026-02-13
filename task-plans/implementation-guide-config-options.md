# Session Config Options - 完整实现指南

> 本指南用于完成 Session Config Options 的剩余实现工作
>
> **已完成**: 后端基础架构（数据库、Session 模型、Adapter 接口、config_options 提取）
> **待完成**: 前端类型、状态管理、UI 组件、config_options 更新处理

---

## 目录

1. [已完成工作总结](#已完成工作总结)
2. [前端实现步骤](#前端实现步骤)
3. [后端补充工作](#后端补充工作)
4. [测试验证](#测试验证)
5. [CustomConfigPopover 实现指南](#customconfigpopover-实现指南可选后续)

---

## 已完成工作总结

### 后端 ✅

#### 1. 数据库层

- **文件**: `src-tauri/src/db/schema.sql`
  - 添加 `config_options TEXT DEFAULT '[]'` 列到 sessions 表

- **文件**: `src-tauri/src/db/mod.rs`
  - 添加数据库迁移 (lines 112-131)
  - 更新 `save_session()` 序列化 config_options (lines 144-145)
  - 更新 `load_sessions()` 反序列化 config_options (lines 254-258, 272)

#### 2. Session 模型

- **文件**: `src-tauri/src/models/session.rs`
  - 导入 `SessionConfigOption` 类型 (line 6)
  - 添加 `config_options: Vec<SessionConfigOption>` 字段 (line 49)

#### 3. Provider Adapter 接口

- **文件**: `src-tauri/src/providers/adapter.rs`
  - 导入 `SessionConfigOption` (line 3)
  - 添加 `config_options()` 方法 (lines 62-64)

#### 4. ACP 客户端 SDK

- **文件**: `src-tauri/src/providers/acp_client_sdk.rs`
  - 更新 `AcpHandshakeResult` 结构体，添加 `config_options` 字段 (line 52)
  - 在 session/new 时提取 config_options (lines 709-712)
  - 在 session/resume 时提取 config_options (lines 838-846)

#### 5. Provider 实现

- **Claude Adapter** (`src-tauri/src/providers/claude.rs`):
  - 添加 `config_options` 字段到结构体 (line 32)
  - 构造函数初始化为空 vec (lines 48, 67)
  - start_session 存储 config_options (line 220)
  - resume_session 存储 config_options (line 286)
  - 实现 `config_options()` 方法 (lines 301-303)

- **Kimi Adapter** (`src-tauri/src/providers/kimi.rs`):
  - 与 Claude Adapter 相同的更新

#### 6. Session Manager

- **文件**: `src-tauri/src/managers/session_manager.rs`
  - `create_session()`: 初始化空 config_options (line 129)
  - `spawn_acp_connection()`: 从 adapter 同步 config_options (line 237)
  - `resume_session()`: 从 adapter 同步 config_options (lines 513, 530)

---

## 前端实现步骤

### Step 1: 添加 TypeScript 类型定义

**文件**: `src/types/index.ts`

在文件末尾添加以下类型定义：

```typescript
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
```

同时更新 `Session` 接口，添加 `config_options` 字段：

```typescript
export interface Session {
  id: string;
  name: string;
  provider: ProviderType;
  status: SessionStatus;
  // ... 其他字段
  config_options: ConfigOption[]; // 添加这一行
}
```

---

### Step 2: 更新 Zustand Store

**文件**: `src/stores/session-storage.ts`

#### 2.1 添加状态更新方法

在 store 中添加以下方法（找到 `setSessionModel` 附近）：

```typescript
// 设置单个 config option
setSessionConfigOption: async (sessionId: string, configId: string, value: string) => {
  try {
    // 调用 Tauri 命令（注意：这个命令需要在 Step 3 后端补充中实现）
    await invoke('set_session_config_option', {
      sessionId,
      configId,
      value,
    });

    // 成功后会通过 config-options-update 事件自动更新
    console.log(`[Store] Config option ${configId} updated to ${value} for session ${sessionId}`);
  } catch (error) {
    console.error(`[Store] Failed to set config option:`, error);
    throw error;
  }
},

// 批量更新 session 的 config_options（用于事件监听）
updateSessionConfigOptions: (sessionId: string, configOptions: ConfigOption[]) => {
  set((state) => {
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return state;

    return {
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, config_options: configOptions }
          : s
      ),
    };
  });
},
```

#### 2.2 添加事件监听

在 store 初始化部分（`useEffect` 或类似位置），添加以下事件监听：

```typescript
// 监听 config-options-update 事件
const unlisten = await listen<{
  sessionId: string;
  configOptions: ConfigOption[];
}>("config-options-update", (event) => {
  const { sessionId, configOptions } = event.payload;
  console.log(
    "[Store] Received config-options-update event:",
    sessionId,
    configOptions
  );

  // 更新 store
  useSessionStore
    .getState()
    .updateSessionConfigOptions(sessionId, configOptions);
});

// 清理函数中添加 unlisten()
```

**提示**: 如果没有统一的事件监听初始化位置，可以在 `ChatWindow` 组件的 `useEffect` 中添加。

---

### Step 3: 重构 ModelSelector 组件

**文件**: `src/components/chat/chat-input/model-selector.tsx`

#### 目标

从直接使用 `session.model` 和 `availableModels` 改为从 `session.config_options` 中提取。

#### 实现步骤

1. **添加辅助函数** (在组件外部)：

```typescript
import { ConfigOption } from "@/types";

// 从 config_options 中查找 model 配置
function getModelConfigOption(
  configOptions: ConfigOption[]
): ConfigOption | null {
  return configOptions.find((opt) => opt.category === "model") || null;
}
```

2. **修改组件 props**：

```typescript
interface ModelSelectorProps {
  session: Session | null;
}

export function ModelSelector({ session }: ModelSelectorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { setSessionConfigOption } = useSessionStore();

  // 从 config_options 提取 model 配置
  const modelConfig = session?.config_options
    ? getModelConfigOption(session.config_options)
    : null;

  const currentModelId = modelConfig?.currentValue;
  const availableModels = modelConfig?.options || [];

  // 如果没有 model config option，不显示
  if (!modelConfig || availableModels.length === 0) {
    return null;
  }

  const handleModelSelect = async (modelId: string) => {
    if (!session) return;

    try {
      await setSessionConfigOption(session.id, modelConfig.id, modelId);
      setPopoverOpen(false);
    } catch (error) {
      console.error('Failed to change model:', error);
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm">
            {availableModels.find((m) => m.value === currentModelId)?.name || 'Model'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="space-y-1">
          {availableModels.map((model) => (
            <div
              key={model.value}
              onClick={() => handleModelSelect(model.value)}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors",
                currentModelId === model.value
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 mt-0.5 flex-shrink-0",
                  currentModelId === model.value ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex-1 space-y-0.5">
                <div className="text-sm font-medium">{model.name}</div>
                {model.description && (
                  <div className="text-xs text-muted-foreground">
                    {model.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

---

### Step 4: 实现 ModeSelector 组件

**文件**: `src/components/chat/chat-input/mode-selector.tsx`

#### 完整实现

```typescript
import { useState } from 'react';
import { Check, ChevronDown, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-storage';
import type { Session, ConfigOption } from '@/types';

interface ModeSelectorProps {
  session: Session | null;
}

// 从 config_options 中查找 mode 配置
function getModeConfigOption(configOptions: ConfigOption[]): ConfigOption | null {
  return configOptions.find((opt) => opt.category === 'mode') || null;
}

export function ModeSelector({ session }: ModeSelectorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { setSessionConfigOption } = useSessionStore();

  const modeConfig = session?.config_options
    ? getModeConfigOption(session.config_options)
    : null;

  const currentModeValue = modeConfig?.currentValue;
  const availableModes = modeConfig?.options || [];

  // 如果没有 mode config option，不显示
  if (!modeConfig || availableModes.length === 0) {
    return null;
  }

  const handleModeSelect = async (modeValue: string) => {
    if (!session) return;

    try {
      await setSessionConfigOption(session.id, modeConfig.id, modeValue);
      setPopoverOpen(false);
    } catch (error) {
      console.error('Failed to change mode:', error);
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2">
          <Layers className="h-4 w-4" />
          <span className="text-sm">
            {availableModes.find((m) => m.value === currentModeValue)?.name || 'Mode'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="space-y-1">
          {availableModes.map((mode) => (
            <div
              key={mode.value}
              onClick={() => handleModeSelect(mode.value)}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors",
                currentModeValue === mode.value
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 mt-0.5 flex-shrink-0",
                  currentModeValue === mode.value ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="flex-1 space-y-0.5">
                <div className="text-sm font-medium">{mode.name}</div>
                {mode.description && (
                  <div className="text-xs text-muted-foreground">
                    {mode.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

---

### Step 5: 更新 ChatInput 组件

**文件**: `src/components/chat/chat-input/index.tsx`

#### 修改目标

移除所有 model 相关的 props，直接传递 `session` 给子组件。

#### 实现步骤

1. **移除冗余状态和 props**：

找到这些行并删除：

```typescript
// 删除这些
const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
const currentModel = session?.model;
const availableModels = session?.available_models || [];
const handleModelSelect = (modelId: string) => {
  onModelChange?.(modelId);
};
```

2. **更新 JSX**：

```tsx
<div className="flex items-center gap-2">
  <ModelSelector session={session} />
  <ModeSelector session={session} />
  {/* TODO: 后续添加 CustomConfigPopover */}
</div>
```

3. **移除 TODO 注释**。

---

## 后端补充工作

### Step 6: 处理 config_options_update 通知

**文件**: `src-tauri/src/providers/acp_client_sdk.rs`

#### 目标

当 Agent 发送 `ConfigOptionUpdate` 时，更新 session 并通知前端。

#### 实现位置

找到 `handle_session_update()` 函数的 `ConfigOptionUpdate` 分支 (约 lines 391-402)。

#### 当前代码：

```rust
SessionUpdate::ConfigOptionUpdate(config_update) => {
    println!(
        "[ACP] Received config_option_update: {} options",
        config_update.config_options.len()
    );
    for option in &config_update.config_options {
        println!(
            "  - name={}, category={:?}",
            option.name, option.category
        );
    }
}
```

#### 修改为：

```rust
SessionUpdate::ConfigOptionUpdate(config_update) => {
    println!(
        "[ACP] Received config_option_update: {} options",
        config_update.config_options.len()
    );
    for option in &config_update.config_options {
        println!(
            "  - name={}, category={:?}",
            option.name, option.category
        );
    }

    // 发送 Tauri 事件到前端
    #[derive(serde::Serialize, Clone)]
    struct ConfigOptionsUpdatePayload {
        session_id: String,
        config_options: Vec<acp::SessionConfigOption>,
    }

    let payload = ConfigOptionsUpdatePayload {
        session_id: session_id.to_string(),
        config_options: config_update.config_options.clone(),
    };

    if let Err(e) = app_handle.emit("config-options-update", &payload) {
        eprintln!("[ACP] Failed to emit config-options-update event: {}", e);
    }

    // TODO: 可选 - 更新 SessionManager 中的 session.config_options 并持久化到数据库
    // 这需要在 SessionManager 中添加一个方法 update_session_config_options
}
```

#### 可选：持久化到数据库

如果希望 Agent 主动更新的 config_options 也保存到数据库，需要：

1. 在 `src-tauri/src/managers/session_manager.rs` 添加方法：

```rust
pub async fn update_session_config_options(
    &self,
    session_id: &str,
    config_options: Vec<agent_client_protocol::SessionConfigOption>,
) -> AppResult<()> {
    let mut sessions = self.sessions.write().await;
    if let Some(entry) = sessions.get_mut(session_id) {
        entry.session.config_options = config_options;

        // 持久化到数据库
        if let Err(e) = self.db.save_session(&entry.session) {
            eprintln!(
                "[SessionManager] Failed to save config_options to database: {}",
                e
            );
        }

        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "Session '{}' not found",
            session_id
        )))
    }
}
```

2. 在 `handle_session_update` 中调用（需要传递 SessionManager 的引用）。

---

### Step 7: 添加 set_session_config_option Tauri 命令

**目标**: 允许前端通过通用接口设置任何 config option（包括 model）。

#### 7.1 添加 ACP Command 变体

**文件**: `src-tauri/src/providers/acp_client_sdk.rs`

找到 `AcpCommand` enum (约 line 23-43)，添加：

```rust
SetConfigOption {
    config_id: String,
    value: String,
    reply: oneshot::Sender<Result<(), String>>,
},
```

#### 7.2 处理 SetConfigOption 命令

在 `run_command_loop` 函数 (约 lines 861-986) 的 match 语句中添加：

```rust
AcpCommand::SetConfigOption { config_id, value, reply } => {
    println!(
        "[ACP] Setting config option '{}' to '{}'",
        config_id, value
    );

    let result = conn
        .set_session_config_option(acp::SetSessionConfigOptionRequest {
            session_id: session_id.clone(),
            config_id: config_id.clone(),
            value: value.clone(),
        })
        .await;

    match result {
        Ok(response) => {
            println!(
                "[ACP] Config option updated, received {} config options",
                response.config_options.len()
            );

            // TODO: 更新 adapter 的 config_options 字段（需要在 adapter 中添加方法）
            // 或者通过 SessionUpdate::ConfigOptionUpdate 自动同步

            let _ = reply.send(Ok(()));
        }
        Err(e) => {
            eprintln!("[ACP] Failed to set config option: {:?}", e);
            let _ = reply.send(Err(format!("Failed to set config option: {:?}", e)));
        }
    }
}
```

#### 7.3 添加 SessionManager 方法

**文件**: `src-tauri/src/managers/session_manager.rs`

在 `set_session_model` 方法附近添加：

```rust
/// Set a config option for an active session
pub async fn set_session_config_option(
    &self,
    session_id: &str,
    config_id: String,
    value: String,
) -> AppResult<()> {
    // Get adapter
    let adapter = {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).and_then(|e| e.adapter.clone())
    };

    let adapter = adapter.ok_or_else(|| {
        AppError::InvalidOperation("Session is not active".to_string())
    })?;

    let mut adapter = adapter.lock().await;

    // 获取 cmd_tx（假设 adapter 暴露了这个方法，或者通过其他方式发送命令）
    // 注意：当前 ProviderAdapter trait 没有暴露发送任意命令的方法
    // 这里需要根据实际架构调整

    // 简化方案：如果是 model，直接调用 set_model
    if config_id == "model" || is_model_config(&config_id, &adapter) {
        return adapter.set_model(&value).await;
    }

    // 对于其他 config options，需要扩展 ProviderAdapter trait
    // 或者直接在 adapter 实现中处理

    Err(AppError::InvalidOperation(
        "Setting arbitrary config options not yet implemented".to_string(),
    ))
}

fn is_model_config(config_id: &str, adapter: &impl ProviderAdapter) -> bool {
    // 检查是否是 model 类型的 config option
    adapter
        .config_options()
        .iter()
        .find(|opt| opt.id == config_id)
        .map(|opt| opt.category == Some(SessionConfigOptionCategory::Model))
        .unwrap_or(false)
}
```

**注意**: 完整实现需要在 ProviderAdapter trait 中添加更通用的方法，或者直接访问 Claude/Kimi adapter 的 `cmd_tx`。

#### 7.4 注册 Tauri 命令

**文件**: `src-tauri/src/commands/session.rs`

添加：

```rust
#[tauri::command]
pub async fn set_session_config_option(
    session_id: String,
    config_id: String,
    value: String,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    state
        .set_session_config_option(&session_id, config_id, value)
        .await
        .map_err(|e| e.to_string())
}
```

**文件**: `src-tauri/src/lib.rs`

在 `.invoke_handler` 中添加：

```rust
tauri::generate_handler![
    // ... 其他命令
    set_session_config_option,
]
```

---

### Step 8: 移除旧的 set_session_model 命令（可选）

如果要完全迁移到 `set_session_config_option`，需要：

1. 从 `src-tauri/src/commands/session.rs` 删除 `set_session_model` 函数
2. 从 `src-tauri/src/managers/session_manager.rs` 删除 `set_session_model` 方法
3. 从 `src-tauri/src/providers/acp_client_sdk.rs` 删除 `SetModel` 变体和处理逻辑
4. 从 `src-tauri/src/lib.rs` 的 `invoke_handler` 中移除 `set_session_model`
5. 从 `src-tauri/src/db/mod.rs` 删除 `update_session_model` 方法

**建议**: 先保留 `set_session_model` 作为向后兼容，等前端完全切换后再删除。

---

## 测试验证

### 前端测试

1. **启动应用**：

   ```bash
   bun run tauri dev
   ```

2. **创建新 Session**：
   - 选择 Claude 或 Kimi provider
   - 创建 session 后，检查 UI 是否显示 ModelSelector 和 ModeSelector

3. **切换 Model**：
   - 点击 ModelSelector
   - 选择不同的 model
   - 观察 UI 是否更新
   - 打开浏览器 DevTools Console，检查是否有错误

4. **切换 Mode**：
   - 点击 ModeSelector
   - 选择不同的 mode（如果可用）
   - 观察 UI 是否更新

5. **检查持久化**：
   - 切换 model 或 mode
   - 关闭并重新打开应用
   - Resume session，检查配置是否保留

### 后端测试

1. **检查日志**：
   - 在 Terminal 查看后端日志
   - 确认 `[ACP] Handshake complete: ... config_options` 日志
   - 确认 `config_options` 被正确提取和存储

2. **数据库检查**：

   ```bash
   sqlite3 ~/Library/Application\ Support/com.forkestra.dev/forkestra.db
   SELECT id, name, config_options FROM sessions;
   .quit
   ```

   - 检查 `config_options` 列是否包含 JSON 数据

3. **Tauri Event 检查**：
   - 在前端添加 event listener 日志
   - 确认 `config-options-update` 事件被正确接收

---

## CustomConfigPopover 实现指南（可选，后续）

> 这部分用于实现 "..." 按钮，显示除 model 和 mode 之外的所有 config options

### 组件结构

**文件**: `src/components/chat/chat-input/custom-config-popover.tsx` (新建)

### 功能需求

1. **筛选配置**：排除 category 为 `model` 和 `mode` 的选项
2. **分组显示**：
   - `thought_level`: 思考级别
   - 自定义 category（`_` 开头）
   - 无 category 的选项：放在 "Other" 组
3. **折叠/展开**：每个分组可以折叠/展开
4. **边界情况**：
   - 如果没有额外选项，隐藏 "..." 按钮
   - 如果只有一个选项，默认展开

### 实现示例

```typescript
import { useState } from 'react';
import { MoreHorizontal, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-storage';
import type { Session, ConfigOption } from '@/types';

interface CustomConfigPopoverProps {
  session: Session | null;
}

// 分组 config options
function groupConfigOptions(configOptions: ConfigOption[]) {
  const groups: Record<string, ConfigOption[]> = {};

  for (const option of configOptions) {
    // 排除 model 和 mode
    if (option.category === 'model' || option.category === 'mode') {
      continue;
    }

    const category = option.category || 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(option);
  }

  return groups;
}

// 获取分组的友好名称
function getCategoryDisplayName(category: string): string {
  if (category === 'thought_level') return 'Thought Level';
  if (category === 'other') return 'Other';
  if (category.startsWith('_')) return category.slice(1); // 移除下划线前缀
  return category;
}

export function CustomConfigPopover({ session }: CustomConfigPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { setSessionConfigOption } = useSessionStore();

  const configOptions = session?.config_options || [];
  const groupedOptions = groupConfigOptions(configOptions);
  const categoryKeys = Object.keys(groupedOptions);

  // 如果没有额外的配置选项，不显示按钮
  if (categoryKeys.length === 0) {
    return null;
  }

  // 如果只有一个分组，默认展开
  if (categoryKeys.length === 1 && !expandedGroups.has(categoryKeys[0])) {
    setExpandedGroups(new Set([categoryKeys[0]]));
  }

  const toggleGroup = (category: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleOptionSelect = async (configId: string, value: string) => {
    if (!session) return;

    try {
      await setSessionConfigOption(session.id, configId, value);
    } catch (error) {
      console.error('Failed to change config option:', error);
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <div className="space-y-2">
          {categoryKeys.map((category) => {
            const options = groupedOptions[category];
            const isExpanded = expandedGroups.has(category);

            return (
              <Collapsible
                key={category}
                open={isExpanded}
                onOpenChange={() => toggleGroup(category)}
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent">
                  <span>{getCategoryDisplayName(category)}</span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1">
                  {options.map((option) => (
                    <div key={option.id} className="pl-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {option.name}
                      </div>
                      {option.options.map((optValue) => (
                        <div
                          key={optValue.value}
                          onClick={() => handleOptionSelect(option.id, optValue.value)}
                          className={cn(
                            "flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-sm",
                            option.currentValue === optValue.value
                              ? "bg-accent"
                              : "hover:bg-accent/50"
                          )}
                        >
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 mt-0.5 flex-shrink-0",
                              option.currentValue === optValue.value
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            <div className="text-sm">{optValue.name}</div>
                            {optValue.description && (
                              <div className="text-xs text-muted-foreground">
                                {optValue.description}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

### 在 ChatInput 中使用

```tsx
<div className="flex items-center gap-2">
  <ModelSelector session={session} />
  <ModeSelector session={session} />
  <CustomConfigPopover session={session} />
</div>
```

---

## 总结

### 已完成 ✅

- 后端数据库、Session 模型、Provider adapters
- config_options 从 ACP handshake 提取和存储
- Session manager 同步 config_options

### 需要完成 🚧

1. **前端类型** (Step 1) - 5 分钟
2. **Zustand store** (Step 2) - 15 分钟
3. **ModelSelector 重构** (Step 3) - 15 分钟
4. **ModeSelector 实现** (Step 4) - 15 分钟
5. **ChatInput 更新** (Step 5) - 5 分钟
6. **处理 config_options_update** (Step 6) - 20 分钟
7. **set_session_config_option 命令** (Step 7) - 30 分钟
8. **测试验证** (Step 测试) - 20 分钟

### 可选后续工作 ⏭️

- CustomConfigPopover 组件
- 移除旧的 set_session_model 命令

---

**预计总工作时间**: 2-3 小时（不包括 CustomConfigPopover）

**优先级**: Step 1-5 (前端基础) → Step 6-7 (后端通信) → 测试验证

祝实现顺利！🚀
