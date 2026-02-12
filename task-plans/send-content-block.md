# Task: 实现用户发送 ContentBlock（支持图片上传）

## 背景

当前系统已实现 AI 返回图片的显示功能，但用户只能发送纯文本消息。根据 ACP 规范，`session/prompt` 应该接受 `ContentBlock[]`，这样用户就可以发送包含图片、文件等多种内容的消息。

## 目标

实现用户发送包含图片的消息功能，遵循 ACP Content 规范。

## 当前状态

### ✅ 已实现
- AI 返回图片的解析和显示（`ImageStep` 组件）
- `ContentBlock::Image` 类型定义（后端和前端）
- 图片流式传输处理（`handleStreamChunk`）

### ❌ 未实现
- 用户选择图片文件
- 图片转换为 Base64
- 发送包含图片的消息到后端
- 后端接受 `ContentBlock[]` 而非 `String`

## 技术方案

### 架构改动

```
前端 UI (选择图片)
    ↓
前端处理 (转 Base64)
    ↓
Tauri Command (send_message_with_content)
    ↓
SessionManager (处理 ContentBlock[])
    ↓
ProviderAdapter (发送到 ACP CLI)
    ↓
ACP Protocol (session/prompt)
```

## 实施步骤

### Step 1: 扩展前端类型定义

**文件**: `src/types/index.ts`

```typescript
// 添加用户消息内容类型
export interface UserMessageContent {
  blocks: ContentBlock[];
}

// ContentBlock 联合类型（发送时使用）
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri?: string };
```

### Step 2: 实现前端图片选择和预览

**文件**: `src/components/chat/chat-input/index.tsx`

#### 2.1 添加状态管理

```typescript
const [attachedImages, setAttachedImages] = useState<ImageContent[]>([]);
```

#### 2.2 实现文件读取函数

```typescript
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix: "data:image/png;base64,"
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
```

#### 2.3 处理文件选择

```typescript
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;

  const imagePromises = Array.from(files)
    .filter(file => file.type.startsWith('image/'))
    .map(async (file) => ({
      data: await fileToBase64(file),
      mimeType: file.type,
      uri: file.name, // Optional: store filename
    }));

  const images = await Promise.all(imagePromises);
  setAttachedImages(prev => [...prev, ...images]);
};
```

#### 2.4 更新 input 元素

```typescript
<input
  type="file"
  multiple
  accept="image/*"
  className="hidden"
  id="select-file-path"
  onChange={handleFileSelect}
/>
```

#### 2.5 添加图片预览 UI

```typescript
{attachedImages.length > 0 && (
  <div className="flex gap-2 pb-2 flex-wrap">
    {attachedImages.map((img, idx) => (
      <div key={idx} className="relative group">
        <img
          src={`data:${img.mimeType};base64,${img.data}`}
          alt={img.uri || "attachment"}
          className="h-16 w-16 object-cover rounded-md border border-border"
        />
        <button
          type="button"
          onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100"
        >
          <LuX className="size-3" />
        </button>
      </div>
    ))}
  </div>
)}
```

#### 2.6 修改 handleOnSubmit

```typescript
const handleOnSubmit = async () => {
  if ((input.trim() || attachedImages.length > 0) && !disabled) {
    setInlineSlashOpen(false);
    setInlineSlashQuery("");
    setButtonSlashOpen(false);

    // 构建 ContentBlock 数组
    const blocks: ContentBlock[] = [];

    // 添加图片
    attachedImages.forEach(img => {
      blocks.push({
        type: "image",
        data: img.data,
        mimeType: img.mimeType,
        uri: img.uri,
      });
    });

    // 添加文本（如果有）
    if (input.trim()) {
      blocks.push({
        type: "text",
        text: input.trim(),
      });
    }

    await onSendWithContent(blocks);
    setInput("");
    setAttachedImages([]);
  }
};
```

### Step 3: 更新前端 API 调用

**文件**: `src/stores/session-storage.ts`

