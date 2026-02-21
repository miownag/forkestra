# Instruction: 集成 Vercel Skills CLI 到 Tauri 桌面端 Agent

> **目标读者**：AI 编程助手（Claude Code, Cursor, Windsurf 等）
> **项目代号**：Forkestra (Tauri Desktop App)
> **核心任务**：复用 `vercel-labs/skills` CLI 能力，为基于 ACP 协议的桌面端 Agent 构建 Skill 管理与注入系统

---

## 1. 项目背景与架构概览

### 1.1 我们在做什么？

我们正在开发一个名为 **Forkestra** 的 Tauri 桌面端应用。它通过 **ACP (Agent Communication Protocol)** 协议与 Claude Code、Codex 等 AI 编程 Agent 交互。

### 1.2 核心痛点

ACP 协议本身没有定义 "Skills" 标准。为了让用户能在 Forkestra 中使用 Vercel 的 Agent Skills 生态，我们需要：

1.  **复用** `skills` CLI 来安装/管理 Skills。
2.  **桥接** CLI 的文件系统输出到我们的 ACP 协议上下文。

### 1.3 技术栈

- **前端**：React + TypeScript
- **后端**：Tauri (Rust)
- **核心工具**：`npx skills` (Vercel CLI)
- **协议**：ACP (Agent Communication Protocol)

---

## 2. 核心功能需求 (MVP)

我们需要实现以下三个核心模块：

### 模块 A: Tauri Skills CLI 封装层 (Rust)

在 Tauri 的 Rust 后端封装对 `skills` CLI 的调用。

**要求**：

- 能够在 Tauri 命令中执行 `npx skills add/list/remove/update`。
- 捕获 CLI 的 stdout/stderr 并返回给前端。
- 支持工作目录切换（项目级 vs 全局）。

### 模块 B: Skill 解析与索引引擎 (TypeScript)

在前端/预加载脚本中实现对已安装 Skills 的读取。

**要求**：

- 扫描标准路径（如 `~/.claude/skills/`, `./.agents/skills/`）。
- 使用 `gray-matter` 解析 `SKILL.md` 的 YAML Frontmatter。
- 构建内存索引：`{ name, description, path, content }`。

### 模块 C: ACP 上下文注入器 (TypeScript)

将选中的 Skill 动态注入到 ACP 协议的 Prompt 流中。

**要求**：

- 提供一个 `injectSkill(skillName, acpPayload)` 函数。
- 将 Skill 内容以 System Prompt 或 Context Block 的形式插入。
- 不破坏原有 ACP 协议结构。

---

## 3. 具体实现指南

### 3.1 目录结构建议

```text
src-tauri/
  src/
    commands/
      skills.rs    # 模块 A: Tauri 命令定义
  Cargo.toml

src/
  services/
    skills-cli.ts  # 模块 B: 调用 Tauri 命令的封装
    skill-parser.ts # 模块 B: 解析 SKILL.md
  hooks/
    useSkills.ts   # React Hook
  types/
    skill.ts       # 类型定义
```

### 3.2 代码实现规范

#### 3.2.1 Rust 命令示例 (`src-tauri/src/commands/skills.rs`)

```rust
// 目标：封装 `npx skills list` 命令
// 注意：使用 tauri::Command 并正确处理 PATH 和 工作目录

#[tauri::command]
pub async fn list_skills(global: bool) -> Result<String, String> {
    // 实现代码...
    // 1. 确定工作目录
    // 2. 执行 `npx skills list` (或 `ls -g`)
    // 3. 返回 JSON 或 字符串结果
}
```

#### 3.2.2 TypeScript 解析器示例 (`src/services/skill-parser.ts`)

```typescript
import matter from "gray-matter";
import * as fs from "fs"; // 注意：在 Tauri 中使用 @tauri-apps/plugin-fs

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  agentType: "claude" | "cursor" | "universal";
}

export async function parseSkillFile(filePath: string): Promise<Skill> {
  // 实现代码...
  // 1. 读取文件内容
  // 2. 使用 gray-matter 分离 frontmatter 和 content
  // 3. 返回结构化对象
}
```

#### 3.2.3 ACP 注入逻辑

```typescript
// 假设这是发出 ACP 请求前的中间件
export function applySkillToAcpRequest(
  skill: Skill,
  request: AcpRequest
): AcpRequest {
  return {
    ...request,
    context: [
      ...(request.context || []),
      {
        type: "instruction",
        content: `[SKILL ACTIVATED] ${skill.name}\n${skill.content}`,
      },
    ],
  };
}
```

---

## 4. 关键约束与注意事项

1.  **不要重造 CLI**：我们的目标是 **Wrapper**，不是 Fork。所有安装逻辑全权交给 `npx skills`。
2.  **路径处理**：Tauri 应用在不同 OS (Windows/macOS/Linux) 下的路径分隔符不同，必须使用 `path` 库处理。
3.  **Async/Await 优先**：文件 I/O 和 CLI 调用都是异步操作，前端必须做好 Loading 状态管理。
4.  **错误边界**：CLI 可能会失败（如网络问题、权限不足），Rust 和 TS 层都必须有完善的 `Result`/`try-catch` 处理。

---

## 5. 下一步行动 (当你看到这个 Instruction 时)

如果你是来帮忙写代码的，请按以下顺序进行：

1.  **确认环境**：检查项目中是否已安装 `gray-matter` 和配置好 Tauri commands。
2.  **选择模块**：从 **模块 A (Rust Wrapper)** 开始实现，因为它是基础。
3.  **编写代码**：参考上述规范生成具体的 `.rs` 和 `.ts` 文件。
4.  **保持沟通**：如果对 ACP 协议细节或 Skill 注入时机有疑问，请先询问。
