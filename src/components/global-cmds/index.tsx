import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AddSquare,
  AddCircle,
  CommandSquare,
  Edit2,
  Ghost,
  Microscope,
  SearchZoomIn,
  SearchZoomOut,
  Setting5,
  Trash,
} from "iconsax-reactjs";
import { cn } from "@/lib/utils";
import { useSelectorSessionStore } from "@/stores";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "@tanstack/react-router";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { NewSessionDialog } from "@/components/session/new-session-dialog";
import { MCP } from "@lobehub/icons";
import { menuEventBus } from "@/lib/menu-events";

export interface GlobalCommandsRef {
  openNewSession: () => void;
  openQuickCreate: () => void;
  openRename: () => void;
  openDelete: () => void;
}

export function GlobalCommands({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showQuickCreateDialog, setShowQuickCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newName, setNewName] = useState("");

  const navigate = useNavigate();
  const { sessions, activeSessionId, renameSession, terminateSession } =
    useSelectorSessionStore([
      "sessions",
      "activeSessionId",
      "renameSession",
      "terminateSession",
    ]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Session handlers
  const handleCreateSession = () => {
    setOpen(false);
    setShowNewSessionDialog(true);
  };

  const handleQuickCreate = () => {
    if (!activeSession) return;
    setOpen(false);
    setShowQuickCreateDialog(true);
  };

  const handleRename = () => {
    if (!activeSession) return;
    setNewName(activeSession.name);
    setOpen(false);
    setShowRenameDialog(true);
  };

  const handleDelete = () => {
    if (!activeSession) return;
    setOpen(false);
    setShowDeleteDialog(true);
  };

  // Listen for native menu events
  useEffect(() => {
    const unsubs = [
      menuEventBus.on("menu:create_session", handleCreateSession),
      menuEventBus.on("menu:quick_create", handleQuickCreate),
      menuEventBus.on("menu:rename_session", handleRename),
      menuEventBus.on("menu:delete_session", handleDelete),
      menuEventBus.on("menu:mcps", () => {
        setOpen(false);
        navigate({ to: "/settings" });
      }),
      menuEventBus.on("menu:skills", () => {
        setOpen(false);
        navigate({ to: "/settings" });
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [navigate, activeSession]);

  const handleRenameSubmit = async () => {
    if (activeSession && newName.trim() && newName !== activeSession.name) {
      await renameSession(activeSession.id, newName.trim());
    }
    setShowRenameDialog(false);
  };

  const handleDeleteConfirm = async () => {
    if (activeSession) {
      await terminateSession(activeSession.id, true);
    }
    setShowDeleteDialog(false);
  };

  // Account handlers
  const handleSettings = () => {
    setOpen(false);
    navigate({ to: "/settings" });
  };

  const handleHelp = async () => {
    setOpen(false);
    try {
      await openUrl("https://example.com/help");
    } catch (err) {
      console.error("Failed to open help URL:", err);
    }
  };

  // View handlers
  const handleToggleFullscreen = async () => {
    setOpen(false);
    try {
      const window = getCurrentWindow();
      const isFullscreen = await window.isFullscreen();
      await window.setFullscreen(!isFullscreen);
    } catch (err) {
      console.error("Failed to toggle fullscreen:", err);
    }
  };

  const handleExitFullscreen = async () => {
    setOpen(false);
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
    } catch (err) {
      console.error("Failed to exit fullscreen:", err);
    }
  };

  const quickCreateDefaults = activeSession
    ? {
        provider: activeSession.provider,
        projectPath: activeSession.project_path,
        useLocal: activeSession.is_local,
        baseBranch: activeSession.is_local
          ? undefined
          : activeSession.branch_name,
      }
    : undefined;

  return (
    <>
      <div className="flex flex-col gap-4">
        <Button
          onClick={() => setOpen(true)}
          variant="ghost"
          size="sm"
          className={cn(
            "shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl",
            className
          )}
        >
          <CommandSquare />
          Fast Commands
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <Command>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Session">
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleCreateSession}
                >
                  <AddCircle />
                  <span>Create session</span>
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleQuickCreate}
                  disabled={!activeSession}
                >
                  <AddSquare />
                  <span>Quick create from this session</span>
                  <CommandShortcut>⌘⌥N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleRename}
                  disabled={!activeSession}
                >
                  <Edit2 />
                  <span>Rename this session</span>
                  <CommandShortcut>⌘⌥R</CommandShortcut>
                </CommandItem>
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleDelete}
                  disabled={!activeSession}
                >
                  <Trash className="text-destructive" />
                  <span className="text-destructive">Delete this session</span>
                  <CommandShortcut>⌘⌥⌫</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Tools">
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleSettings}
                >
                  <MCP />
                  MCPs
                </CommandItem>
                <CommandItem className="cursor-pointer" onSelect={handleHelp}>
                  <Microscope />
                  Skills
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Account">
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleSettings}
                >
                  <Setting5 />
                  Settings
                  <CommandShortcut>⌘,</CommandShortcut>
                </CommandItem>
                <CommandItem className="cursor-pointer" onSelect={handleHelp}>
                  <Ghost />
                  Help & Support
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="View">
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleToggleFullscreen}
                >
                  <SearchZoomIn />
                  Toggle Full Screen
                  <CommandShortcut>fn F</CommandShortcut>
                </CommandItem>
                <CommandItem
                  className="cursor-pointer"
                  onSelect={handleExitFullscreen}
                >
                  <SearchZoomOut />
                  Exit Fullscreen
                  <CommandShortcut>fn F</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={showNewSessionDialog}
        onOpenChange={setShowNewSessionDialog}
      />

      {/* Quick Create Dialog */}
      {activeSession && (
        <NewSessionDialog
          open={showQuickCreateDialog}
          onOpenChange={setShowQuickCreateDialog}
          defaultValues={quickCreateDefaults}
        />
      )}

      {/* Rename Dialog */}
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
                    handleRenameSubmit();
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
            <Button onClick={handleRenameSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
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
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
