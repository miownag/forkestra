import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";
import { toast } from "sonner";

interface CreateOp {
  path: string;
  isDirectory: boolean;
}

interface DeleteOp {
  path: string;
  isDirectory: boolean;
  content?: string;
  children?: FileEntry[];
}

interface RenameOp {
  oldPath: string;
  newPath: string;
}

interface MoveOp {
  sourcePath: string;
  destinationPath: string;
}

interface FileOperation {
  type: "create" | "delete" | "rename" | "move";
  timestamp: number;
  projectPath: string;
  data: CreateOp | DeleteOp | RenameOp | MoveOp;
}

interface CopiedItem {
  path: string;
  projectPath: string;
  isDirectory: boolean;
}

interface FileOperationsState {
  history: FileOperation[];
  currentIndex: number;
  maxHistorySize: number;
  copiedItem: CopiedItem | null;

  // Actions
  recordOperation: (op: FileOperation) => void;
  undo: (projectPath: string, onRefresh: () => void) => Promise<void>;
  redo: (projectPath: string, onRefresh: () => void) => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setCopiedItem: (item: CopiedItem | null) => void;
  clearHistory: () => void;
}

const MAX_FILE_SIZE_FOR_UNDO = 1024 * 1024; // 1MB

export const useFileOperationsStore = create<FileOperationsState>(
  (set, get) => ({
    history: [],
    currentIndex: -1,
    maxHistorySize: 50,
    copiedItem: null,

    recordOperation: (op: FileOperation) => {
      set((state) => {
        // Remove any operations after currentIndex (when undoing then doing new operation)
        const newHistory = state.history.slice(0, state.currentIndex + 1);

        // Add new operation
        newHistory.push(op);

        // Keep only last maxHistorySize operations
        if (newHistory.length > state.maxHistorySize) {
          newHistory.shift();
        }

        return {
          history: newHistory,
          currentIndex: newHistory.length - 1,
        };
      });
    },

    undo: async (projectPath: string, onRefresh: () => void) => {
      const { history, currentIndex } = get();

      if (currentIndex < 0) {
        toast.error("Nothing to undo");
        return;
      }

      const operation = history[currentIndex];

      if (operation.projectPath !== projectPath) {
        toast.error("Cannot undo operation from different project");
        return;
      }

      try {
        switch (operation.type) {
          case "create": {
            // Undo create: delete the created item
            const data = operation.data as CreateOp;
            await invoke("delete_item", {
              operation: {
                projectPath: operation.projectPath,
                relativePath: data.path,
                content: null,
              },
            });
            toast.success(`Undid create: ${data.path}`);
            break;
          }

          case "delete": {
            // Undo delete: restore the deleted item
            const data = operation.data as DeleteOp;

            if (data.isDirectory) {
              // Restore directory structure (shallow)
              await invoke("create_directory", {
                operation: {
                  projectPath: operation.projectPath,
                  relativePath: data.path,
                  content: null,
                },
              });

              // Restore children if available
              if (data.children && data.children.length > 0) {
                toast.info(
                  "Directory restored but contents may be incomplete (only top-level structure)"
                );
              }
            } else {
              // Restore file with content
              if (!data.content) {
                toast.error(
                  "Cannot undo: file content was not saved (file too large)"
                );
                return;
              }

              await invoke("create_file", {
                operation: {
                  projectPath: operation.projectPath,
                  relativePath: data.path,
                  content: data.content,
                },
              });
            }

            toast.success(`Undid delete: ${data.path}`);
            break;
          }

          case "rename": {
            // Undo rename: rename back to original name
            const data = operation.data as RenameOp;
            const oldName = data.oldPath.split("/").pop() || "";

            await invoke("rename_item", {
              operation: {
                projectPath: operation.projectPath,
                oldPath: data.newPath,
                newName: oldName,
              },
            });
            toast.success(`Undid rename: ${data.newPath} → ${data.oldPath}`);
            break;
          }

          case "move": {
            // Undo move: move back to original location
            const data = operation.data as MoveOp;
            const fileName = data.sourcePath.split("/").pop() || "";
            const sourceDir = data.sourcePath.replace(`/${fileName}`, "") || "";

            await invoke("move_item", {
              operation: {
                projectPath: operation.projectPath,
                sourcePath: data.destinationPath + "/" + fileName,
                destinationPath: sourceDir || "",
              },
            });
            toast.success(`Undid move: ${fileName}`);
            break;
          }
        }

        // Move back in history
        set({ currentIndex: currentIndex - 1 });

        // Refresh file tree
        onRefresh();
      } catch (error) {
        console.error("Undo failed:", error);
        toast.error(`Undo failed: ${error}`);
      }
    },

    redo: async (projectPath: string, onRefresh: () => void) => {
      const { history, currentIndex } = get();

      if (currentIndex >= history.length - 1) {
        toast.error("Nothing to redo");
        return;
      }

      const operation = history[currentIndex + 1];

      if (operation.projectPath !== projectPath) {
        toast.error("Cannot redo operation from different project");
        return;
      }

      try {
        switch (operation.type) {
          case "create": {
            // Redo create
            const data = operation.data as CreateOp;
            if (data.isDirectory) {
              await invoke("create_directory", {
                operation: {
                  projectPath: operation.projectPath,
                  relativePath: data.path,
                  content: null,
                },
              });
            } else {
              await invoke("create_file", {
                operation: {
                  projectPath: operation.projectPath,
                  relativePath: data.path,
                  content: "",
                },
              });
            }
            toast.success(`Redid create: ${data.path}`);
            break;
          }

          case "delete": {
            // Redo delete
            const data = operation.data as DeleteOp;
            await invoke("delete_item", {
              operation: {
                projectPath: operation.projectPath,
                relativePath: data.path,
                content: null,
              },
            });
            toast.success(`Redid delete: ${data.path}`);
            break;
          }

          case "rename": {
            // Redo rename
            const data = operation.data as RenameOp;
            const newName = data.newPath.split("/").pop() || "";

            await invoke("rename_item", {
              operation: {
                projectPath: operation.projectPath,
                oldPath: data.oldPath,
                newName: newName,
              },
            });
            toast.success(`Redid rename: ${data.oldPath} → ${data.newPath}`);
            break;
          }

          case "move": {
            // Redo move
            const data = operation.data as MoveOp;
            const fileName = data.sourcePath.split("/").pop() || "";
            const destDir =
              data.destinationPath.replace(`/${fileName}`, "") || "";

            await invoke("move_item", {
              operation: {
                projectPath: operation.projectPath,
                sourcePath: data.sourcePath,
                destinationPath: destDir,
              },
            });
            toast.success(`Redid move: ${fileName}`);
            break;
          }
        }

        // Move forward in history
        set({ currentIndex: currentIndex + 1 });

        // Refresh file tree
        onRefresh();
      } catch (error) {
        console.error("Redo failed:", error);
        toast.error(`Redo failed: ${error}`);
      }
    },

    canUndo: () => {
      const { currentIndex } = get();
      return currentIndex >= 0;
    },

    canRedo: () => {
      const { history, currentIndex } = get();
      return currentIndex < history.length - 1;
    },

    setCopiedItem: (item: CopiedItem | null) => {
      set({ copiedItem: item });
    },

    clearHistory: () => {
      set({ history: [], currentIndex: -1 });
    },
  })
);

// Helper function to store file content for undo
export async function storeFileContentForUndo(
  projectPath: string,
  relativePath: string
): Promise<string | undefined> {
  try {
    const content = await invoke<string>("read_file", {
      projectPath,
      relativePath,
    });

    // Check file size
    const size = new Blob([content]).size;
    if (size > MAX_FILE_SIZE_FOR_UNDO) {
      toast.warning(
        `File too large to undo delete (${(size / 1024 / 1024).toFixed(2)}MB). Use git to recover if needed.`
      );
      return undefined;
    }

    return content;
  } catch (error) {
    console.error("Failed to store file content:", error);
    return undefined;
  }
}
