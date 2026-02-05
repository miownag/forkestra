import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProviderType,
  ProviderSettings,
  AppSettings,
  ClaudeProviderSettings,
  KimiProviderSettings,
} from "@/types";
import { createDefaultProviderSettings } from "@/types";

interface ProviderSettingsState {
  // State
  settings: Record<ProviderType, ProviderSettings>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateProviderSettings: (settings: ProviderSettings) => Promise<void>;
  getProviderSettings: <T extends ProviderType>(
    providerType: T
  ) => T extends "claude" ? ClaudeProviderSettings : KimiProviderSettings;

  // Claude-specific helpers
  setClaudeCliPath: (path: string | null) => Promise<void>;
  setClaudeDisableLoginPrompt: (disable: boolean) => Promise<void>;

  // Kimi-specific helpers
  setKimiCliPath: (path: string | null) => Promise<void>;
}

export const useProviderSettingsStore = create<ProviderSettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        settings: {
          claude:
            createDefaultProviderSettings("claude") as ClaudeProviderSettings,
          kimi: createDefaultProviderSettings("kimi") as KimiProviderSettings,
        },
        isLoading: false,
        error: null,

        loadSettings: async () => {
          set({ isLoading: true, error: null });
          try {
            const appSettings = await invoke<AppSettings>("get_settings");
            set({
              settings: appSettings.provider_settings,
              isLoading: false,
            });
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        updateProviderSettings: async (settings) => {
          set({ isLoading: true, error: null });
          try {
            await invoke("update_provider_settings", { settings });
            set((state) => ({
              settings: {
                ...state.settings,
                [settings.provider_type]: settings,
              },
              isLoading: false,
            }));
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        getProviderSettings: (providerType) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return get().settings[providerType] as any;
        },

        // Claude helpers
        setClaudeCliPath: async (path) => {
          const current = get().settings.claude as ClaudeProviderSettings;
          await get().updateProviderSettings({
            ...current,
            custom_cli_path: path,
          });
        },

        setClaudeDisableLoginPrompt: async (disable) => {
          const current = get().settings.claude as ClaudeProviderSettings;
          await get().updateProviderSettings({
            ...current,
            disable_login_prompt: disable,
          });
        },

        // Kimi helpers
        setKimiCliPath: async (path) => {
          const current = get().settings.kimi as KimiProviderSettings;
          await get().updateProviderSettings({
            ...current,
            custom_cli_path: path,
          });
        },
      }),
      {
        name: "forkestra-provider-settings",
        partialize: (state) => ({
          settings: state.settings,
        }),
      }
    ),
    { name: "ProviderSettingsStore" }
  )
);
