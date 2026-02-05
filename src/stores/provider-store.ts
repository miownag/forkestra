import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderInfo } from "@/types";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";

interface ProviderState {
  providers: ProviderInfo[];
  isDetecting: boolean;
  error: string | null;

  detectProviders: () => Promise<void>;
}

export const useProviderStore = create<ProviderState>()(
  devtools(
    (set) => ({
      providers: [],
      isDetecting: false,
      error: null,

      detectProviders: async () => {
        set({ isDetecting: true, error: null });
        try {
          const providers = await invoke<ProviderInfo[]>("detect_providers");
          set({ providers, isDetecting: false });
        } catch (error) {
          set({ error: String(error), isDetecting: false });
        }
      },
    }),
    { name: "ProviderStore" },
  ),
);

const useSelectorProviderStore = <T extends (keyof ProviderState)[]>(
  keys: T,
): Pick<ProviderState, T[number]> =>
  useProviderStore(useShallow((state) => pick(state, keys)));

export default useSelectorProviderStore;
