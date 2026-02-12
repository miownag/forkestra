# Content Block 实现改进建议

基于 ACP Content 规范（https://agentclientprotocol.com/content）的分析结果。

## 1. 后端改进（Rust）

### 1.1 扩展 ContentBlock 枚举

**文件**: `src-tauri/src/models/acp.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Annotations>,
    },

    Image {
        data: String,  // Base64-encoded
        #[serde(rename = "mimeType")]
        mime_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        uri: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Annotations>,
    },

    Audio {
        data: String,  // Base64-encoded
        #[serde(rename = "mimeType")]
        mime_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Annotations>,
    },

    Resource {
        resource: EmbeddedResource,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Annotations>,
    },

    #[serde(rename = "resource_link")]
    ResourceLink {
        uri: String,
        name: String,
        #[serde(skip_serializing_if = "Option::is_none", rename = "mimeType")]
        mime_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        size: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Annotations>,
    },

    // 保留现有的 tool_use/tool_result
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },

    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: Option<bool>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EmbeddedResource {
    Text {
        uri: String,
        text: String,
        #[serde(skip_serializing_if = "Option::is_none", rename = "mimeType")]
        mime_type: Option<String>,
    },
    Blob {
        uri: String,
        blob: String,  // Base64-encoded
        #[serde(skip_serializing_if = "Option::is_none", rename = "mimeType")]
        mime_type: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotations {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audience: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<f64>,
}
```

### 1.2 更新 handle_session_update_raw

**文件**: `src-tauri/src/providers/acp_helper.rs`

在 `handle_session_update_raw` 函数中添加对新 content types 的处理：

```rust
// 在 agent_message_chunk / agent_thought_chunk 处理中
if let Some(content_type) = update_obj.get("content").and_then(|c| c.get("type")) {
    match content_type.as_str() {
        Some("text") => {
            // 现有 text 处理逻辑
        }
        Some("image") => {
            // 提取 image data 和 mimeType，发送到前端
            if let (Some(data), Some(mime_type)) = (
                update_obj.get("content").and_then(|c| c.get("data").and_then(|d| d.as_str())),
                update_obj.get("content").and_then(|c| c.get("mimeType").and_then(|m| m.as_str()))
            ) {
                // 发送 image content 事件到前端
            }
        }
        Some("audio") => {
            // 类似 image 处理
        }
        Some("resource") => {
            // 提取 resource 内容
        }
        Some("resource_link") => {
            // 提取 resource_link 信息
        }
        _ => {}
    }
}
```

## 2. 前端改进（TypeScript/React）

### 2.1 扩展类型定义

**文件**: `src/types/index.ts`

```typescript
// 添加 ACP ContentBlock 类型
export type ContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | AudioContentBlock
  | ResourceContentBlock
  | ResourceLinkContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

export interface TextContentBlock {
  type: "text";
  text: string;
  annotations?: Annotations;
}

export interface ImageContentBlock {
  type: "image";
  data: string;  // Base64
  mimeType: string;
  uri?: string;
  annotations?: Annotations;
}

export interface AudioContentBlock {
  type: "audio";
  data: string;  // Base64
  mimeType: string;
  annotations?: Annotations;
}

export interface ResourceContentBlock {
  type: "resource";
  resource: EmbeddedResource;
  annotations?: Annotations;
}

export interface ResourceLinkContentBlock {
  type: "resource_link";
  uri: string;
  name: string;
  mimeType?: string;
  title?: string;
  description?: string;
  size?: number;
  annotations?: Annotations;
}

export interface ToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type EmbeddedResource =
  | { uri: string; text: string; mimeType?: string }
  | { uri: string; blob: string; mimeType?: string };

export interface Annotations {
  audience?: string[];
  priority?: number;
}

// 更新 MessagePart 类型
export type MessagePart =
  | { type: "text"; content: string }
  | { type: "image"; content: ImageContentBlock }
  | { type: "audio"; content: AudioContentBlock }
  | { type: "resource"; content: ResourceContentBlock }
  | { type: "resource_link"; content: ResourceLinkContentBlock }
  | { type: "tool_call"; tool_call: ToolCallInfo };
```

