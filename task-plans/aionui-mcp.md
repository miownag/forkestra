AionUi 中的 MCP（Model Context Protocol）管理采用分层架构：核心服务协调多 Agent 实现，配置持久化到本地存储，UI 提供可视化管理，并支持与各 CLI Agent 的同步与认证。下面从架构、存储、Agent 实现、UI 交互和同步流程五个方面说明。

## 一、整体架构

- **McpService** 作为中枢，维护各后端（Claude、Qwen、Gemini、Codex、iFlow、AionUi 内置）的 Agent 实例，提供统一协议接口 `IMcpProtocol`（包含检测、安装、删除、测试连接、支持传输类型等） [1](#0-0) [2](#0-1) 。
- 根据配置动态选择 Agent：Fork Gemini 使用 AionuiMcpAgent，原生 Gemini CLI 使用 GeminiMcpAgent，其他后端对应各自 Agent [3](#0-2) 。

## 二、配置存储

- MCP 服务器列表存储在 `mcp.config` 键下，类型为 `IMcpServer[]`，包含 id、name、enabled、transport（stdio/http/sse）、env、时间戳等 [4](#0-3) 。
- 启动时若配置为空，会写入默认服务器（如 chrome-devtools） [5](#0-4) [6](#0-5) 。

## 三、Agent 实现（以 Claude 为例）

- **检测**：调用 `claude mcp list` 解析输出，构造 `IMcpServer` 对象 [7](#0-6) 。
- **安装**：对 stdio 类型执行 `claude mcp add -s user <name> <command> -- [args...] [env_options]` [8](#0-7) 。
- **删除**：调用 `claude mcp remove <name>` [9](#0-8) 。
- **测试连接**：通过 MCP SDK 创建 Client（Stdio/SSE/HTTP）并 listTools [10](#0-9) 。
- 其他 Agent（Qwen、Codex、iFlow）实现类似，支持传输类型不同（如 iFlow 支持 http/sse） [11](#0-10) [12](#0-11) 。

## 四、UI 交互

- 主管理页面在 `McpManagement/index.tsx`，提供服务器列表、添加/编辑/删除/测试连接/OAuth 登录等入口 [13](#0-12) 。
- 添加/编辑后自动测试连接；对 http/sse 服务器检查 OAuth 状态；启用状态下自动同步到 Agents [14](#0-13) 。
- 设置弹窗中的工具页复用该管理组件 [15](#0-14) 。

## 五、同步到 Agents 与认证

- `useMcpOperations` 封装同步/移除逻辑：获取可用 Agents，调用 `mcpService.syncMcpToAgents` 或 `removeMcpFromAgents`，并处理结果提示 [16](#0-15) [17](#0-16) 。
- OAuth 流程：对 http/sse 服务器检测 `needsAuth`，触发登录，成功后重新测试连接 [18](#0-17) 。

## 六、运行时加载

- GeminiAgentManager 在运行时读取已启用且已连接的 MCP 服务器，转换为 aioncli-core 期望格式（仅 stdio） [19](#0-18) 。

## Notes

- MCP 配置统一存储在 `mcp.config`，默认提供 chrome-devtools 示例但默认禁用。
- 不同 Agent 支持的传输类型不同：Claude/Qwen/Codex 仅 stdio；iFlow 支持 stdio/http/sse；AionUi 内置支持多种。
- UI 操作会触发对多个 CLI Agent 的批量同步/移除，并给出聚合结果提示。
- OAuth 认证仅用于 http/sse 服务器，stdio 服务器不需要。

Wiki pages you might want to explore:

- [Storage System (iOfficeAI/AionUi)](/wiki/iOfficeAI/AionUi#3.4)

### Citations

**File:** src/process/services/mcpServices/McpService.ts (L27-69)

```typescript
export class McpService {
  private agents: Map<McpSource, IMcpProtocol>;
  private isCliAvailable(cliCommand: string): boolean {
    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    // Keep original behavior: prefer where/which, then fallback on Windows to Get-Command.
    // 保持原逻辑：优先使用 where/which，Windows 下失败再回退到 Get-Command。
    try {
      execSync(`${whichCommand} ${cliCommand}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 1000 });
      return true;
    } catch {
      if (!isWindows) return false;
    }

    if (isWindows) {
      try {
        // PowerShell fallback for shim scripts like *.ps1 (vfox)
        // PowerShell 回退，支持 *.ps1 shim（例如 vfox）
        execSync(`powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliCommand} | Select-Object -First 1 | Out-Null"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 1000,
        });
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  constructor() {
    this.agents = new Map([
      ['claude', new ClaudeMcpAgent()],
      ['codebuddy', new CodebuddyMcpAgent()],
      ['qwen', new QwenMcpAgent()],
      ['iflow', new IflowMcpAgent()],
      ['gemini', new GeminiMcpAgent()],
      ['aionui', new AionuiMcpAgent()], // AionUi 本地 @office-ai/aioncli-core
      ['codex', new CodexMcpAgent()],
    ]);
```

**File:** src/process/services/mcpServices/McpService.ts (L88-95)

```typescript
  private getAgentForConfig(agent: { backend: AcpBackend; cliPath?: string }): IMcpProtocol | undefined {
    // Fork Gemini 使用 AionuiMcpAgent 管理 MCP 配置
    // Fork Gemini uses AionuiMcpAgent to manage MCP config
    if (agent.backend === 'gemini' && !agent.cliPath) {
      return this.agents.get('aionui');
    }
    return this.agents.get(agent.backend);
  }
```

**File:** src/process/services/mcpServices/McpProtocol.ts (L13-16)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
```

**File:** src/process/services/mcpServices/McpProtocol.ts (L66-106)

```typescript
 */
export interface IMcpProtocol {
  /**
   * 检测MCP配置
   * @param cliPath 可选的CLI路径
   * @returns MCP服务器列表
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  /**
   * 安装MCP服务器到agent
   * @param mcpServers 要安装的MCP服务器列表
   * @returns 操作结果
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  /**
   * 从agent删除MCP服务器
   * @param mcpServerName 要删除的MCP服务器名称
   * @returns 操作结果
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  /**
   * 测试MCP服务器连接
   * @param server MCP服务器配置
   * @returns 连接测试结果
   */
  testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult>;

  /**
   * 获取支持的传输类型
   * @returns 支持的传输类型列表
   */
  getSupportedTransports(): string[];

  /**
   * 获取agent后端类型
   * @returns agent后端类型
   */
  getBackendType(): McpSource;
```

**File:** src/process/initStorage.ts (L553-578)

```typescript
const getDefaultMcpServers = (): IMcpServer[] => {
  const now = Date.now();
  const defaultConfig = {
    mcpServers: {
      "chrome-devtools": {
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest"],
      },
    },
  };

  return Object.entries(defaultConfig.mcpServers).map(
    ([name, config], index) => ({
      id: `mcp_default_${now}_${index}`,
      name,
      description: `Default MCP server: ${name}`,
      enabled: false, // 默认不启用，让用户手动开启
      transport: {
        type: "stdio" as const,
        command: config.command,
        args: config.args,
      },
      createdAt: now,
      updatedAt: now,
      originalJson: JSON.stringify({ [name]: config }, null, 2),
    })
  );
};
```

**File:** src/process/initStorage.ts (L597-606)

```typescript
  // 4. 初始化 MCP 配置（为所有用户提供默认配置）
  try {
    const existingMcpConfig = await configFile.get('mcp.config').catch((): undefined => undefined);

    // 仅当配置不存在或为空时，写入默认值（适用于新用户和老用户）
    if (!existingMcpConfig || !Array.isArray(existingMcpConfig) || existingMcpConfig.length === 0) {
      const defaultServers = getDefaultMcpServers();
      await configFile.set('mcp.config', defaultServers);
      console.log('[AionUi] Default MCP servers initialized');
    }
```

**File:** src/process/services/mcpServices/agents/ClaudeMcpAgent.ts (L34-44)

```typescript
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // 使用Claude Code CLI命令获取MCP配置
        const { stdout: result } = await execAsync('claude mcp list', {
          timeout: this.timeout,
          ...getExecEnv(),
        });

        // 如果没有配置任何MCP服务器，返回空数组
        if (result.includes('No MCP servers configured') || !result.trim()) {
```

**File:** src/process/services/mcpServices/agents/ClaudeMcpAgent.ts (L134-189)

```typescript
  /**
   * 安装MCP服务器到Claude Code agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // 使用Claude Code CLI添加MCP服务器到user scope（全局配置）
            // AionUi是全局工具，MCP配置应该对所有项目可用
            // 格式: claude mcp add -s user <name> <command> -- [args...] [env_options]
            const envArgs = Object.entries(server.transport.env || {})
              .map(([key, value]) => `-e ${key}=${value}`)
              .join(' ');

            let command = `claude mcp add -s user "${server.name}" "${server.transport.command}"`;

            // 如果有参数或环境变量，使用 -- 分隔符
            if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
              command += ' --';
              if (server.transport.args?.length) {
                // 对每个参数进行适当的引用，防止包含特殊字符的参数被误解析
                const quotedArgs = server.transport.args.map((arg: string) => `"${arg}"`).join(' ');
                command += ` ${quotedArgs}`;
              }
            }

            // 环境变量在 -- 之后添加
            if (envArgs) {
              command += ` ${envArgs}`;
            }

            try {
              await execAsync(command, {
                timeout: 5000,
                ...getExecEnv(),
              });
              console.log(`[ClaudeMcpAgent] Added MCP server: ${server.name}`);
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Claude Code:`, error);
              // 继续处理其他服务器，不要因为一个失败就停止
            }
          } else {
            console.warn(`Skipping ${server.name}: Claude CLI only supports stdio transport type`);
          }
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

```

**File:** src/process/services/mcpServices/agents/QwenMcpAgent.ts (L30-32)

```typescript
  getSupportedTransports(): string[] {
    return ['stdio'];
  }
```

**File:** src/process/services/mcpServices/agents/IflowMcpAgent.ts (L27-29)

```typescript
  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http'];
  }
```

**File:** src/renderer/pages/settings/McpManagement/index.tsx (L15-36)

```typescript
const McpManagement: React.FC<McpManagementProps> = ({ message }) => {
  const { t } = useTranslation();

  // 使用自定义hooks管理各种状态和操作
  const { mcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);

  // OAuth hook
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  // 当需要认证时的回调
  const handleAuthRequired = React.useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, message, handleAuthRequired);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);
```

**File:** src/renderer/pages/settings/McpManagement/index.tsx (L39-52)

```typescript
const handleOAuthLogin = React.useCallback(
  async (server: IMcpServer) => {
    const result = await login(server);

    if (result.success) {
      message.success(
        `${server.name}: ${t("settings.mcpOAuthLoginSuccess") || "Login successful"}`
      );
      // 登录成功后重新测试连接
      void handleTestMcpConnection(server);
    } else {
      message.error(
        `${server.name}: ${result.error || t("settings.mcpOAuthLoginFailed") || "Login failed"}`
      );
    }
  },
  [login, message, t, handleTestMcpConnection]
);
```

**File:** src/renderer/pages/settings/McpManagement/index.tsx (L55-75)

```typescript
const wrappedHandleAddMcpServer = React.useCallback(
  async (serverData: Omit<IMcpServer, "id" | "createdAt" | "updatedAt">) => {
    const addedServer = await handleAddMcpServer(serverData);
    if (addedServer) {
      // 直接使用返回的服务器对象进行测试，避免闭包问题
      void handleTestMcpConnection(addedServer);
      // 对于 HTTP/SSE 服务器，检查 OAuth 状态
      if (
        addedServer.transport.type === "http" ||
        addedServer.transport.type === "sse"
      ) {
        void checkOAuthStatus(addedServer);
      }
      // 修复 #518: 使用实际服务器的 enabled 状态而不是输入数据的状态
      // Fix #518: Use actual server enabled state instead of input data
      // 因为服务器可能在添加过程中被修改，需要使用最终的实际状态
      // The server may be modified during addition, need to use final actual state
      if (addedServer.enabled) {
        void syncMcpToAgents(addedServer, true);
      }
    }
  },
  [
    handleAddMcpServer,
    handleTestMcpConnection,
    checkOAuthStatus,
    syncMcpToAgents,
  ]
);
```

**File:** src/renderer/components/SettingsModal/contents/ToolsModalContent.tsx (L24-40)

```typescript
const ModalMcpManagementSection: React.FC<{ message: MessageInstance; isPageMode?: boolean }> = ({ message, isPageMode }) => {
  const { t } = useTranslation();
  const { mcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, message, handleAuthRequired);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);
```

**File:** src/renderer/hooks/mcp/useMcpOperations.ts (L88-106)

```typescript
// 从agents中删除MCP配置
const removeMcpFromAgents = useCallback(
  async (serverName: string, successMessage?: string) => {
    const agentsResponse = await acpConversation.getAvailableAgents.invoke();
    if (agentsResponse.success && agentsResponse.data) {
      // 显示开始移除的消息（通过队列）
      await globalMessageQueue.add(() => {
        message.info(
          t("settings.mcpRemoveStarted", { count: agentsResponse.data.length })
        );
      });

      const removeResponse = await mcpService.removeMcpFromAgents.invoke({
        mcpServerName: serverName,
        agents: agentsResponse.data,
      });
      await handleMcpOperationResult(
        removeResponse,
        "remove",
        successMessage,
        true
      ); // 跳过重新检测
    }
  },
  [message, t, handleMcpOperationResult]
);
```

**File:** src/renderer/hooks/mcp/useMcpOperations.ts (L108-134)

```typescript
// 向agents同步MCP配置
const syncMcpToAgents = useCallback(
  async (server: IMcpServer, skipRecheck = false) => {
    const agentsResponse = await acpConversation.getAvailableAgents.invoke();
    if (agentsResponse.success && agentsResponse.data) {
      // 显示开始同步的消息（通过队列）
      await globalMessageQueue.add(() => {
        message.info(
          t("settings.mcpSyncStarted", { count: agentsResponse.data.length })
        );
      });

      const syncResponse = await mcpService.syncMcpToAgents.invoke({
        mcpServers: [server],
        agents: agentsResponse.data,
      });

      await handleMcpOperationResult(
        syncResponse,
        "sync",
        undefined,
        skipRecheck
      );
    } else {
      // 修复: 处理没有可用 agents 的情况，显示友好的错误提示
      // Fix: Handle case when no agents are available, show user-friendly error message
      console.error(
        "[useMcpOperations] Failed to get available agents:",
        agentsResponse.msg
      );
      await globalMessageQueue.add(() => {
        message.error(t("settings.mcpSyncFailedNoAgents"));
      });
    }
  },
  [message, t, handleMcpOperationResult]
);
```

**File:** src/process/task/GeminiAgentManager.ts (L200-227)

```typescript
  private async getMcpServers(): Promise<Record<string, UiMcpServerConfig>> {
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      if (!mcpServers || !Array.isArray(mcpServers)) {
        return {};
      }

      // 转换为 aioncli-core 期望的格式
      const mcpConfig: Record<string, UiMcpServerConfig> = {};
      mcpServers
        .filter((server: IMcpServer) => server.enabled && server.status === 'connected') // 只使用启用且连接成功的服务器
        .forEach((server: IMcpServer) => {
          // 只处理 stdio 类型的传输方式，因为 aioncli-core 只支持这种类型
          if (server.transport.type === 'stdio') {
            mcpConfig[server.name] = {
              command: server.transport.command,
              args: server.transport.args || [],
              env: server.transport.env || {},
              description: server.description,
            };
          }
        });

      return mcpConfig;
    } catch (error) {
      return {};
    }
  }
```
