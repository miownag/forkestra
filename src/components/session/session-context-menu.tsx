import { useState, forwardRef, useImperativeHandle } from "react";
import { VscEdit, VscTrash, VscAdd } from "react-icons/vsc";
import { LuGitBranch, LuMonitor } from "react-icons/lu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
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
import { useSessionStore } from "@/stores";
import type { Session } from "@/types";
import { cn } from "@/lib/utils";
import { NewSessionDialog } from "./new-session-dialog";

export interface SessionItemRef {
  openQuickCreate: () => void;
  openRename: () => void;
  openDelete: () => void;
}

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isSessionActive: boolean;
  onClick: () => void;
}

export const SessionItem = forwardRef<SessionItemRef, SessionItemProps>(
  ({ session, isActive, isSessionActive, onClick }, ref) => {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showQuickCreateDialog, setShowQuickCreateDialog] = useState(false);
    const [newName, setNewName] = useState(session.name);

    const terminateSession = useSessionStore((s) => s.terminateSession);
    const renameSession = useSessionStore((s) => s.renameSession);

    // Prepare default values for quick create
    const quickCreateDefaults = {
      provider: session.provider,
      projectPath: session.project_path,
      useLocal: session.is_local,
      baseBranch: session.is_local ? undefined : session.branch_name,
    };

    const worktreeName = session.branch_name;

    const handleRename = async () => {
      if (newName.trim() && newName !== session.name) {
        await renameSession(session.id, newName.trim());
      }
      setShowRenameDialog(false);
    };

    const handleDelete = async () => {
      await terminateSession(session.id, true);
      setShowDeleteDialog(false);
    };

    const openRenameDialog = () => {
      setNewName(session.name);
      setShowRenameDialog(true);
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      openQuickCreate: () => setShowQuickCreateDialog(true),
      openRename: openRenameDialog,
      openDelete: () => setShowDeleteDialog(true),
    }));

    const menuItems = (
      <>
        <ContextMenuItem
          onClick={() => setShowQuickCreateDialog(true)}
          className="cursor-pointer"
        >
          <VscAdd className="mr-2 h-4 w-4" />
          Quick create
          <ContextMenuShortcut>⌘⌥N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={openRenameDialog} className="cursor-pointer">
          <VscEdit className="mr-2 h-4 w-4" />
          Rename
          <ContextMenuShortcut>⌘⌥R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <VscTrash className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌘⌥⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </>
    );

    return (
      <div className="px-2 mb-1">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              onClick={onClick}
              className={cn(
                "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md group relative cursor-default",
                isActive ? "bg-muted text-foreground" : "hover:bg-muted",
                !isSessionActive && "opacity-50",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate pr-6 text-xs flex items-center gap-1.5">
                  {session.is_local ? (
                    <LuMonitor className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  ) : (
                    <LuGitBranch className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  )}
                  {session.name}
                </div>
                <div
                  className={cn(
                    "text-[11px] truncate",
                    "text-muted-foreground",
                  )}
                >
                  {`${session.provider.slice(0, 1).toUpperCase()}${session.provider.slice(1)}`}{" "}
                  • {worktreeName}
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">{menuItems}</ContextMenuContent>
        </ContextMenu>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will terminate the session and delete the associated git
                worktree. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename session</DialogTitle>
              <DialogDescription>
                Enter a new name for this session.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
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
              >
                Cancel
              </Button>
              <Button onClick={handleRename}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <NewSessionDialog
          open={showQuickCreateDialog}
          onOpenChange={setShowQuickCreateDialog}
          defaultValues={quickCreateDefaults}
        />
      </div>
    );
  },
);

SessionItem.displayName = "SessionItem";
