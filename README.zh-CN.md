# Forkestra

> Forkestra = fork + orchestra（分叉 + 编排）

[English](./README.md) | **中文**

<img width="1920" height="967" alt="image" src="https://github.com/user-attachments/assets/599da56d-ffa5-42db-bda8-da536f862d29" />

无缝创建独立的 Git worktree，让多个 AI 编码 Agent 并行工作，内置隔离机制彻底避免代码冲突。

**多线程并发编程**是提升开发效率的关键——Forkestra 让你把这一优势发挥到极致！

## 快速上手

查看[文档](https://forkestra.readthedocs.io/en/latest/)了解下载和使用方式。

## 功能特性

### 基于 Git Worktree 的并行 Agent 会话

每个会话在独立的 Git worktree 中运行，多个 AI Agent 可以同时在同一个代码仓库中工作，互不干扰，彻底解决代码冲突问题。

### 支持多种 AI Provider

内置支持主流 AI 编程命令行工具：

- [Claude Code](https://github.com/anthropics/claude-code)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Codex CLI](https://github.com/openai/codex)
- [OpenCode](https://github.com/sst/opencode)
- [Kimi Code](https://kimi.moonshot.cn/)
- [Qoder CLI](https://qoder.qwen.ai/)
- [Qwen Code](https://github.com/QwenLM/qwen-code)

所有 Provider 均通过 **ACP（Agent Client Protocol）** 协议通信，同时支持添加自定义 Provider。

### 自定义 Provider 支持

任何兼容 ACP 协议的 CLI 工具都可以作为自定义 Provider 添加。支持指定自定义二进制路径，适配特殊环境需求。

### MCP 服务器管理

在统一界面中发现、配置和启用/禁用 MCP（模型上下文协议）服务器。支持聚合来自多个来源（全局、项目、用户级别）的 MCP 配置。

### Skills 技能包管理

安装和管理扩展 Agent 能力的技能包。支持全局、项目级和用户级技能。

### 内置终端

每个会话都有内置的 PTY 终端，无需切换到外部终端窗口。

### Git SCM 集成

直接在应用内查看 diff、解决合并冲突、切换分支以及执行常用 Git 操作。

### 文件系统浏览器

浏览项目文件、查看和编辑代码（带语法高亮），全程无需离开应用。

### 简洁友好的界面

基于 React 19 + Tauri 2 构建的原生桌面 UI，告别复杂的终端操作，获得流畅的原生性能体验。

## 架构

Forkestra 是一个 [Tauri 2](https://tauri.app/) 桌面应用：

- **前端**：React 19、Vite、TypeScript、TanStack Router、Zustand、Tailwind CSS、shadcn/ui
- **后端**：Rust、Tauri 2、SQLite（通过 rusqlite）
- **AI 协议**：[agent-client-protocol](https://github.com/anthropics/agent-client-protocol)（ACP）

### 数据流

```
前端 invoke("send_message")
  → SessionManager
  → GenericAcpAdapter（启动 CLI 进程）
  → ACP 流式响应块通过 mpsc channel 传递
  → Tauri app.emit() 事件推送
  → Zustand store 响应式更新 UI
```

## 开发指南

### 前置要求

- [Bun](https://bun.sh/)（JS/TS 工具链）
- [Rust](https://www.rust-lang.org/) 工具链
- [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 命令

```bash
bun install          # 安装前端依赖
bun tauri dev        # 开发模式运行完整应用（前端 + Rust 后端）
bun run dev          # 仅运行 Vite 前端开发服务器（端口 1420）
bun run build        # TypeScript 检查 + Vite 生产构建
cargo build          # 仅构建 Rust 后端（在 src-tauri/ 目录下运行）
cargo check          # 对 Rust 后端进行类型检查（在 src-tauri/ 目录下运行）
```

> 始终使用 `bun`/`bunx`，不要使用 `npm`/`npx`。

## 参与贡献

欢迎社区贡献！无论是修复 Bug、添加新功能还是完善文档，都非常欢迎：

1. Fork 本仓库
2. 克隆你的 Fork 并创建新分支：
   ```bash
   git clone https://github.com/your-username/forkestra.git
   git checkout -b feature/your-feature-name
   ```
3. 在本地运行项目：
   ```bash
   bun install
   bun tauri dev
   ```
4. 完成修改并提交清晰的 commit 信息。
5. 推送分支并发起 Pull Request。

请确保代码符合项目编码规范，并为新功能或 Bug 修复添加相应的测试。

## 许可证

详见 [LICENSE](./LICENSE)。
