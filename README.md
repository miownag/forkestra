# Forkestra

> Forkestra = fork + orchestra

**English** | [中文](./README.zh-CN.md)

Seamlessly create distinct Git worktrees that let coding agents work in parallel, with built-in isolation to prevent any code conflicts.

Leveraging **multithreading and concurrent programming** is the key to supercharge your development efficiency!

## Quick Start

Check the [Documentation](https://forkestra.readthedocs.io/en/latest/) to download and get started.

## Features

### Parallel Agent Sessions via Git Worktrees

Each session runs in its own isolated Git worktree, so multiple AI agents can work on the same repository simultaneously without stepping on each other's code.

### Multiple AI Provider Support

Built-in support for popular AI coding CLI tools:

- [Claude Code](https://github.com/anthropics/claude-code)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Codex CLI](https://github.com/openai/codex)
- [OpenCode](https://github.com/sst/opencode)
- [Kimi Code](https://kimi.moonshot.cn/)
- [Qoder CLI](https://qoder.qwen.ai/)
- [Qwen Code](https://github.com/QwenLM/qwen-code)

All providers communicate via the **ACP (Agent Client Protocol)**, and you can add your own custom providers too.

### Custom Provider Support

Add any ACP-compatible CLI tool as a custom provider. Specify a custom binary path to handle special environments.

### MCP Server Management

Discover, configure, and toggle MCP (Model Context Protocol) servers from a unified UI. Aggregates MCP configs from multiple sources (global, project, user).

### Skills Management

Install and manage skill packages that extend agent capabilities. Supports global, project-level, and user-level skills.

### Integrated Terminal

Each session comes with a built-in PTY terminal — no need to switch to an external terminal.

### Git SCM Integration

View diffs, resolve merge conflicts, switch branches, and run common Git operations directly from the UI.

### File System Browser

Browse project files, view and edit code with syntax highlighting, all without leaving the app.

### Friendly Interface

A clean desktop UI built with React 19 + Tauri 2, so you get native performance without the complexity of a raw terminal.

## Architecture

Forkestra is a [Tauri 2](https://tauri.app/) desktop app:

- **Frontend**: React 19, Vite, TypeScript, TanStack Router, Zustand, Tailwind CSS, shadcn/ui
- **Backend**: Rust, Tauri 2, SQLite (via rusqlite)
- **AI Protocol**: [agent-client-protocol](https://github.com/anthropics/agent-client-protocol) (ACP)

### Data Flow

```
Frontend invoke("send_message")
  → SessionManager
  → GenericAcpAdapter (spawns CLI process)
  → ACP streaming chunks via mpsc channel
  → Tauri app.emit() events
  → Zustand store updates UI
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) (JS/TS tooling)
- [Rust](https://www.rust-lang.org/) toolchain
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Commands

```bash
bun install          # Install frontend dependencies
bun tauri dev        # Run full app in development (frontend + Rust backend)
bun run dev          # Run only the Vite frontend dev server (port 1420)
bun run build        # TypeScript check + Vite production build
cargo build          # Build only the Rust backend (run from src-tauri/)
cargo check          # Type-check the Rust backend (run from src-tauri/)
```

> Always use `bun`/`bunx`, never `npm`/`npx`.

## Contributing

Contributions are welcome! Whether you're fixing a bug, adding a feature, or improving documentation:

1. Fork the repository
2. Clone your fork and create a new branch:
   ```bash
   git clone https://github.com/your-username/forkestra.git
   git checkout -b feature/your-feature-name
   ```
3. Run the project locally:
   ```bash
   bun install
   bun tauri dev
   ```
4. Make your changes and commit with a clear message.
5. Push your branch and open a pull request.

Please ensure your code follows the project's coding standards and includes tests for any new features or bug fixes.

## License

See [LICENSE](./LICENSE) for details.
