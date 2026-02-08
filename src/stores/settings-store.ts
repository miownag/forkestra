import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import type { Theme, FontSize, AccentColor, DefaultWorkMode } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResolvedTheme = "light" | "dark";

interface SettingsState {
  // Theme
  theme: Theme; // User preference: "light" | "dark" | "system"
  systemTheme: ResolvedTheme; // Detected system theme
  resolvedTheme: ResolvedTheme; // Actual applied theme

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
}

const resolveTheme = (
  theme: Theme,
  systemTheme: ResolvedTheme,
): ResolvedTheme => (theme === "system" ? systemTheme : theme);

export const useSettingsStore = create<SettingsState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
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

          setTheme: (theme) =>
            set({
              theme,
              resolvedTheme: resolveTheme(theme, get().systemTheme),
            }),
          setSystemTheme: (systemTheme) =>
            set({
              systemTheme,
              resolvedTheme: resolveTheme(get().theme, systemTheme),
            }),
          setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
          setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
          toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
          setFontSize: (fontSize) => set({ fontSize }),
          setAccentColor: (accentColor) => set({ accentColor }),
          setDefaultProvider: (provider) => set({ defaultProvider: provider }),
          setWorktreeBasePath: (path) => set({ worktreeBasePath: path }),
          setDefaultProjectPath: (path) => set({ defaultProjectPath: path }),
          setDefaultWorkMode: (mode) => set({ defaultWorkMode: mode }),
        }),
        {
          name: "forkestra-settings",
          partialize: (state) => ({
            theme: state.theme,
            fontSize: state.fontSize,
            accentColor: state.accentColor,
            defaultProvider: state.defaultProvider,
            worktreeBasePath: state.worktreeBasePath,
            defaultProjectPath: state.defaultProjectPath,
            defaultWorkMode: state.defaultWorkMode,
          }),
        },
      ),
    ),
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
    // Fallback to media query
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
      // Fallback: listen to media query changes
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
