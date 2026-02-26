# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Forkestra

Forkestra (fork + orchestra) is a Tauri 2 desktop app that provides a unified UI for multiple AI coding CLI providers (Claude Code, Kimi Code, Codex, Gemini). Each session gets its own Git worktree so agents can work in parallel without conflicts.

## Commands

```bash
bun install              # Install frontend dependencies
bun tauri dev            # Run the full app in development (frontend + Rust backend)
bun run dev              # Run only the Vite frontend dev server (port 1420)
bun run build            # TypeScript check + Vite production build
cargo build              # Build only the Rust backend (run from src-tauri/)
cargo check              # Type-check the Rust backend (run from src-tauri/)
```

Always use `bun`/`bunx`, never `npm`/`npx`.

## Rules

1. **kebab-case** for all file names
2. Use **DeepWiki MCP** (not Web Search) when you need to look up unfamiliar context about dependencies
3. Use `bun`/`bunx` for all JS/TS tooling

## Architecture

### Frontend (`src/`)

React 19 + Vite + TypeScript. Key patterns:

- **Routing**: TanStack Router with file-based routes in `src/routes/`. Root layout in `__root.tsx`, pages at `index.tsx`, `settings.tsx`, `mcps.tsx`, `skills.tsx`.
- **State**: Zustand stores in `src/stores/`. Each store exports both `useXxxStore` (raw hook) and `useSelectorXxxStore` (selector-based hook using `useShallow` + `pick` for performance). All stores are re-exported from `src/stores/index.ts`.
- **Components**: Organized by domain under `src/components/` (chat, session, mcp, scm, settings, terminal, layout, etc.). UI primitives from shadcn/ui live in `src/components/ui/`.
- **Tauri IPC**: Frontend calls Rust backend via `invoke()` from `@tauri-apps/api/core`. Backend pushes events (streaming, status changes) via Tauri's event system; frontend listens with `listen()`.
- **Path alias**: `@/*` maps to `./src/*`.

### Backend (`src-tauri/src/`)

Rust + Tauri 2. Layered architecture:

- **Commands** (`commands/`): Tauri command handlers, thin wrappers that extract manager state and delegate. Split into modules by domain (session, settings, provider, fs, mcp, skills, terminal). All re-exported from `commands/mod.rs` and registered in `lib.rs`.
- **Managers** (`managers/`): Business logic layer. `SessionManager` orchestrates ACP sessions and worktrees. `McpManager` aggregates MCP server configs from multiple sources. `SettingsManager` persists YAML config. `TerminalManager` manages PTY instances. `WorktreeManager` handles git worktree lifecycle. `SkillsManager` manages skill packages.
- **Providers** (`providers/`): Trait-based adapter pattern. `ProviderAdapter` trait in `adapter.rs` defines the interface. Implementations for Claude (`claude.rs`), Kimi (`kimi.rs`), Codex (`codex.rs`), Gemini (`gemini.rs`). All communicate with CLI tools via the `agent-client-protocol` crate. `detector.rs` auto-detects installed providers.
- **Models** (`models/`): Shared data types (session, message, provider, mcp, settings, skill, fs).
- **Database** (`db/`): SQLite via rusqlite. Schema in `schema.sql` with two tables: `sessions` and `messages`. Migrations run on startup.
- **Errors** (`error.rs`): `AppError` enum with `thiserror`. `AppResult<T>` used throughout.

### Manager initialization order (in `lib.rs`)

`SettingsManager` → `Database` → `McpManager` → `SkillsManager` → `SessionManager` → `TerminalManager`. All managed via `Arc` and Tauri's state system (`app.manage()`).

### Data flow for AI chat

1. Frontend `invoke("send_message")` → `SessionManager`
2. SessionManager creates/reuses a `ProviderAdapter` instance with a dedicated worktree
3. Adapter spawns ACP process, sends prompt via `agent-client-protocol`
4. Streaming responses arrive as `StreamChunk` events via `mpsc` channel
5. SessionManager forwards chunks to frontend via `app.emit()` Tauri events
6. Frontend Zustand store processes chunks and updates UI reactively

### AI Provider integration

All providers use the **ACP (Agent Client Protocol)** SDK (`agent-client-protocol` crate). The `ProviderAdapter` trait abstracts session lifecycle: `start_session`, `resume_session`, `send_message`, `set_model`, `set_mode`, `cancel`, `terminate`.

### Settings persistence

- Backend settings: YAML files managed by `SettingsManager` (provider paths, MCP configs)
- UI settings: Zustand `persist` middleware with localStorage (theme, font size, sidebar state, accent color)
