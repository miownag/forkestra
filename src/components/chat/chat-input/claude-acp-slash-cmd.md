外部客户端通过 ACP 协议的会话更新机制获取支持的 slash commands，并通过发送包含命令文本的 prompt 来调用它们。

## 获取支持的 Slash Commands

### 1. 监听命令更新通知

创建会话后，客户端需要监听 `sessionUpdate` 通知中的 `available_commands_update` 类型 [1](#2-0) ：

```typescript
// 客户端实现示例
async sessionUpdate(params: SessionNotification): Promise<void> {
  switch (params.update.sessionUpdate) {
    case "available_commands_update":
      // 保存可用命令列表
      this.availableCommands = params.update.availableCommands;
      break;
  }
}
```

### 2. 命令数据结构

每个命令包含以下信息 [2](#2-1) ：

- `name`: 命令名称（MCP 命令会带 `mcp:` 前缀）
- `description`: 命令描述
- `input`: 参数提示（可选）

## 调用 Slash Commands

### 1. 基本调用方式

直接在 prompt 中发送命令文本 [3](#2-2) ：

```typescript
await connection.prompt({
  prompt: [
    {
      type: "text",
      text: "/quick-math",
    },
  ],
  sessionId: newSessionResponse.sessionId,
});
```

### 2. 带参数的命令

对于需要参数的命令，直接在命令后添加参数 [4](#2-3) ：

```typescript
await connection.prompt({
  prompt: [
    {
      type: "text",
      text: "/say-hello GPT-5",
    },
  ],
  sessionId: newSessionResponse.sessionId,
});
```

### 3. MCP 命令格式

外部 MCP 服务器提供的命令使用 `/mcp:server:command` 格式 [5](#2-4) ：

```typescript
// 系统会自动转换为 Claude SDK 格式
"/mcp:myserver:mycommand arg1 arg2";
```

## 完整客户端实现示例

```typescript
class AcpClient implements Client {
  availableCommands: AvailableCommand[] = [];

  async sessionUpdate(params: SessionNotification): Promise<void> {
    if (params.update.sessionUpdate === "available_commands_update") {
      this.availableCommands = params.update.availableCommands;
      console.log("Available commands:", this.availableCommands);
    }
  }

  async executeCommand(commandName: string, args?: string): Promise<void> {
    const commandText = args ? `${commandName} ${args}` : commandName;
    await this.connection.prompt({
      prompt: [{ type: "text", text: commandText }],
      sessionId: this.sessionId,
    });
  }
}
```

## Notes

- 命令列表在会话创建后异步发送，客户端需要等待 `available_commands_update` 通知 [6](#2-5)
- 某些内置命令（如 `/compact`）可能需要先有对话历史才能正常工作 [7](#2-6)
- MCP 命令的格式转换由系统自动处理，客户端只需使用 `/mcp:server:command` 格式 [5](#2-4)

Wiki pages you might want to explore:

- [Agent Client Protocol (ACP) (zed-industries/claude-code-acp)](/wiki/zed-industries/claude-code-acp#7.1)

### Citations

**File:** src/acp-agent.ts (L1136-1144)

```typescript
setTimeout(() => {
  this.client.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: "available_commands_update",
      availableCommands: getAvailableSlashCommands(
        initializationResult.commands,
      ),
    },
  });
}, 0);
```

**File:** src/acp-agent.ts (L1223-1254)

```typescript
function getAvailableSlashCommands(
  commands: SlashCommand[],
): AvailableCommand[] {
  const UNSUPPORTED_COMMANDS = [
    "cost",
    "keybindings-help",
    "login",
    "logout",
    "output-style:new",
    "release-notes",
    "todos",
  ];

  return commands
    .map((command) => {
      const input = command.argumentHint
        ? {
            hint: Array.isArray(command.argumentHint)
              ? command.argumentHint.join(" ")
              : command.argumentHint,
          }
        : null;
      let name = command.name;
      if (command.name.endsWith(" (MCP)")) {
        name = `mcp:${name.replace(" (MCP)", "")}`;
      }
      return {
        name,
        description: command.description || "",
        input,
      };
    })
    .filter(
      (command: AvailableCommand) =>
        !UNSUPPORTED_COMMANDS.includes(command.name),
    );
}
```

**File:** src/acp-agent.ts (L1281-1286)

```typescript
// change /mcp:server:command args -> /server:command (MCP) args
const mcpMatch = text.match(/^\/mcp:([^:\s]+):(\S+)(\s+.*)?$/);
if (mcpMatch) {
  const [, server, command, args] = mcpMatch;
  text = `/${server}:${command} (MCP)${args || ""}`;
}
```

**File:** src/tests/acp-agent.test.ts (L166-167)

```typescript
const commands = await client.availableCommandsPromise;
```

**File:** src/tests/acp-agent.test.ts (L179-202)

```typescript
    await connection.prompt({
      prompt: [
        {
          type: "text",
          text: "/quick-math",
        },
      ],
      sessionId: newSessionResponse.sessionId,
    });

    expect(client.takeReceivedText()).toContain("30");

    await connection.prompt({
      prompt: [
        {
          type: "text",
          text: "/say-hello GPT-5",
        },
      ],
      sessionId: newSessionResponse.sessionId,
    });

    expect(client.takeReceivedText()).toContain("Hello GPT-5");
  }, 30000);
```

**File:** src/tests/acp-agent.test.ts (L218-224)

```typescript
// Error case (no previous message)
await connection.prompt({
  prompt: [{ type: "text", text: "/compact" }],
  sessionId: newSessionResponse.sessionId,
});

expect(client.takeReceivedText()).toBe("");
```
