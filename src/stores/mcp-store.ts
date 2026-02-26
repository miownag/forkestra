import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { McpServerConfig, McpServerSource, McpTransport } from "@/types";

interface McpState {
  servers: McpServerConfig[];
  isLoading: boolean;
  isScanning: boolean;

  fetchServers: () => Promise<void>;
  scanServers: () => Promise<void>;
  addServer: (
    name: string,
    transport: McpTransport,
    scope: "global" | "project",
    projectPath?: string,
  ) => Promise<void>;
  updateServer: (server: McpServerConfig) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
  toggleServer: (serverId: string, enabled: boolean) => Promise<void>;
  toggleGloballyAvailable: (serverId: string, globallyAvailable: boolean) => Promise<void>;
  fetchServersForDirectory: (projectPath: string) => Promise<McpServerConfig[]>;
}

export const useMcpStore = create<McpState>()(
  devtools(
    (set, get) => ({
      servers: [],
      isLoading: false,
      isScanning: false,

      fetchServers: async () => {
        set({ isLoading: true });
        try {
          const servers = await invoke<McpServerConfig[]>("list_mcp_servers");
          set({ servers });
        } catch (err) {
          console.error("Failed to fetch MCP servers:", err);
        } finally {
          set({ isLoading: false });
        }
      },

      scanServers: async () => {
        set({ isScanning: true });
        try {
          const servers = await invoke<McpServerConfig[]>("scan_mcp_servers");
          set({ servers });
        } catch (err) {
          console.error("Failed to scan MCP servers:", err);
        } finally {
          set({ isScanning: false });
        }
      },

      addServer: async (name, transport, scope, projectPath) => {
        try {
          const source: McpServerSource =
            scope === "project" && projectPath
              ? { type: "user_project", project_path: projectPath }
              : { type: "user" };

          const config: McpServerConfig = {
            id: "",
            name,
            transport,
            enabled: true,
            source,
            globally_available: scope === "global",
          };
          const server = await invoke<McpServerConfig>("add_mcp_server", {
            config,
          });
          set({ servers: [...get().servers, server] });
          toast.success(`Added MCP server: ${name}`);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          console.error("Failed to add MCP server:", err);
          toast.error(`Failed to add MCP server: ${errorMessage}`);
          throw err;
        }
      },

      updateServer: async (server) => {
        const prev = get().servers;
        // Optimistic update
        set({
          servers: prev.map((s) => (s.id === server.id ? server : s)),
        });
        try {
          await invoke<McpServerConfig>("update_mcp_server", { config: server });
        } catch (err) {
          console.error("Failed to update MCP server:", err);
          set({ servers: prev });
          throw err;
        }
      },

      deleteServer: async (serverId) => {
        const prev = get().servers;
        // Optimistic update
        set({ servers: prev.filter((s) => s.id !== serverId) });
        try {
          await invoke("delete_mcp_server", { serverId });
        } catch (err) {
          console.error("Failed to delete MCP server:", err);
          set({ servers: prev });
          throw err;
        }
      },

      toggleServer: async (serverId, enabled) => {
        const prev = get().servers;
        // Optimistic update
        set({
          servers: prev.map((s) =>
            s.id === serverId ? { ...s, enabled } : s
          ),
        });
        try {
          await invoke("toggle_mcp_server", { serverId, enabled });
        } catch (err) {
          console.error("Failed to toggle MCP server:", err);
          set({ servers: prev });
        }
      },

      toggleGloballyAvailable: async (serverId, globallyAvailable) => {
        const prev = get().servers;
        // Optimistic update
        set({
          servers: prev.map((s) =>
            s.id === serverId ? { ...s, globally_available: globallyAvailable } : s
          ),
        });
        try {
          await invoke("toggle_mcp_globally_available", { serverId, globallyAvailable });
        } catch (err) {
          console.error("Failed to toggle globally available:", err);
          set({ servers: prev });
        }
      },

      fetchServersForDirectory: async (projectPath) => {
        try {
          return await invoke<McpServerConfig[]>("get_mcp_servers_for_directory", { projectPath });
        } catch (err) {
          console.error("Failed to fetch MCP servers for directory:", err);
          return [];
        }
      },
    }),
    { name: "McpStore" },
  ),
);

export const useSelectorMcpStore = <T extends (keyof McpState)[]>(
  keys: T,
): Pick<McpState, T[number]> =>
  useMcpStore(useShallow((state) => pick(state, keys)));