#### 3.1 修改 sendMessage 函数

```typescript
sendMessage: async (sessionId: string, message: string) => {
  // 兼容旧接口：纯文本消息
  const blocks: ContentBlock[] = [{
    type: "text",
    text: message,
  }];
  return get().sendMessageWithContent(sessionId, blocks);
},

sendMessageWithContent: async (sessionId: string, blocks: ContentBlock[]) => {
  const { messages } = get();
  const sessionMessages = messages[sessionId] || [];

  // 创建用户消息（显示用）
  const displayContent = blocks
    .map(b => b.type === "text" ? b.text : `[Image: ${b.mimeType}]`)
    .join("\n");

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    role: "user",
    content: displayContent,
    content_type: "text",
    timestamp: new Date().toISOString(),
    is_streaming: false,
    parts: blocks.map(b =>
      b.type === "image"
        ? { type: "image", content: { data: b.data, mimeType: b.mimeType, uri: b.uri } }
        : { type: "text", content: b.text }
    ),
  };

  // 添加到状态
  set((state) => ({
    messages: {
      ...state.messages,
      [sessionId]: [...sessionMessages, userMessage],
    },
    streamingSessions: new Set(state.streamingSessions).add(sessionId),
  }));

  try {
    // 保存用户消息
    await invoke("save_message", { message: userMessage });

    // 发送到后端
    await invoke("send_message_with_content", {
      sessionId,
      blocks,
    });
  } catch (error) {
    console.error("Failed to send message:", error);
    set((state) => {
      const newStreamingSessions = new Set(state.streamingSessions);
      newStreamingSessions.delete(sessionId);
      return { streamingSessions: newStreamingSessions };
    });
    throw error;
  }
},
```

### Step 4: 创建新的 Tauri Command

**文件**: `src-tauri/src/commands/session.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FrontendContentBlock {
    Text { text: String },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        uri: Option<String>,
    },
}

#[tauri::command]
pub async fn send_message_with_content(
    manager: State<'_, SessionManager>,
    session_id: String,
    blocks: Vec<FrontendContentBlock>,
) -> Result<(), String> {
    // 转换为内部 ContentBlock 类型
    let content_blocks: Vec<ContentBlock> = blocks
        .into_iter()
        .map(|b| match b {
            FrontendContentBlock::Text { text } => ContentBlock::Text { text },
            FrontendContentBlock::Image { data, mime_type, uri } => {
                ContentBlock::Image { data, mime_type, uri }
            }
        })
        .collect();

    manager
        .send_message_with_content(&session_id, content_blocks)
        .await
        .map_err(|e| e.to_string())
}
```

**注册命令**: `src-tauri/src/lib.rs`

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    send_message_with_content,
])
```

### Step 5: 更新 SessionManager

**文件**: `src-tauri/src/managers/session_manager.rs`

```rust
pub async fn send_message_with_content(
    &self,
    session_id: &str,
    blocks: Vec<ContentBlock>,
) -> AppResult<()> {
    let mut sessions = self.sessions.lock().await;
    let session = sessions
        .get_mut(session_id)
        .ok_or_else(|| AppError::NotFound(format!("Session not found: {}", session_id)))?;

    if !session.adapter.is_active() {
        return Err(AppError::Provider("Session is not active".to_string()));
    }

    session.adapter.send_message_with_content(blocks).await
}
```

### Step 6: 更新 ProviderAdapter trait

**文件**: `src-tauri/src/providers/adapter.rs`

```rust
#[async_trait]
pub trait ProviderAdapter: Send {
    // 保留旧方法以兼容
    async fn send_message(&mut self, message: &str) -> AppResult<()> {
        self.send_message_with_content(vec![ContentBlock::Text {
            text: message.to_string(),
        }])
        .await
    }

    // 新方法
    async fn send_message_with_content(&mut self, blocks: Vec<ContentBlock>) -> AppResult<()>;

