import { create } from "zustand";
import { useSettingsStore } from "./settings-store";

type LeftPanelMode = "file-tree" | "scm";
type FileViewerContext = "file" | "diff" | "conflict";

interface SessionLayout {
  showFileTree: boolean;
  showFileViewer: boolean;
  selectedFile: string | null;
  fileViewerMode: "edit" | "preview";
  leftPanelMode: LeftPanelMode;
  fileViewerContext: FileViewerContext;
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

  setFileViewerMode: (sessionId: string, mode: "edit" | "preview") => void;

  setLeftPanelMode: (sessionId: string, mode: LeftPanelMode) => void;
  toggleLeftPanelMode: (sessionId: string) => void;
  setFileViewerContext: (sessionId: string, ctx: FileViewerContext) => void;
}

const DEFAULT_LAYOUT: SessionLayout = {
  showFileTree: false,
  showFileViewer: false,
  selectedFile: null,
  fileViewerMode: "edit",
  leftPanelMode: "file-tree",
  fileViewerContext: "file",
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
            fileViewerContext: "file",
          },
        },
      };
    });
  },

  setFileViewerMode: (sessionId: string, mode: "edit" | "preview") => {
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

  setLeftPanelMode: (sessionId: string, mode: LeftPanelMode) => {
    useSettingsStore.getState().setSidebarCollapsed(true);

    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            leftPanelMode: mode,
            showFileTree: true,
          },
        },
      };
    });
  },

  toggleLeftPanelMode: (sessionId: string) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      const newMode: LeftPanelMode =
        layout.leftPanelMode === "file-tree" ? "scm" : "file-tree";
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            leftPanelMode: newMode,
            showFileTree: true,
          },
        },
      };
    });
  },

  setFileViewerContext: (sessionId: string, ctx: FileViewerContext) => {
    set((state) => {
      const layout = state.layouts[sessionId] || DEFAULT_LAYOUT;
      return {
        layouts: {
          ...state.layouts,
          [sessionId]: {
            ...layout,
            fileViewerContext: ctx,
          },
        },
      };
    });
  },
}));
