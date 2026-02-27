> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.qoder.com/llms.txt
> Use this file to discover all available pages before exploring further.

# ACP

# What is ACP

ACP is a protocol between clients and Agents, which can be used for CLI integration with various editors. For more details, see: [Agent Client Protocol](https://agentclientprotocol.com/overview/introduction). Qoder CLI implements this protocol standard, and through this feature, it can be integrated into any client that implements the ACP protocol.

## Features

### Running Modes

Supports two running modes:

- Default mode: \*\*Equivalent to CLI's default startup mode, runs according to default permission settings
- Bypass Permissions mode: \*\*Equivalent to the CLI's `--yolo`mode, skips permission checks, and automatically executes tools, etc.

### Slash Commands

Currently supported commands are listed below. Command functions are the same as their corresponding commands in CLI:

- `/init`: Performs project understanding and generates `AGENTS.md` memory file
- `/review`: Executes code review on locally uncommitted code and provides code modification suggestions

### Other Features

| **Feature**                 | **Support** | **Description**                                                       |
| :-------------------------- | :---------- | :-------------------------------------------------------------------- |
| Built-in Tools              | ✅          | Provides the same built-in tools as CLI                               |
| Subagent                    | ✅          | Provides the same Subagent capability as CLI                          |
| MCP Server                  | ✅          | Provides the same Stdio, SSE, Streamable HTTP type MCP support as CLI |
| Permission Configuration    | ✅          | Provides the same permission configuration capability as CLI          |
| Context Compression         | ✅          | Provides the same context compression mechanism as CLI                |
| Multimodal                  | ✅          | Supports images                                                       |
| File Operations or Terminal | ✅          | Uses capabilities provided by the IDE side through the ACP protocol   |

## Getting Started

Before starting, please ensure that Qoder CLI is installed. For installation instructions, refer to the Qoder CLI Quick Start. Currently supported operating systems and CPU architectures are as follows:

- \*\*Supported operating systems: \*\*macOS, Linux, Windows
- \*\*Supported CPU architectures: \*\*arm64, amd64 (Windows arm64 architecture is temporarily not supported)

### Starting ACP Server

If you have ACP client development scenarios and expect to implement Agent Server through Qoder CLI, you can start the CLI directly through commands. Simply pass the `--acp` parameter when starting Qoder CLI, and the CLI will start as an ACP server. ACP clients can communicate with this server using standard input/output.

```
qodercli --acp
```

### Starting in Zed IDE

Integrating Qoder CLI with Zed IDE only requires adding the following extension configuration to the Zed configuration file to add Qoder CLI support in Zed IDE. After configuration is complete, you can select Qoder CLI when creating a Thread.

- macOS / Linux platform configuration

```
{
   ...
   "agent_servers": {
      "Qoder CLI": {
          "type": "custom",
          "command": "qodercli",
          "args": ["--acp"]
      }
   }
}
```

- Windows platform configuration

```
{
   ...
   "agent_servers": {
      "Qoder CLI": {
          "type": "custom",
          "command": "~\\AppData\\Roaming\\npm\\qodercli.cmd",
          "args": ["--acp"]
      }
   }
}
```

Note: In Zed version 0.215.2 and earlier, the type does not need to be configured.

Zed IDE configuration file paths for different operating systems:

- **macOS:** \~/.config/zed/settings.json
- **Linux**: \~/.config/zed/settings.json
- **Windows**: \~\AppData\Roaming\Zed\settings.json

## Login and Usage

ACP clients use the same login state as Qoder CLI. Currently, you need to log in through Qoder CLI. If you have already logged in and used Qoder CLI, you can use the ACP client normally without logging in again.

### Log in through Qoder CLI

If you have never logged into Qoder CLI, please enter the following command in the terminal to open the login interface:

```
qodercli /login
```

After execution, the following content will be output:

```
> /login
------------------------------------------------------------------------------------------
Login

Choose login method:

→ Login with browser
- Login with qoder personal access token

Press Enter to select · Esc to exit · ↑↓ to navigate
```

Use the up and down arrow keys to switch login options, press Enter to select the desired login method, and follow the operation guide to complete the login process:

- **Log in with browser**: Complete authentication by opening the login page in your default browser
- **Log in with Qoder personal access token**: Complete authentication by entering Qoder Personal Access Token

You can obtain a Personal Access Token on this page: [https://qoder.com/account/integrations](https://qoder.com/account/integrations)

### Log in through Environment Variables

Qoder CLI supports detecting the `QODER_PERSONAL_ACCESS_TOKEN` environment variable to complete authentication at startup. Therefore, ACP clients can configure this environment variable to allow Qoder CLI to automatically log in. Below is an example configuration for adding the Qoder Access Token environment variable in Zed IDE.

```
{
   ...
   "agent_servers": {
      "Qoder CLI": {
          "env": {
              "QODER_PERSONAL_ACCESS_TOKEN": "your_personal_access_token_here"
          },
          "command": "qodercli",
          "args": ["--acp"]
      }
   }
}
```
