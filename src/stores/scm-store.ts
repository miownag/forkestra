import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitScmStatus,
  MergeRebaseResult,
  ConflictContent,
} from "@/types";

interface ScmState {
  // Per-session state
  statuses: Record<string, GitScmStatus | null>;
  loading: Record<string, boolean>;
  diffs: Record<string, string>; // key = sessionId:filePath:staged
  operationInProgress: Record<string, "merge" | "rebase" | null>;

  // Actions
  fetchScmStatus: (sessionId: string, repoPath: string) => Promise<void>;
  fetchFileDiff: (
    sessionId: string,
    repoPath: string,
    filePath: string,
    staged: boolean
  ) => Promise<string>;
  stageFile: (sessionId: string, repoPath: string, filePath: string) => Promise<void>;
  unstageFile: (sessionId: string, repoPath: string, filePath: string) => Promise<void>;
  stageAll: (sessionId: string, repoPath: string) => Promise<void>;
  unstageAll: (sessionId: string, repoPath: string) => Promise<void>;
  commit: (sessionId: string, repoPath: string, message: string) => Promise<string>;
  discardFile: (sessionId: string, repoPath: string, filePath: string) => Promise<void>;
  mergeFrom: (
    sessionId: string,
    repoPath: string,
    sourceBranch: string
  ) => Promise<MergeRebaseResult>;
  rebaseOnto: (
    sessionId: string,
    repoPath: string,
    ontoBranch: string
  ) => Promise<MergeRebaseResult>;
  mergeTo: (
    sessionId: string,
    projectPath: string,
    targetBranch: string
  ) => Promise<MergeRebaseResult>;
  abortMerge: (sessionId: string, repoPath: string) => Promise<void>;
  abortRebase: (sessionId: string, repoPath: string) => Promise<void>;
  continueMerge: (sessionId: string, repoPath: string) => Promise<void>;
  continueRebase: (sessionId: string, repoPath: string) => Promise<void>;
  fetchConflictContent: (
    repoPath: string,
    filePath: string
  ) => Promise<ConflictContent>;
  resolveConflict: (
    sessionId: string,
    repoPath: string,
    filePath: string,
    content: string
  ) => Promise<void>;
}

export const useScmStore = create<ScmState>((set, get) => ({
  statuses: {},
  loading: {},
  diffs: {},
  operationInProgress: {},

  fetchScmStatus: async (sessionId, repoPath) => {
    set((state) => ({
      loading: { ...state.loading, [sessionId]: true },
    }));
    try {
      const status = await invoke<GitScmStatus>("git_scm_status", { repoPath });
      set((state) => ({
        statuses: { ...state.statuses, [sessionId]: status },
        loading: { ...state.loading, [sessionId]: false },
      }));
    } catch (err) {
      console.error("Failed to fetch SCM status:", err);
      set((state) => ({
        loading: { ...state.loading, [sessionId]: false },
      }));
    }
  },

  fetchFileDiff: async (sessionId, repoPath, filePath, staged) => {
    const key = `${sessionId}:${filePath}:${staged}`;
    try {
      const diff = await invoke<string>("git_file_diff", {
        repoPath,
        filePath,
        staged,
      });
      set((state) => ({
        diffs: { ...state.diffs, [key]: diff },
      }));
      return diff;
    } catch (err) {
      console.error("Failed to fetch diff:", err);
      return "";
    }
  },

  stageFile: async (sessionId, repoPath, filePath) => {
    await invoke("git_stage_file", { repoPath, filePath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  unstageFile: async (sessionId, repoPath, filePath) => {
    await invoke("git_unstage_file", { repoPath, filePath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  stageAll: async (sessionId, repoPath) => {
    await invoke("git_stage_all", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  unstageAll: async (sessionId, repoPath) => {
    await invoke("git_unstage_all", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  commit: async (sessionId, repoPath, message) => {
    const oid = await invoke<string>("git_commit", { repoPath, message });
    get().fetchScmStatus(sessionId, repoPath);
    return oid;
  },

  discardFile: async (sessionId, repoPath, filePath) => {
    await invoke("git_discard_file", { repoPath, filePath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  mergeFrom: async (sessionId, repoPath, sourceBranch) => {
    set((state) => ({
      operationInProgress: { ...state.operationInProgress, [sessionId]: "merge" },
    }));
    try {
      const result = await invoke<MergeRebaseResult>("git_merge_from", {
        repoPath,
        sourceBranch,
      });
      get().fetchScmStatus(sessionId, repoPath);
      return result;
    } finally {
      set((state) => ({
        operationInProgress: { ...state.operationInProgress, [sessionId]: null },
      }));
    }
  },

  rebaseOnto: async (sessionId, repoPath, ontoBranch) => {
    set((state) => ({
      operationInProgress: { ...state.operationInProgress, [sessionId]: "rebase" },
    }));
    try {
      const result = await invoke<MergeRebaseResult>("git_rebase_onto", {
        repoPath,
        ontoBranch,
      });
      get().fetchScmStatus(sessionId, repoPath);
      return result;
    } finally {
      set((state) => ({
        operationInProgress: { ...state.operationInProgress, [sessionId]: null },
      }));
    }
  },

  mergeTo: async (sessionId, projectPath, targetBranch) => {
    set((state) => ({
      operationInProgress: { ...state.operationInProgress, [sessionId]: "merge" },
    }));
    try {
      const result = await invoke<MergeRebaseResult>("git_merge_to", {
        sessionId,
        projectPath,
        targetBranch,
      });
      return result;
    } finally {
      set((state) => ({
        operationInProgress: { ...state.operationInProgress, [sessionId]: null },
      }));
    }
  },

  abortMerge: async (sessionId, repoPath) => {
    await invoke("git_abort_merge", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  abortRebase: async (sessionId, repoPath) => {
    await invoke("git_abort_rebase", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  continueMerge: async (sessionId, repoPath) => {
    await invoke("git_continue_merge", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  continueRebase: async (sessionId, repoPath) => {
    await invoke("git_continue_rebase", { repoPath });
    get().fetchScmStatus(sessionId, repoPath);
  },

  fetchConflictContent: async (repoPath, filePath) => {
    return invoke<ConflictContent>("git_get_conflict_content", {
      repoPath,
      filePath,
    });
  },

  resolveConflict: async (sessionId, repoPath, filePath, content) => {
    await invoke("git_resolve_conflict", { repoPath, filePath, content });
    get().fetchScmStatus(sessionId, repoPath);
  },
}));