    // ... other methods
}
```

### Step 7: 实现 Claude Adapter

**文件**: `src-tauri/src/providers/claude.rs`

```rust
#[async_trait]
impl ProviderAdapter for ClaudeAdapter {
    async fn send_message_with_content(&mut self, blocks: Vec<ContentBlock>) -> AppResult<()> {
        let stdin_tx = self
            .stdin_tx
            .as_ref()
            .ok_or_else(|| AppError::Provider("Session not started".to_string()))?;

        // 处理权限请求（如果有）
        let pending_perm = {
            let mut perm = self.pending_permission.lock().await;
            perm.take()
        };

        if let Some(perm) = pending_perm {
            // 权限响应逻辑（保持不变）
            // ...
            return Ok(());
        }

        // 构建 session/prompt 请求
        let acp_session_id = self
            .acp_session_id
            .as_ref()
            .ok_or_else(|| AppError::Provider("No ACP session ID".to_string()))?;

        let request_id = self.next_request_id();
        let request = build_prompt_request(request_id, acp_session_id, blocks)?;

        // 发送请求
        let request_json = serde_json::to_string(&request)
            .map_err(|e| AppError::Provider(format!("Failed to serialize request: {}", e)))?;

        println!("[ClaudeAdapter] Sending prompt with {} content blocks", blocks.len());

        stdin_tx
            .send(request_json + "\n")
            .await
            .map_err(|e| AppError::Provider(format!("Failed to send message: {}", e)))?;

        Ok(())
    }
}
```

### Step 8: 更新 build_prompt_request

**文件**: `src-tauri/src/providers/acp_helper.rs`

```rust
pub fn build_prompt_request(
    request_id: u64,
    acp_session_id: &str,
    prompt: Vec<ContentBlock>,
) -> AppResult<JsonRpcRequest> {
    let prompt_params = SessionPromptParams {
        session_id: acp_session_id.to_string(),
        prompt,
    };

    let params_value = serde_json::to_value(prompt_params)
        .map_err(|e| AppError::Provider(format!("Failed to serialize prompt params: {}", e)))?;

    Ok(JsonRpcRequest::new(
        request_id,
        "session/prompt",
        params_value,
    ))
}
```

### Step 9: 同样实现 Kimi Adapter

**文件**: `src-tauri/src/providers/kimi.rs`

```rust
#[async_trait]
impl ProviderAdapter for KimiAdapter {
    async fn send_message_with_content(&mut self, blocks: Vec<ContentBlock>) -> AppResult<()> {
        // 与 ClaudeAdapter 类似的实现
        // ...
    }
}
```

## 可选增强功能

### 1. Capability 检测

**在前端禁用上传按钮**:

```typescript
// src/stores/session-storage.ts
export interface Session {
  // ... existing fields
  capabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
}

// src/components/chat/chat-input/index.tsx
const supportsImage = session?.capabilities?.image ?? false;

<input
  type="file"
  disabled={!supportsImage}
  // ...
/>
```

**后端存储 capabilities**:

```rust
// src-tauri/src/models/session.rs
pub struct Session {
    // ... existing fields
    pub capabilities: Option<PromptCapabilities>,
}

