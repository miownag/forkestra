import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { Theme } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";

interface SettingsState {
  theme: Theme;
  defaultProvider: string | null;
  worktreeBasePath: string | null;

  setTheme: (theme: Theme) => void;
  setDefaultProvider: (provider: string | null) => void;
  setWorktreeBasePath: (path: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set) => ({
        theme: "system",
        defaultProvider: null,
        worktreeBasePath: null,

        setTheme: (theme) => set({ theme }),
        setDefaultProvider: (provider) => set({ defaultProvider: provider }),
        setWorktreeBasePath: (path) => set({ worktreeBasePath: path }),
      }),
      { name: "forkestra-settings" }
    ),
    { name: "SettingsStore" }
  )
);

const useSelectorSettingsStore = <T extends (keyof (SettingsState))[]>(
  keys: T,
): Pick<SettingsState, T[number]> =>
  useSettingsStore(useShallow((state) => pick(state, keys)));

export default useSelectorSettingsStore;