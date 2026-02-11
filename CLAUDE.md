# Forkestra - An AI Code Client

整体：Tauri

> 前端技术栈 React + Vite + shadcn/ui + TanStack Router + Zustand + Tailwind CSS + react-icons
> 后端技术栈 git2-rs + tokio + serde + claude code acp

**规则**：

1. kebab-case文件名
2. 如果遇到不知道的context，请优先使用Context7 MCP而不是Web Search去搜索，查询Context7时应该查询这两个库，ACP相关可以查询Agent Client Protocol和Claude Code ACP这两个库

### 核心目标

| 目标                 | 描述                                                       |
| -------------------- | ---------------------------------------------------------- |
| **多 Provider 支持** | 统一界面管理 Claude Code、Kimi Code 等（一期先实现这两个） |
| **多 Thread 并行**   | 每个会话独立 Git Worktree，无代码冲突                      |

### AI Provider

通过ACP协议与AI Coding CLI交互

ACP List:
- Claude Code: 通过zed实现的 @zed-industries/claude-code-acp
- Kimi Code: kimi cli 天然支持 ACP
