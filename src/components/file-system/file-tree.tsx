import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";
import { useSessionLayoutStore } from "@/stores";
import { FileTreeContextMenu } from "./file-tree-context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFileOperationsStore } from "@/stores/file-operations-store";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FILE_EXT_SETI_ICONS_MAP } from "@/constants/icons";
import { DocumentText1 } from "iconsax-reactjs";
import { LeftPanelHeader } from "@/components/ui/left-panel-header";

interface FileTreeProps {
  projectPath: string;
  sessionId: string;
}

interface FileTreeItemProps {
  entry: FileEntry;
  projectPath: string;
  sessionId: string;
  onFileSelect: (filePath: string) => void;
  onRefresh: () => void;
  selectedPath: string | null;
  activeId: string | null;
  dropTargetId: string | null;
  renamingPath: string | null;
  contextMenuPath: string | null;
  onStartRename: (path: string) => void;
  onFinishRename: (path: string, newName: string) => void;
  onCancelRename: () => void;
  onContextMenuChange: (path: string | null, open: boolean) => void;
}

function FileTreeItem({
  entry,
  projectPath,
  sessionId,
  onFileSelect,
  onRefresh,
  selectedPath,
  activeId,
  dropTargetId,
  renamingPath,
  contextMenuPath,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onContextMenuChange,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [renameValue, setRenameValue] = useState(entry.name);

  const isRenaming = renamingPath === entry.path;

  // Update rename value when renaming starts
  useEffect(() => {
    if (isRenaming) {
      setRenameValue(entry.name);
    }
  }, [isRenaming, entry.name]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.path,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fetchChildren = useCallback(async () => {
    if (!entry.is_dir || isLoading) return;

    setIsLoading(true);
    try {
      const result = await invoke<FileEntry[]>("list_directory", {
        projectPath,
        relativePath: entry.path,
      });
      setChildren(result);
    } catch (error) {
      console.error("Failed to load directory:", error);
    } finally {
      setIsLoading(false);
    }
  }, [entry.path, entry.is_dir, projectPath, isLoading]);

  const handleToggle = useCallback(() => {
    if (entry.is_dir) {
      if (!isOpen && children.length === 0) {
        fetchChildren();
      }
      setIsOpen(!isOpen);
    }
  }, [entry.is_dir, isOpen, children.length, fetchChildren]);

  const handleClick = useCallback(() => {
    if (entry.is_file) {
      onFileSelect(entry.path);
    } else {
      handleToggle();
    }
  }, [entry.is_file, entry.path, onFileSelect, handleToggle]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onFinishRename(entry.path, renameValue.trim());
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancelRename();
      }
    },
    [entry.path, renameValue, onFinishRename, onCancelRename]
  );

  const isSelected = selectedPath === entry.path;
  const isDropTarget = dropTargetId === entry.path && entry.is_dir;
  const isContextMenuOpen = contextMenuPath === entry.path;

  if (entry.is_dir) {
    return (
      <div ref={setNodeRef} style={style}>
        <FileTreeContextMenu
          entry={entry}
          projectPath={projectPath}
          sessionId={sessionId}
          onRefresh={onRefresh}
          onStartRename={() => onStartRename(entry.path)}
          onContextMenuChange={(open) => onContextMenuChange(entry.path, open)}
        >
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <div
                className={cn(
                  "group hover:bg-accent hover:text-accent-foreground w-full flex items-center transition-none h-7 px-2 gap-1 rounded-md cursor-pointer text-sm",
                  isSelected && "bg-accent text-accent-foreground",
                  isContextMenuOpen && "bg-accent text-accent-foreground",
                  isDropTarget && "bg-accent/50 border-2 border-accent"
                )}
                onClick={!isRenaming ? handleToggle : undefined}
                {...(!isRenaming ? attributes : {})}
                {...(!isRenaming ? listeners : {})}
              >
                <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90 shrink-0" />
                {isOpen ? (
                  <FolderOpenIcon className="size-4 shrink-0" />
                ) : (
                  <FolderIcon className="size-4 shrink-0" />
                )}
                {isRenaming ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={() =>
                      onFinishRename(entry.path, renameValue.trim())
                    }
                    className="h-5 px-1 py-0 text-[length:inherit] flex-1 border-0 shadow-none focus-visible:ring-0 bg-accent/50"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate">{entry.name}</span>
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 mt-0.5">
              <div className="flex flex-col gap-0.5">
                {isLoading ? (
                  <div className="text-xs text-muted-foreground px-2 py-1">
                    Loading...
                  </div>
                ) : (
                  <SortableContext
                    items={children.map((c) => c.path)}
                    strategy={verticalListSortingStrategy}
                  >
                    {children.map((child) => (
                      <FileTreeItem
                        key={child.path}
                        entry={child}
                        projectPath={projectPath}
                        sessionId={sessionId}
                        onFileSelect={onFileSelect}
                        onRefresh={onRefresh}
                        selectedPath={selectedPath}
                        activeId={activeId}
                        dropTargetId={dropTargetId}
                        renamingPath={renamingPath}
                        contextMenuPath={contextMenuPath}
                        onStartRename={onStartRename}
                        onFinishRename={onFinishRename}
                        onCancelRename={onCancelRename}
                        onContextMenuChange={onContextMenuChange}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </FileTreeContextMenu>
      </div>
    );
  }

  const fileIconSrc =
    FILE_EXT_SETI_ICONS_MAP[
      entry.name.split(".").pop() as keyof typeof FILE_EXT_SETI_ICONS_MAP
    ] || "";

  return (
    <div ref={setNodeRef} style={style}>
      <FileTreeContextMenu
        entry={entry}
        projectPath={projectPath}
        sessionId={sessionId}
        onRefresh={onRefresh}
        onStartRename={() => onStartRename(entry.path)}
        onContextMenuChange={(open) => onContextMenuChange(entry.path, open)}
      >
        <div
          className={cn(
            "w-full flex items-center gap-1 h-7 px-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer text-sm",
            isSelected && "bg-accent text-accent-foreground",
            isContextMenuOpen && "bg-accent text-accent-foreground"
          )}
          onClick={!isRenaming ? handleClick : undefined}
          {...(!isRenaming ? attributes : {})}
          {...(!isRenaming ? listeners : {})}
        >
          {fileIconSrc ? (
            <img src={fileIconSrc} alt="" className="size-5.5 shrink-0" />
          ) : (
            <DocumentText1 className="size-4 shrink-0" />
          )}
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => onFinishRename(entry.path, renameValue.trim())}
              className="h-5 px-1 py-0 text-[length:inherit] flex-1 border-0 shadow-none focus-visible:ring-0 bg-accent/50"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{entry.name}</span>
          )}
        </div>
      </FileTreeContextMenu>
    </div>
  );
}

export function FileTree({ projectPath, sessionId }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [contextMenuPath, setContextMenuPath] = useState<string | null>(null);

  const { selectFile } = useSessionLayoutStore();
  const { selectedFile } = useSessionLayoutStore().getLayout(sessionId);
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    copiedItem,
    setCopiedItem,
    recordOperation,
  } = useFileOperationsStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const loadRootDirectory = useCallback(async () => {
    if (!projectPath) {
      setError("No project path provided");
      setIsLoading(false);
      return;
    }

    setError(null);
    try {
      const result = await invoke<FileEntry[]>("list_directory", {
        projectPath,
        relativePath: null,
      });
      setRootEntries(result);
    } catch (err) {
      console.error("Failed to load root directory:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setIsLoading(true);
    loadRootDirectory();
  }, [loadRootDirectory]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadRootDirectory();
  }, [loadRootDirectory]);

  const handleFileSelect = useCallback(
    (filePath: string) => {
      selectFile(sessionId, filePath);
    },
    [sessionId, selectFile]
  );

  // Helper to find entry by path
  const findEntry = useCallback(
    (path: string, entries: FileEntry[] = rootEntries): FileEntry | null => {
      for (const entry of entries) {
        if (entry.path === path) {
          return entry;
        }
      }
      return null;
    },
    [rootEntries]
  );

  // Rename handlers
  const handleStartRename = useCallback((path: string) => {
    setRenamingPath(path);
  }, []);

  const handleFinishRename = useCallback(
    async (path: string, newName: string) => {
      const entry = findEntry(path);
      if (!entry || !newName || newName === entry.name) {
        setRenamingPath(null);
        return;
      }

      try {
        const newPath = await invoke<string>("rename_item", {
          operation: {
            projectPath,
            oldPath: path,
            newName,
          },
        });

        recordOperation({
          type: "rename",
          timestamp: Date.now(),
          projectPath,
          data: {
            oldPath: path,
            newPath,
          },
        });

        toast.success(`Renamed to ${newName}`);
        handleRefresh();
      } catch (error) {
        toast.error(`Failed to rename: ${error}`);
      } finally {
        setRenamingPath(null);
      }
    },
    [projectPath, findEntry, recordOperation, handleRefresh]
  );

  const handleCancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleContextMenuChange = useCallback(
    (path: string | null, open: boolean) => {
      setContextMenuPath(open ? path : null);
    },
    []
  );

  // Check if target is a descendant of source
  const isDescendant = useCallback((sourcePath: string, targetPath: string) => {
    return targetPath.startsWith(sourcePath + "/");
  }, []);

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? String(over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const sourceEntry = findEntry(String(active.id));
    const targetEntry = findEntry(String(over.id));

    if (!sourceEntry || !targetEntry) {
      return;
    }

    // Validate: target must be a directory
    if (!targetEntry.is_dir) {
      toast.error("Can only drop into folders");
      return;
    }

    // Validate: cannot move folder into itself
    if (isDescendant(sourceEntry.path, targetEntry.path)) {
      toast.error("Cannot move folder into itself");
      return;
    }

    // Perform move operation
    try {
      const newPath = await invoke<string>("move_item", {
        operation: {
          projectPath,
          sourcePath: sourceEntry.path,
          destinationPath: targetEntry.path,
        },
      });

      // Record operation for undo
      recordOperation({
        type: "move",
        timestamp: Date.now(),
        projectPath,
        data: {
          sourcePath: sourceEntry.path,
          destinationPath: newPath,
        },
      });

      toast.success(`Moved ${sourceEntry.name} to ${targetEntry.name}`);
      handleRefresh();
    } catch (error) {
      toast.error(`Failed to move: ${error}`);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.userAgent.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Only handle if file tree is focused
      const isFileTreeFocused = document.activeElement?.closest(
        ".file-tree-container"
      );
      if (!isFileTreeFocused) return;

      // Undo: Cmd+Z / Ctrl+Z
      if (cmdOrCtrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          await undo(projectPath, handleRefresh);
        }
        return;
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z
      if (cmdOrCtrl && e.shiftKey && e.key === "z") {
        e.preventDefault();
        if (canRedo()) {
          await redo(projectPath, handleRefresh);
        }
        return;
      }

      // Copy: Cmd+C / Ctrl+C
      if (cmdOrCtrl && e.key === "c" && selectedFile) {
        e.preventDefault();
        const entry = findEntry(selectedFile);
        if (entry) {
          setCopiedItem({
            path: entry.path,
            projectPath,
            isDirectory: entry.is_dir,
          });
          toast.info(`Copied ${entry.name}`);
        }
        return;
      }

      // Paste: Cmd+V / Ctrl+V
      if (cmdOrCtrl && e.key === "v" && copiedItem) {
        e.preventDefault();
        if (copiedItem.projectPath !== projectPath) {
          toast.error("Cannot paste from different project");
          return;
        }

        try {
          // Determine paste location
          let targetDir = "";
          if (selectedFile) {
            const selected = findEntry(selectedFile);
            if (selected?.is_dir) {
              targetDir = selected.path;
            } else {
              // Get parent directory of selected file
              const lastSlash = selectedFile.lastIndexOf("/");
              targetDir =
                lastSlash > 0 ? selectedFile.substring(0, lastSlash) : "";
            }
          }

          // Read source content
          const fileName = copiedItem.path.split("/").pop() || "file";
          const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;

          if (copiedItem.isDirectory) {
            toast.error("Copying folders is not yet supported");
            return;
          }

          // Read and create new file
          const content = await invoke<string>("read_file", {
            projectPath: copiedItem.projectPath,
            relativePath: copiedItem.path,
          });

          await invoke<string>("create_file", {
            operation: {
              projectPath,
              relativePath: newPath,
              content,
            },
          });

          recordOperation({
            type: "create",
            timestamp: Date.now(),
            projectPath,
            data: {
              path: newPath,
              isDirectory: false,
            },
          });

          toast.success(`Pasted ${fileName}`);
          handleRefresh();
          setCopiedItem(null);
        } catch (error) {
          toast.error(`Failed to paste: ${error}`);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    projectPath,
    selectedFile,
    copiedItem,
    canUndo,
    canRedo,
    undo,
    redo,
    findEntry,
    setCopiedItem,
    handleRefresh,
    recordOperation,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading file tree...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive p-4">
        <div>
          <p className="font-medium">Failed to load file tree</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (rootEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No files found
      </div>
    );
  }

  const draggedEntry = activeId ? findEntry(activeId) : null;

  return (
    <div className="flex flex-col h-full w-full overflow-auto file-tree-container">
      <LeftPanelHeader
        sessionId={sessionId}
        mode="file-tree"
        label={projectPath}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
      <div className="flex-1 overflow-y-auto p-2" tabIndex={0}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rootEntries.map((e) => e.path)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0.5">
              {rootEntries.map((entry) => (
                <FileTreeItem
                  key={entry.path}
                  entry={entry}
                  projectPath={projectPath}
                  sessionId={sessionId}
                  onFileSelect={handleFileSelect}
                  onRefresh={handleRefresh}
                  selectedPath={selectedFile}
                  activeId={activeId}
                  dropTargetId={overId}
                  renamingPath={renamingPath}
                  contextMenuPath={contextMenuPath}
                  onStartRename={handleStartRename}
                  onFinishRename={handleFinishRename}
                  onCancelRename={handleCancelRename}
                  onContextMenuChange={handleContextMenuChange}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {draggedEntry ? (
              <div className="bg-background border rounded-md px-2 py-1 flex items-center gap-1 shadow-lg">
                {draggedEntry.is_dir ? (
                  <FolderIcon className="size-4" />
                ) : (
                  <FileIcon className="size-4" />
                )}
                <span className="text-sm">{draggedEntry.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