// 在 handle_initialize_result 中存储
session.capabilities = Some(caps.prompt_capabilities.clone());
```

### 2. 图片压缩

避免发送过大的 Base64 数据：

```typescript
// src/utils/image-utils.ts
export async function compressImage(
  file: File,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL(file.type, quality).split(',')[1];
      resolve(base64);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

### 3. 用户消息显示优化

在 `Steps` 组件中也显示用户上传的图片：

```tsx
// src/components/chat/chat-message/index.tsx
{message.role === "user" && message.parts && (
  <div className="space-y-2">
    {message.parts.map((part, idx) => (
      part.type === "image" ? (
        <img
          key={idx}
          src={`data:${part.content.mimeType};base64,${part.content.data}`}
          alt="User uploaded"
          className="max-w-xs rounded-md border border-border"
        />
      ) : null
    ))}
  </div>
)}
```

### 4. 拖放上传

```typescript
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  // 处理文件...
};

<div
  onDrop={handleDrop}
  onDragOver={(e) => e.preventDefault()}
>
  {/* chat input */}
</div>
```

## 测试计划

### 单元测试
- [ ] `fileToBase64` 函数正确转换图片
- [ ] `FrontendContentBlock` 序列化/反序列化
- [ ] `build_prompt_request` 包含多个 ContentBlock

### 集成测试
- [ ] 选择单个图片并发送
- [ ] 选择多个图片并发送
- [ ] 图片 + 文本混合发送
- [ ] 移除已选择的图片
- [ ] 清空输入框后图片也清空
- [ ] 大图片上传（>5MB）

### E2E 测试
- [ ] 上传图片到 Claude Code，收到正常响应
- [ ] 上传图片到 Kimi Code，收到正常响应
- [ ] 不支持 image capability 时禁用上传
- [ ] 用户消息和 AI 响应都显示图片

## 相关文件清单

### 需要修改的文件
- `src/types/index.ts` - 添加 ContentBlock 类型
- `src/components/chat/chat-input/index.tsx` - UI 和文件处理
- `src/stores/session-storage.ts` - 添加 sendMessageWithContent
- `src-tauri/src/commands/session.rs` - 新 Tauri command
- `src-tauri/src/managers/session_manager.rs` - 转发到 adapter
- `src-tauri/src/providers/adapter.rs` - 新 trait 方法
- `src-tauri/src/providers/claude.rs` - 实现新方法
- `src-tauri/src/providers/kimi.rs` - 实现新方法
- `src-tauri/src/providers/acp_helper.rs` - 更新 build_prompt_request
- `src-tauri/src/lib.rs` - 注册新 command

### 需要创建的文件（可选）
- `src/utils/image-utils.ts` - 图片处理工具
- `src/components/chat/chat-input/image-preview.tsx` - 图片预览组件

## 参考资料

- ACP Content 规范: https://agentclientprotocol.com/content
- ACP Prompt 规范: https://agentclientprotocol.com/prompt-turn
- 已实现功能文档: [IMAGE_CONTENT_IMPLEMENTATION.md](../IMAGE_CONTENT_IMPLEMENTATION.md)
- Content 改进建议: [IMPROVEMENTS.md](../IMPROVEMENTS.md)
- Content 规范知识库: [knowledge/content.md](../knowledge/content.md)

## 估算工作量

- **前端实现**: 4-6 小时
  - UI 开发: 2 小时
  - 状态管理: 1 小时
  - Base64 转换: 1 小时
  - 测试: 1-2 小时

- **后端实现**: 3-4 小时
  - Trait 扩展: 1 小时
  - Adapter 实现: 1.5 小时
  - 测试: 0.5-1 小时

- **集成测试**: 2 小时

**总计**: 9-12 小时

## 注意事项

1. **向后兼容**: 保留 `send_message(String)` 方法，内部调用 `send_message_with_content`
2. **性能优化**: 考虑压缩大图片（>1MB）
3. **错误处理**: 图片格式不支持时给用户提示
4. **安全性**: 限制单个图片大小（建议 <10MB）和总数量（建议 <5 张）
5. **用户体验**: 显示上传进度（大文件时）
6. **ACP 合规**: 发送前检查 Agent 的 `image` capability

## 完成标准

- [ ] 用户可以通过点击附件按钮选择图片
- [ ] 选中的图片在输入框上方预览
- [ ] 可以移除已选择的图片
- [ ] 点击发送按钮，图片和文本一起发送
- [ ] 后端正确构建 `session/prompt` 请求
- [ ] Claude Code 和 Kimi Code 都能正常处理
- [ ] 用户消息在聊天界面正确显示图片
- [ ] 所有测试通过
- [ ] 代码通过 Rust 和 TypeScript 编译
