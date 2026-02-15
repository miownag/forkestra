import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileIcon,
  FolderIcon,
  Edit2Icon,
  TrashIcon,
  CopyIcon,
  MessageSquareIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";
import { toast } from "sonner";
import {
  useFileOperationsStore,
  storeFileContentForUndo,
} from "@/stores/file-operations-store";

interface FileTreeContextMenuProps {
  entry: FileEntry;
  projectPath: string;
  onRefresh: () => void;
  children: React.ReactNode;
}

export function FileTreeContextMenu({
  entry,
  projectPath,
  onRefresh,
  children,
}: FileTreeContextMenuProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);

  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState(entry.name);
  const [isOperating, setIsOperating] = useState(false);

  const { recordOperation } = useFileOperationsStore();

  // Handle rename
  const handleRename = async () => {
    if (!renameValue.trim() || renameValue === entry.name) {
      setShowRenameDialog(false);
      return;
    }

    setIsOperating(true);
    try {
      const newPath = await invoke<string>("rename_item", {
        operation: {
          projectPath,
          oldPath: entry.path,
          newName: renameValue.trim(),
        },
      });

      // Record operation for undo
      recordOperation({
        type: "rename",
        timestamp: Date.now(),
        projectPath,
        data: {
          oldPath: entry.path,
          newPath,
        },
      });

      toast.success(`Renamed to ${renameValue.trim()}`);
      onRefresh();
      setShowRenameDialog(false);
    } catch (error) {
      toast.error(`Failed to rename: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    setIsOperating(true);
    try {
      // Store file content for undo if it's a file
      let content: string | undefined;
      if (entry.is_file) {
        content = await storeFileContentForUndo(projectPath, entry.path);
      }

      await invoke("delete_item", {
        operation: {
          projectPath,
          relativePath: entry.path,
          content: null,
        },
      });

      // Record operation for undo
      recordOperation({
        type: "delete",
        timestamp: Date.now(),
        projectPath,
        data: {
          path: entry.path,
          isDirectory: entry.is_dir,
          content,
        },
      });

      toast.success(`Deleted ${entry.name}`);
      onRefresh();
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error(`Failed to delete: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  // Handle new file
  const handleNewFile = async () => {
    if (!newName.trim()) {
      setShowNewFileDialog(false);
      return;
    }

    setIsOperating(true);
    try {
      const newPath = entry.is_dir
        ? `${entry.path}/${newName.trim()}`
        : newName.trim();

      await invoke<string>("create_file", {
        operation: {
          projectPath,
          relativePath: newPath,
          content: "",
        },
      });

      // Record operation for undo
      recordOperation({
        type: "create",
        timestamp: Date.now(),
        projectPath,
        data: {
          path: newPath,
          isDirectory: false,
        },
      });

      toast.success(`Created ${newName.trim()}`);
      onRefresh();
      setShowNewFileDialog(false);
      setNewName("");
    } catch (error) {
      toast.error(`Failed to create file: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  // Handle new folder
  const handleNewFolder = async () => {
    if (!newName.trim()) {
      setShowNewFolderDialog(false);
      return;
    }

    setIsOperating(true);
    try {
      const newPath = entry.is_dir
        ? `${entry.path}/${newName.trim()}`
        : newName.trim();

      await invoke<string>("create_directory", {
        operation: {
          projectPath,
          relativePath: newPath,
          content: null,
        },
      });

      // Record operation for undo
      recordOperation({
        type: "create",
        timestamp: Date.now(),
        projectPath,
        data: {
          path: newPath,
          isDirectory: true,
        },
      });

      toast.success(`Created folder ${newName.trim()}`);
      onRefresh();
      setShowNewFolderDialog(false);
      setNewName("");
    } catch (error) {
      toast.error(`Failed to create folder: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  // Handle copy path
  const handleCopyPath = async () => {
    try {
      const fullPath = `${projectPath}/${entry.path}`;
      await navigator.clipboard.writeText(fullPath);
      toast.info("Path copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy path");
    }
  };

  // Handle copy relative path
  const handleCopyRelativePath = async () => {
    try {
      await navigator.clipboard.writeText(entry.path);
      toast.info("Relative path copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy relative path");
    }
  };

  // Handle add to conversation
  const handleAddToConversation = async () => {
    if (entry.is_dir) {
      toast.error("Cannot add folder to conversation");
      return;
    }

    try {
      const content = await invoke<string>("read_file", {
        projectPath,
        relativePath: entry.path,
      });

      // Get file extension for syntax highlighting
      const ext = entry.name.split(".").pop() || "";

      // Format as markdown code block
      const formattedContent = `\`\`\`${ext}\n// File: ${entry.path}\n${content}\n\`\`\``;

      // TODO: Add to chat input
      // For now, just copy to clipboard
      await navigator.clipboard.writeText(formattedContent);
      toast.success("File content copied to clipboard (paste into chat)");
    } catch (error) {
      toast.error(`Failed to read file: ${error}`);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {entry.is_dir && (
            <>
              <ContextMenuItem
                onClick={() => {
                  setNewName("");
                  setShowNewFileDialog(true);
                }}
              >
                <FileIcon className="mr-2 h-4 w-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setNewName("");
                  setShowNewFolderDialog(true);
                }}
              >
                <FolderIcon className="mr-2 h-4 w-4" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onClick={() => {
              setRenameValue(entry.name);
              setShowRenameDialog(true);
            }}
          >
            <Edit2Icon className="mr-2 h-4 w-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          {entry.is_file && (
            <>
              <ContextMenuItem onClick={handleAddToConversation}>
                <MessageSquareIcon className="mr-2 h-4 w-4" />
                Add to Conversation
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={handleCopyPath}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Copy Path
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyRelativePath}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Copy Relative Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {entry.is_dir ? "folder" : "file"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {entry.is_dir
                ? `This will delete the folder "${entry.name}" and all its contents. This action can be undone with Cmd+Z.`
                : `This will delete the file "${entry.name}". This action can be undone with Cmd+Z.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isOperating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isOperating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isOperating ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {entry.is_dir ? "folder" : "file"}</DialogTitle>
            <DialogDescription>
              Enter a new name for "{entry.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename">Name</Label>
              <Input
                id="rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isOperating) {
                    handleRename();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              disabled={isOperating}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isOperating}>
              {isOperating ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Create a new file in "{entry.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newfile">File name</Label>
              <Input
                id="newfile"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isOperating) {
                    handleNewFile();
                  }
                }}
                placeholder="example.ts"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFileDialog(false);
                setNewName("");
              }}
              disabled={isOperating}
            >
              Cancel
            </Button>
            <Button onClick={handleNewFile} disabled={isOperating}>
              {isOperating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Create a new folder in "{entry.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newfolder">Folder name</Label>
              <Input
                id="newfolder"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isOperating) {
                    handleNewFolder();
                  }
                }}
                placeholder="new-folder"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFolderDialog(false);
                setNewName("");
              }}
              disabled={isOperating}
            >
              Cancel
            </Button>
            <Button onClick={handleNewFolder} disabled={isOperating}>
              {isOperating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
