# Image Content Implementation Summary

## ✅ Completed Features

### 1. Backend (Rust) - AI Returns Images

#### ContentBlock Enum Extended
**File**: [src-tauri/src/models/acp.rs](src-tauri/src/models/acp.rs#L190-L216)

Added `Image` variant to ContentBlock:
```rust
Image {
    data: String,           // Base64-encoded image data
    mime_type: String,      // e.g., "image/png", "image/jpeg"
    uri: Option<String>,    // Optional source URI
}
```

#### Stream Handling
**File**: [src-tauri/src/models/message.rs](src-tauri/src/models/message.rs#L87-L107)

- Added `ImageContent` struct
- Extended `StreamChunk` with `image_content` field
- Added `Image` to `StreamChunkType` enum

#### ACP Protocol Parsing
**File**: [src-tauri/src/providers/acp_helper.rs](src-tauri/src/providers/acp_helper.rs#L726-L794)

Enhanced `handle_session_update_raw` to parse `agent_message_chunk` with image content:
- Detects `content.type === "image"`
- Extracts `data`, `mimeType`, and optional `uri`
- Sends to frontend via `StreamChunk` with `chunk_type: Image`

### 2. Frontend (TypeScript/React) - Display AI Images

#### Type Definitions
**File**: [src/types/index.ts](src/types/index.ts#L132-L140)

```typescript
export type MessagePart =
  | { type: "text"; content: string }
  | { type: "image"; content: ImageContent }
  | { type: "tool_call"; tool_call: ToolCallInfo };

export interface ImageContent {
  data: string;      // Base64
  mimeType: string;
  uri?: string;
}
```

Added `"image"` to `StreamChunkType` and `image_content?` to `StreamChunk`.

#### Stream Processing
**File**: [src/stores/session-storage.ts](src-tauri/src/stores/session-storage.ts#L605-L676)

Enhanced `handleStreamChunk` to handle image chunks:
- Detects `chunk_type === "image"`
- Creates `MessagePart` with `type: "image"`
- Stores in message parts array

#### UI Component
**File**: [src/components/chat/chat-message/steps.tsx](src/components/chat/chat-message/steps.tsx#L138-L170)

Created `ImageStep` component:
- Displays images using `data:${mimeType};base64,${data}` URL
- Shows optional source URI
- Matches existing UI style with ChainOfThought components

## ⏳ Future Enhancements (Not Implemented)

### User Image Upload

To implement user image uploads, the following changes are needed:

#### 1. Frontend - File Upload UI
**File**: [src/components/chat/chat-input/index.tsx](src/components/chat/chat-input/index.tsx#L186-L200)

The attachment button exists but needs implementation:
```tsx
// TODO: Handle file selection
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;

  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      const base64 = await fileToBase64(file);
      setAttachedImages(prev => [...prev, {
        data: base64,
        mimeType: file.type,
      }]);
    }
  }
};
```

#### 2. Backend - Accept ContentBlock[]
**Files**:
- [src-tauri/src/commands/session.rs](src-tauri/src/commands/session.rs#L35-L44)
- [src-tauri/src/managers/session_manager.rs](src-tauri/src/managers/session_manager.rs)
- [src-tauri/src/providers/adapter.rs](src-tauri/src/providers/adapter.rs#L62)

Change signature from:
```rust
async fn send_message(&mut self, message: &str) -> AppResult<()>
```

To:
```rust
async fn send_message(&mut self, prompt: Vec<ContentBlock>) -> AppResult<()>
```

#### 3. Update build_prompt_request
**File**: [src-tauri/src/providers/acp_helper.rs](src-tauri/src/providers/acp_helper.rs#L623-L644)

Change from accepting `message: &str` to `prompt: Vec<ContentBlock>`:
```rust
pub fn build_prompt_request(
    request_id: u64,
    acp_session_id: &str,
    prompt: Vec<ContentBlock>,
) -> AppResult<JsonRpcRequest> {
    let prompt_params = SessionPromptParams {
        session_id: acp_session_id.to_string(),
        prompt, // Use directly instead of wrapping in ContentBlock::Text
    };
    // ...
}
```

#### 4. Capability Check
**File**: [src-tauri/src/models/acp.rs](src-tauri/src/models/acp.rs#L106-L115)

Store `PromptCapabilities` in Session:
```rust
// In Session struct (models/session.rs)
pub capabilities: Option<AgentCapabilities>,

// Check before allowing upload
if !session.capabilities.prompt_capabilities.image {
    return Err("Agent does not support image content");
}
```

## 📋 Testing Checklist

### ✅ AI Returns Images (Implemented)
- [ ] Test with Claude Code returning an image
- [ ] Verify Base64 decoding works correctly
- [ ] Check image display in dark/light themes
- [ ] Verify multiple images in one message
- [ ] Test image + text mixed content

### ⏳ User Uploads Images (Not Implemented)
- [ ] File picker opens on attachment button click
- [ ] Only image files are accepted
- [ ] Preview attached images before sending
- [ ] Remove attached images
- [ ] Send message with text + images
- [ ] Capability check prevents upload if unsupported

## 🔍 ACP Spec Compliance

### Implemented ✅
- **ContentBlock::Text** - ✅ Fully supported
- **ContentBlock::Image** - ✅ AI output supported, user input pending
- **ContentBlock::ToolUse** - ✅ Supported
- **ContentBlock::ToolResult** - ✅ Supported

### Not Implemented ❌
- **ContentBlock::Audio** - ❌ No support
- **ContentBlock::Resource** - ❌ No support (高优先级 for @-mentions)
- **ContentBlock::ResourceLink** - ❌ No support
- **Annotations** - ❌ Not parsed/displayed

## 📚 Related Documentation

- ACP Content Spec: https://agentclientprotocol.com/content
- Implementation Plan: [IMPROVEMENTS.md](IMPROVEMENTS.md)
- Knowledge Base: [knowledge/content.md](knowledge/content.md)

## 🚀 Next Steps

1. **High Priority**: Implement Resource Content for @-mention files
2. **Medium Priority**: Complete user image upload workflow
3. **Low Priority**: Add Audio content support
4. **Low Priority**: Display annotations (audience, priority)
