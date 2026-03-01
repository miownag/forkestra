import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProviderSettings,
  AppSettings,
} from "@/types";
import { createDefaultProviderSettings } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";

const BUILTIN_PROVIDER_IDS = ["claude", "codex", "gemini", "open_code", "kimi", "qoder", "qwen_code"] as const;

interface ProviderSettingsState {
  // State
  settings: Record<string, ProviderSettings>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateProviderSettings: (providerId: string, settings: ProviderSettings) => Promise<void>;
  getProviderSettings: (providerId: string) => ProviderSettings;
  setCliPath: (providerId: string, path: string | null) => Promise<void>;
}

export const useProviderSettingsStore = create<ProviderSettingsState>()(
  devtools(
    persist(
      (set, get) => {
        // Build default settings for all builtin providers
        const defaultSettings: Record<string, ProviderSettings> = {};
        for (const id of BUILTIN_PROVIDER_IDS) {
          defaultSettings[id] = createDefaultProviderSettings();
        }

        return {
          settings: defaultSettings,
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

          updateProviderSettings: async (providerId, settings) => {
            set({ isLoading: true, error: null });
            try {
              await invoke("update_provider_settings", {
                settings: { provider_id: providerId, ...settings },
              });
              set((state) => ({
                settings: {
                  ...state.settings,
                  [providerId]: settings,
                },
                isLoading: false,
              }));
            } catch (error) {
              set({ error: String(error), isLoading: false });
            }
          },

          getProviderSettings: (providerId) => {
            return get().settings[providerId] ?? createDefaultProviderSettings();
          },

          setCliPath: async (providerId, path) => {
            const current = get().getProviderSettings(providerId);
            await get().updateProviderSettings(providerId, {
              ...current,
              custom_cli_path: path,
            });
          },
        };
      },
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
