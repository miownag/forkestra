import { create } from "zustand";
import { useSettingsStore } from "./settings-store";

interface SessionLayout {
  showFileTree: boolean;
  showFileViewer: boolean;
  selectedFile: string | null;
  fileViewerMode: "view" | "preview";
}

interface SessionLayoutState {
  // Per-session layout state
  layouts: Record<string, SessionLayout>;

  // Getters
  getLayout: (sessionId: string) => SessionLayout;

  // Actions
  toggleFileTree: (sessionId: string) => void;
  openFileTree: (sessionId: string) => void;
  closeFileTree: (sessionId: string) => void;

  selectFile: (sessionId: string, filePath: string) => void;
  closeFileViewer: (sessionId: string) => void;

  setFileViewerMode: (sessionId: string, mode: "view" | "preview") => void;
}

const DEFAULT_LAYOUT: SessionLayout = {
  showFileTree: false,
  showFileViewer: false,
  selectedFile: null,
  fileViewerMode: "view",
};

export const useSessionLayoutStore = create<SessionLayoutState>((set, get) => ({
  layouts: {},

  getLayout: (sessionId: string) => {
    const { layouts } = get();
    return layouts[sessionId] || DEFAULT_LAYOUT;
  },

  toggleFileTree: (sessionId: string) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      const willShowFileTree = !layout.showFileTree;

      // When showing file tree, collapse sidebar
      if (willShowFileTree) {
        useSettingsStore.getState().setSidebarCollapsed(true);
      }

      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            showFileTree: willShowFileTree,
          },
        },
      };
    });
  },

  openFileTree: (sessionId: string) => {
    // When opening file tree, collapse sidebar
    useSettingsStore.getState().setSidebarCollapsed(true);

    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            showFileTree: true,
          },
        },
      };
    });
  },

  closeFileTree: (sessionId: string) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            showFileTree: false,
          },
        },
      };
    });
  },

  selectFile: (sessionId: string, filePath: string) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            selectedFile: filePath,
            showFileViewer: true,
          },
        },
      };
    });
  },

  closeFileViewer: (sessionId: string) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            showFileViewer: false,
            selectedFile: null,
          },
        },
      };
    });
  },

  setFileViewerMode: (sessionId: string, mode: "view" | "preview") => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            fileViewerMode: mode,
          },
        },
      };
    });
  },
}));
