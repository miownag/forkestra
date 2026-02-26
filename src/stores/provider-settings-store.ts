import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProviderType,
  ProviderSettings,
  AppSettings,
  ClaudeProviderSettings,
  KimiProviderSettings,
  CodexProviderSettings,
  GeminiProviderSettings,
} from "@/types";
import { createDefaultProviderSettings } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";

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
  ) => T extends "claude" ? ClaudeProviderSettings : T extends "kimi" ? KimiProviderSettings : T extends "gemini" ? GeminiProviderSettings : CodexProviderSettings;

  // Claude-specific helpers
  setClaudeCliPath: (path: string | null) => Promise<void>;
  setClaudeDisableLoginPrompt: (disable: boolean) => Promise<void>;

  // Kimi-specific helpers
  setKimiCliPath: (path: string | null) => Promise<void>;

  // Codex-specific helpers
  setCodexCliPath: (path: string | null) => Promise<void>;

  // Gemini-specific helpers
  setGeminiCliPath: (path: string | null) => Promise<void>;
}

export const useProviderSettingsStore = create<ProviderSettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        settings: {
          claude:
            createDefaultProviderSettings("claude") as ClaudeProviderSettings,
          kimi: createDefaultProviderSettings("kimi") as KimiProviderSettings,
          codex: createDefaultProviderSettings("codex") as CodexProviderSettings,
          gemini: createDefaultProviderSettings("gemini") as GeminiProviderSettings,
        },
        isLoading: false,
        error: null,

        loadSettings: async () => {
          set({ isLoading: true, error: null });
          try {
            const appSettings = await invoke<AppSettings>("get_settings");
            // Merge with defaults so newly added providers are never undefined
            set((state) => ({
              settings: {
                ...state.settings,
                ...appSettings.provider_settings,
              },
              isLoading: false,
            }));
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

        // Codex helpers
        setCodexCliPath: async (path) => {
          const current = get().settings.codex as CodexProviderSettings;
          await get().updateProviderSettings({
            ...current,
            custom_cli_path: path,
          });
        },

        // Gemini helpers
        setGeminiCliPath: async (path) => {
          const current = get().settings.gemini as GeminiProviderSettings;
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
        merge: (persisted, current) => {
          const persistedState = persisted as Partial<ProviderSettingsState>;
          return {
            ...current,
            ...persistedState,
            settings: {
              ...current.settings,
              ...(persistedState.settings ?? {}),
            },
          };
        },
      }
    ),
    { name: "ProviderSettingsStore" }
  )
);

const useSelectorProviderSettingsStore = <T extends (keyof ProviderSettingsState)[]>(
  keys: T,
): Pick<ProviderSettingsState, T[number]> =>
  useProviderSettingsStore(useShallow((state) => pick(state, keys)));

export default useSelectorProviderSettingsStore;
