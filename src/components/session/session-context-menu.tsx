import { useState } from "react";
import { BsThreeDots } from "react-icons/bs";
import { VscEdit, VscTrash, VscAdd } from "react-icons/vsc";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showQuickCreateDialog, setShowQuickCreateDialog] = useState(false);
  const [newName, setNewName] = useState(session.name);
  const [dropdownOpen, setDropdownOpen] = useState(false);

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

  const menuItems = (
    <>
      <ContextMenuItem
        onClick={() => setShowQuickCreateDialog(true)}
        className="cursor-pointer"
      >
        <VscAdd className="mr-2 h-4 w-4" />
        Quick create
      </ContextMenuItem>
      <ContextMenuItem onClick={openRenameDialog} className="cursor-pointer">
        <VscEdit className="mr-2 h-4 w-4" />
        Rename session
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => setShowDeleteDialog(true)}
        className="text-destructive focus:text-destructive cursor-pointer"
      >
        <VscTrash className="mr-2 h-4 w-4" />
        Delete session
      </ContextMenuItem>
    </>
  );

  const dropdownMenuItems = (
    <>
      <DropdownMenuItem
        onClick={() => setShowQuickCreateDialog(true)}
        className="cursor-pointer"
      >
        <VscAdd className="mr-2 h-4 w-4" />
        Quick create
      </DropdownMenuItem>
      <DropdownMenuItem onClick={openRenameDialog} className="cursor-pointer">
        <VscEdit className="mr-2 h-4 w-4" />
        Rename session
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => setShowDeleteDialog(true)}
        className="text-destructive focus:text-destructive cursor-pointer"
      >
        <VscTrash className="mr-2 h-4 w-4" />
        Delete session
      </DropdownMenuItem>
    </>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onClick={onClick}
            className={cn(
              "flex items-center justify-between w-full text-left p-2 rounded-md mb-1 transition-colors group relative cursor-default",
              isActive ? "bg-muted text-foreground" : "hover:bg-muted",
            )}
          >
            <div className="w-4/5">
              <div className="font-medium truncate pr-6 text-sm">
                {session.name}
              </div>
              <div className={cn("text-xs truncate", "text-muted-foreground")}>
                {session.provider === "claude" ? "Claude" : "Kimi"} •{" "}
                {worktreeName}
              </div>
            </div>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-6 h-6 cursor-pointer"
                >
                  <BsThreeDots />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48" align="end">
                {dropdownMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
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
    </>
  );
}