### 2.2 扩展 Steps 组件

**文件**: `src/components/chat/chat-message/steps.tsx`

```tsx
// 添加新的 Step 组件

function ImageStep({ content, isLast }: { content: ImageContentBlock; isLast: boolean }) {
  const imageUrl = `data:${content.mimeType};base64,${content.data}`;

  return (
    <ChainOfThoughtStep defaultOpen isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuImage className="size-4 text-foreground" />}
        swapIconOnHover={false}
      >
        Image
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <img src={imageUrl} alt="Content" className="max-w-full rounded-md" />
          {content.uri && (
            <div className="mt-2 text-xs text-muted-foreground">
              Source: {content.uri}
            </div>
          )}
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function ResourceStep({ content, isLast }: { content: ResourceContentBlock; isLast: boolean }) {
  const resource = content.resource;
  const isText = 'text' in resource;

  return (
    <ChainOfThoughtStep defaultOpen isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuFile className="size-4 text-foreground" />}
        swapIconOnHover={false}
      >
        Resource: {resource.uri}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          {isText ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap">{resource.text}</pre>
            </div>
          ) : (
            <div className="text-muted-foreground">
              Binary resource: {resource.mimeType}
            </div>
          )}
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function ResourceLinkStep({ content, isLast }: { content: ResourceLinkContentBlock; isLast: boolean }) {
  return (
    <ChainOfThoughtStep defaultOpen={false} isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuLink className="size-4 text-foreground" />}
        swapIconOnHover={false}
      >
        {content.title || content.name}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <div className="space-y-2">
            {content.description && (
              <p className="text-sm text-muted-foreground">{content.description}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{content.uri}</span>
              {content.size && <span>• {(content.size / 1024).toFixed(1)} KB</span>}
            </div>
          </div>
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

// 更新 Steps 组件的 render 逻辑
export function Steps({ message }: StepsProps) {
  // ... 现有代码 ...

  return (
    <ChainOfThought>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        switch (part.type) {
          case "text":
            return <TextStep key={i} content={part.content} isLast={isLast} />;
          case "image":
            return <ImageStep key={i} content={part.content} isLast={isLast} />;
          case "audio":
            return <AudioStep key={i} content={part.content} isLast={isLast} />;
          case "resource":
            return <ResourceStep key={i} content={part.content} isLast={isLast} />;
          case "resource_link":
            return <ResourceLinkStep key={i} content={part.content} isLast={isLast} />;
          case "tool_call":
            return renderToolStep(part.tool_call, isLast);
          default:
            return null;
        }
      })}
    </ChainOfThought>
  );
}
```

## 3. 功能优先级

### 🔴 高优先级（必须实现）
1. **Resource Content** - 支持 @-mention 文件/资源
2. **Image Content** - 显示 AI 返回的图片

### 🟡 中优先级（建议实现）
1. **Resource Link** - 引用外部资源
2. **Audio Content** - 显示音频内容

### 🟢 低优先级（可选）
1. **Annotations** - 元数据支持（audience, priority）

## 4. 测试建议

### 4.1 后端测试
- 解析包含各种 content types 的 ACP 消息
- 验证 capability 检测逻辑
- 测试 Base64 编码/解码

### 4.2 前端测试
- 渲染各种 content block 类型
- 测试大图片/音频的性能
- 验证 @-mention 文件选择 UI

### 4.3 集成测试
- 从 Claude Code 发送图片，验证显示
- 测试 resource 内容的完整传输
- 验证 tool use/result 的往返

## 5. 兼容性注意事项

- 保持向后兼容：旧版本消息应该仍能正确显示
- 优雅降级：不支持的 content type 应显示占位符而非报错
- Capability 检测：只在 Agent 支持时才发送特殊内容类型
