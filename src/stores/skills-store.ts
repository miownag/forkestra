import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { pick } from "es-toolkit";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { SkillConfig, SkillInstallOptions, CliResult } from "@/types";

interface SkillsState {
  skills: SkillConfig[];
  isLoading: boolean;
  isScanning: boolean;
  isUpdating: boolean;

  fetchSkills: () => Promise<void>;
  scanSkills: () => Promise<void>;
  toggleSkill: (skillId: string, enabled: boolean) => Promise<void>;
  installSkill: (options: SkillInstallOptions) => Promise<CliResult>;
  createSkill: (
    name: string,
    description: string,
    content: string,
    global: boolean
  ) => Promise<void>;
  removeSkill: (name: string, global: boolean, agent?: string) => Promise<CliResult>;
  updateSkills: () => Promise<CliResult>;
}

export const useSkillsStore = create<SkillsState>()(
  devtools(
    (set, get) => ({
      skills: [],
      isLoading: false,
      isScanning: false,
      isUpdating: false,

      fetchSkills: async () => {
        set({ isLoading: true });
        try {
          const skills = await invoke<SkillConfig[]>("list_skills");
          set({ skills });
        } catch (err) {
          console.error("Failed to fetch skills:", err);
        } finally {
          set({ isLoading: false });
        }
      },

      scanSkills: async () => {
        set({ isScanning: true });
        try {
          const skills = await invoke<SkillConfig[]>("scan_skills");
          set({ skills });
        } catch (err) {
          console.error("Failed to scan skills:", err);
        } finally {
          set({ isScanning: false });
        }
      },

      toggleSkill: async (skillId, enabled) => {
        const prev = get().skills;
        // Optimistic update
        set({
          skills: prev.map((s) =>
            s.id === skillId ? { ...s, enabled } : s
          ),
        });
        try {
          await invoke("toggle_skill", { skillId, enabled });
        } catch (err) {
          console.error("Failed to toggle skill:", err);
          set({ skills: prev });
        }
      },

      installSkill: async (options) => {
        try {
          const result = await invoke<CliResult>("install_skill", { options });
          if (result.exit_code === 0) {
            toast.success("Skill installed successfully");
            get().scanSkills();
          } else {
            toast.error(`Failed to install skill: ${result.stderr}`);
          }
          return result;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to install skill:", err);
          toast.error(`Failed to install skill: ${errorMessage}`);
          throw err;
        }
      },

      createSkill: async (name, description, content, global) => {
        try {
          const result = await invoke<CliResult>("create_skill", { name, description, content, global });
          if (result.exit_code === 0) {
            toast.success(`Created skill: ${name}`);
            get().scanSkills();
          } else {
            toast.error(`Failed to create skill: ${result.stderr}`);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to create skill:", err);
          toast.error(`Failed to create skill: ${errorMessage}`);
          throw err;
        }
      },

      removeSkill: async (name, global, agent) => {
        try {
          const result = await invoke<CliResult>("remove_skill", {
            name,
            global,
            agent: agent ?? null,
          });
          if (result.exit_code === 0) {
            toast.success(`Removed skill: ${name}`);
            get().scanSkills();
          } else {
            toast.error(`Failed to remove skill: ${result.stderr}`);
          }
          return result;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to remove skill:", err);
          toast.error(`Failed to remove skill: ${errorMessage}`);
          throw err;
        }
      },

      updateSkills: async () => {
        set({ isUpdating: true });
        try {
          const result = await invoke<CliResult>("update_skills");
          if (result.exit_code === 0) {
            toast.success("Skills updated successfully");
            get().scanSkills();
          } else {
            toast.error(`Failed to update skills: ${result.stderr}`);
          }
          return result;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Failed to update skills:", err);
          toast.error(`Failed to update skills: ${errorMessage}`);
          throw err;
        } finally {
          set({ isUpdating: false });
        }
      },
    }),
    { name: "SkillsStore" },
  ),
);

export const useSelectorSkillsStore = <T extends (keyof SkillsState)[]>(
  keys: T,
): Pick<SkillsState, T[number]> =>
  useSkillsStore(useShallow((state) => pick(state, keys)));
