import { create } from "zustand";
import type { FileEntry } from "@/types";

interface ChatInputStore {
  // Map of sessionId -> function to add file to chat input
  addFileToInputFns: Map<string, (entry: FileEntry) => void>;

  // Register the function for a specific session
  registerAddFileToInput: (sessionId: string, fn: (entry: FileEntry) => void) => void;

  // Unregister the function for a specific session
  unregisterAddFileToInput: (sessionId: string) => void;

  // Call the function to add a file to the chat input
  addFileToInput: (sessionId: string, entry: FileEntry) => void;
}

export const useChatInputStore = create<ChatInputStore>((set, get) => ({
  addFileToInputFns: new Map(),

  registerAddFileToInput: (sessionId, fn) => {
    set((state) => {
      const newMap = new Map(state.addFileToInputFns);
      newMap.set(sessionId, fn);
      return { addFileToInputFns: newMap };
    });
  },

  unregisterAddFileToInput: (sessionId) => {
    set((state) => {
      const newMap = new Map(state.addFileToInputFns);
      newMap.delete(sessionId);
      return { addFileToInputFns: newMap };
    });
  },

  addFileToInput: (sessionId, entry) => {
    const fn = get().addFileToInputFns.get(sessionId);
    if (fn) {
      fn(entry);
    }
  },
}));
