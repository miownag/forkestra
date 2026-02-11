import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { Theme, FontSize, AccentColor, DefaultWorkMode } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

type ResolvedTheme = "light" | "dark";

interface GeneralSettings {
  defaultProjectPath: string | null;
  defaultWorkMode: DefaultWorkMode;
}

interface AppearanceSettings {
  theme: Theme;
  fontSize: FontSize;
  accentColor: AccentColor;
}

interface SettingsState {
  // Theme
  theme: Theme;
  systemTheme: ResolvedTheme;
  resolvedTheme: ResolvedTheme;

  // Window
  isFullscreen: boolean;
  sidebarCollapsed: boolean;

  // Appearance
  fontSize: FontSize;
  accentColor: AccentColor;

  // Other settings
  defaultProvider: string | null;
  worktreeBasePath: string | null;
  defaultProjectPath: string | null;
  defaultWorkMode: DefaultWorkMode;

  // Initialization
  isInitialized: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setSystemTheme: (theme: ResolvedTheme) => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setFontSize: (fontSize: FontSize) => void;
  setAccentColor: (accentColor: AccentColor) => void;
  setDefaultProvider: (provider: string | null) => void;
  setWorktreeBasePath: (path: string | null) => void;
  setDefaultProjectPath: (path: string | null) => void;
  setDefaultWorkMode: (mode: DefaultWorkMode) => void;

  // File-based storage actions
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

const resolveTheme = (
  theme: Theme,
  systemTheme: ResolvedTheme,
): ResolvedTheme => (theme === "system" ? systemTheme : theme);

export const useSettingsStore = create<SettingsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      theme: "system",
      systemTheme: "light",
      resolvedTheme: "light",
      isFullscreen: false,
      sidebarCollapsed: false,
      fontSize: "base",
      accentColor: "default",

      defaultProvider: null,
      worktreeBasePath: null,
      defaultProjectPath: null,
      defaultWorkMode: "worktree",

      isInitialized: false,

      setTheme: (theme) => {
        set({
          theme,
          resolvedTheme: resolveTheme(theme, get().systemTheme),
        });
        get().saveSettings();
      },

      setSystemTheme: (systemTheme) =>
        set({
          systemTheme,
          resolvedTheme: resolveTheme(get().theme, systemTheme),
        }),

      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setFontSize: (fontSize) => {
        set({ fontSize });
        get().saveSettings();
      },

      setAccentColor: (accentColor) => {
        set({ accentColor });
        get().saveSettings();
      },

      setDefaultProvider: (provider) => set({ defaultProvider: provider }),

      setWorktreeBasePath: (path) => set({ worktreeBasePath: path }),

      setDefaultProjectPath: (path) => {
        set({ defaultProjectPath: path });
        get().saveSettings();
      },

      setDefaultWorkMode: (mode) => {
        set({ defaultWorkMode: mode });
        get().saveSettings();
      },

      loadSettings: async () => {
        try {
          const settings = await invoke<{
            general?: GeneralSettings;
            appearance?: AppearanceSettings;
          }>("get_ui_settings");

          const updates: Partial<SettingsState> = { isInitialized: true };

          if (settings.general) {
            updates.defaultProjectPath = settings.general.defaultProjectPath;
            updates.defaultWorkMode = settings.general.defaultWorkMode;
          }

          if (settings.appearance) {
            updates.theme = settings.appearance.theme;
            updates.fontSize = settings.appearance.fontSize;
            updates.accentColor = settings.appearance.accentColor;
            updates.resolvedTheme = resolveTheme(
              settings.appearance.theme,
              get().systemTheme,
            );
          }

          set(updates);
        } catch (err) {
          console.error("Failed to load settings from file:", err);
          set({ isInitialized: true });
        }
      },

      saveSettings: async () => {
        const state = get();
        try {
          await invoke("update_ui_settings", {
            uiSettings: {
              general: {
                defaultProjectPath: state.defaultProjectPath,
                defaultWorkMode: state.defaultWorkMode,
              },
              appearance: {
                theme: state.theme,
                fontSize: state.fontSize,
                accentColor: state.accentColor,
              },
            },
          });
        } catch (err) {
          console.error("Failed to save settings to file:", err);
        }
      },
    })),
    { name: "SettingsStore" },
  ),
);

// Initialize system theme detection
const initSystemTheme = async () => {
  try {
    const theme = await getCurrentWindow().theme();
    useSettingsStore
      .getState()
      .setSystemTheme(theme === "dark" ? "dark" : "light");
  } catch {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    useSettingsStore.getState().setSystemTheme(isDark ? "dark" : "light");
  }
};

// Listen to system theme changes
const setupSystemThemeListener = () => {
  getCurrentWindow()
    .onThemeChanged(({ payload }) => {
      useSettingsStore
        .getState()
        .setSystemTheme(payload === "dark" ? "dark" : "light");
    })
    .catch(() => {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
          useSettingsStore
            .getState()
            .setSystemTheme(e.matches ? "dark" : "light");
        });
    });
};

// Initialize fullscreen state detection
const initFullscreenState = async () => {
  try {
    const isFullscreen = await getCurrentWindow().isFullscreen();
    useSettingsStore.getState().setIsFullscreen(isFullscreen);
  } catch {
    // Ignore errors
  }
};

// Listen to fullscreen state changes
const setupFullscreenListener = () => {
  getCurrentWindow()
    .onResized(() => {
      getCurrentWindow()
        .isFullscreen()
        .then((isFullscreen) => {
          useSettingsStore.getState().setIsFullscreen(isFullscreen);
        });
    })
    .catch(() => {
      // Ignore errors
    });
};

// Auto-initialize
initSystemTheme();
setupSystemThemeListener();
initFullscreenState();
setupFullscreenListener();

const useSelectorSettingsStore = <T extends (keyof SettingsState)[]>(
  keys: T,
): Pick<SettingsState, T[number]> =>
  useSettingsStore(useShallow((state) => pick(state, keys)));

export default useSelectorSettingsStore;
