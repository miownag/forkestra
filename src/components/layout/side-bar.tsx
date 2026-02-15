import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSelectorSettingsStore,
  useSelectorProviderStore,
  useSelectorSessionStore,
  useSessionStore,
} from "@/stores";
import { NewSessionDialog } from "@/components/session/new-session-dialog";
import { cn, formatTimeAgo } from "@/lib/utils";
import type { Session } from "@/types";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { useRouter, useLocation } from "@tanstack/react-router";
import {
  SidebarLeft,
  Edit,
  Setting5,
  AddSquare,
  Edit2,
  Trash,
} from "iconsax-reactjs";
import { RiGitRepositoryLine } from "react-icons/ri";
import PROVIDER_ICONS_MAP from "@/constants/icons";
import { SessionStatusIcon } from "@/components/session/session-status-icon";
import { LuChevronDown, LuGitBranch } from "react-icons/lu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";

// ---- SessionSidebarItem types ----

interface SessionSidebarItemRef {
  openQuickCreate: () => void;
  openRename: () => void;
  openDelete: () => void;
}

interface SessionSidebarItemProps {
  session: Session;
  isActive: boolean;
  isSessionActive: boolean;
  onClick: () => void;
  isStreaming?: boolean;
  isResuming?: boolean;
  isCreating?: boolean;
  hasPendingPermission?: boolean;
}

// ---- SessionSidebarItem ----

const SessionSidebarItem = forwardRef<
  SessionSidebarItemRef,
  SessionSidebarItemProps
>(
  (
    {
      session,
      isActive,
      isSessionActive,
      onClick,
      isStreaming = false,
      isResuming = false,
      isCreating = false,
      hasPendingPermission = false,
    },
    ref
  ) => {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showQuickCreateDialog, setShowQuickCreateDialog] = useState(false);
    const [newName, setNewName] = useState(session.name);

    const terminateSession = useSessionStore((s) => s.terminateSession);
    const renameSession = useSessionStore((s) => s.renameSession);

    const ProviderIcon = PROVIDER_ICONS_MAP[session.provider];

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

    useImperativeHandle(ref, () => ({
      openQuickCreate: () => setShowQuickCreateDialog(true),
      openRename: openRenameDialog,
      openDelete: () => setShowDeleteDialog(true),
    }));

    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={session.name}
              isActive={isActive}
              onClick={onClick}
              className={cn(
                "py-6",
                isActive && "bg-muted!",
                !isSessionActive && "opacity-50"
              )}
            >
              <span className="shrink-0 size-4 flex items-center justify-center">
                <ProviderIcon.Color size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "font-medium truncate text-xs",
                    session.is_local ? "text-local" : "text-worktree"
                  )}
                >
                  {session.name}
                </div>
                <div
                  className="flex items-center gap-1 text-[0.65rem] truncate text-muted-foreground"
                  title={worktreeName}
                >
                  <LuGitBranch className="size-2.5 shrink-0" />
                  {worktreeName}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0 ml-auto">
                <SessionStatusIcon
                  status={session.status}
                  isStreaming={isStreaming}
                  isResuming={isResuming}
                  isCreating={isCreating}
                  hasPendingPermission={hasPendingPermission}
                  className="size-3.5"
                />
                {session.updated_at && (
                  <div className="text-[0.6rem] text-muted-foreground/70">
                    {formatTimeAgo(session.updated_at)}
                  </div>
                )}
              </div>
            </SidebarMenuButton>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem
              onClick={() => setShowQuickCreateDialog(true)}
              className="cursor-pointer"
            >
              <AddSquare className="mr-2 h-4 w-4" />
              Quick create
              <ContextMenuShortcut>⌘⌥N</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={openRenameDialog}
              className="cursor-pointer"
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Rename
              <ContextMenuShortcut>⌘⌥R</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
              <ContextMenuShortcut>⌘⌥⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
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
);

SessionSidebarItem.displayName = "SessionSidebarItem";

// ---- AppSidebar ----

export function AppSidebar() {
  useStreamEvents();

  const [showNewSession, setShowNewSession] = useState(false);
  const router = useRouter();
  const location = useLocation();
  const { state: sidebarState } = useSidebar();
  const isIconMode = sidebarState === "collapsed";

  const {
    sessions,
    activeSessionId,
    openTab,
    fetchSessions,
    streamingSessions,
    resumingSessions,
    creatingSessions,
    interactionPrompts,
  } = useSelectorSessionStore([
    "sessions",
    "activeSessionId",
    "openTab",
    "fetchSessions",
    "streamingSessions",
    "resumingSessions",
    "creatingSessions",
    "interactionPrompts",
  ]);
  const { providers } = useSelectorProviderStore(["providers"]);
  const { resolvedTheme, isFullscreen, sidebarCollapsed, toggleSidebar } =
    useSelectorSettingsStore([
      "resolvedTheme",
      "isFullscreen",
      "sidebarCollapsed",
      "toggleSidebar",
    ]);

  const installedProviders = providers.filter((p) => p.installed);

  // Load sessions from backend on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Group sessions by project path
  const sessionsByProject = sessions.reduce<Record<string, Session[]>>(
    (acc, session) => {
      const key = session.project_path;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    },
    {}
  );

  // Sort sessions within each group by created_at descending
  for (const key of Object.keys(sessionsByProject)) {
    sessionsByProject[key].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  // Sort project groups by most recent session created_at descending
  const sortedProjectPaths = Object.keys(sessionsByProject).sort((a, b) => {
    const aLatest = new Date(sessionsByProject[a][0].created_at).getTime();
    const bLatest = new Date(sessionsByProject[b][0].created_at).getTime();
    return bLatest - aLatest;
  });

  const isSessionActive = (s: Session) =>
    s.status === "active" || s.status === "creating";

  // Refs for session items to trigger actions via keyboard
  const sessionItemRefs = useRef<Map<string, SessionSidebarItemRef>>(new Map());

  const setSessionItemRef = useCallback(
    (sessionId: string, ref: SessionSidebarItemRef | null) => {
      if (ref) {
        sessionItemRefs.current.set(sessionId, ref);
      } else {
        sessionItemRefs.current.delete(sessionId);
      }
    },
    []
  );

  // Cmd+N to open new session dialog
  useEffect(() => {
    const handleNewSession = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "n" &&
        installedProviders.length === 0
      ) {
        e.preventDefault();
        setShowNewSession(true);
      }
    };

    window.addEventListener("keydown", handleNewSession);
    return () => window.removeEventListener("keydown", handleNewSession);
  }, []);

  // Register keyboard shortcuts for active session actions (window-level)
  useEffect(() => {
    if (!activeSessionId || sidebarCollapsed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || !e.altKey) return;

      const sessionItemRef = sessionItemRefs.current.get(activeSessionId);
      if (!sessionItemRef) return;

      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          sessionItemRef.openQuickCreate();
          break;
        case "r":
          e.preventDefault();
          sessionItemRef.openRename();
          break;
        case "backspace":
          e.preventDefault();
          sessionItemRef.openDelete();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSessionId, sidebarCollapsed]);

  const handleSettingsClick = () => {
    if (location.pathname !== "/settings") {
      router.navigate({ to: "/settings" });
    } else {
      router.history.back();
    }
  };

  return (
    <Sidebar collapsible="icon">
      {/* Tauri drag region + toggle button (non-fullscreen) */}
      {!isFullscreen && (
        <div
          data-tauri-drag-region
          className={cn(
            "shrink-0 h-13 z-50 flex items-center justify-end",
            !isIconMode && "pr-2"
          )}
        >
          {!isIconMode && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl"
              onClick={toggleSidebar}
            >
              <SidebarLeft />
            </Button>
          )}
        </div>
      )}

      {/* Header: Logo + Version */}
      <SidebarHeader className={cn("p-0", isFullscreen ? "mt-1" : "-mt-2")}>
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full">
            <img
              src={`/icon-${resolvedTheme}.png`}
              alt="Forkestra"
              className={cn(
                "shrink-0 select-none pointer-events-none duration-300",
                isIconMode ? "h-auto w-auto scale-180" : "h-10 w-10 -mt-0.5"
              )}
            />
            <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
              <h1 className="text-lg font-semibold leading-none whitespace-nowrap select-none! cursor-default">
                Forkestra
              </h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                Version: 0.1.0
              </p>
            </div>
          </div>
          {isFullscreen && !isIconMode && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5 self-start group-data-[collapsible=icon]:hidden"
              onClick={toggleSidebar}
            >
              <SidebarLeft />
            </Button>
          )}
        </div>
      </SidebarHeader>

      {/* New Session Button */}
      <SidebarGroup className={cn("py-0 mb-4", !isIconMode && "px-3")}>
        <SidebarMenu>
          <SidebarMenuItem>
            {installedProviders.length === 0 ? (
              <SidebarMenuButton
                tooltip="No AI CLI tools installed"
                disabled
                className={cn(
                  "pointer-events-none cursor-not-allowed px-3",
                  !isIconMode &&
                    "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground/90"
                )}
              >
                <Edit className="shrink-0" />
                <span>New Session</span>
                <span className="ml-auto text-xs opacity-75 select-none">
                  ⌘ N
                </span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                onClick={() => setShowNewSession(true)}
                className={cn(
                  "cursor-pointer px-3",
                  !isIconMode &&
                    "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground/90"
                )}
              >
                <Edit className="shrink-0" />
                <span>New Session</span>
                <span className="ml-auto text-xs opacity-75 select-none">
                  ⌘ N
                </span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarSeparator />

      {/* Sessions List */}
      <SidebarContent className={isIconMode ? "mt-4" : ""}>
        {sessions.length === 0 ? (
          <div className="flex-1 flex justify-center items-center">
            <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              No sessions
            </span>
          </div>
        ) : (
          sortedProjectPaths.map((projectPath) => {
            const projectSessions = sessionsByProject[projectPath];
            const projectName = projectPath.split("/").pop() || projectPath;
            return (
              <Collapsible
                key={projectPath}
                defaultOpen={true}
                className="group/collapsible"
              >
                <SidebarGroup className="py-1 px-2">
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="w-full cursor-pointer select-none hover:text-foreground tracking-wider group/trigger">
                      <div className="flex items-center w-full justify-between">
                        <div className="flex items-center gap-1">
                          <RiGitRepositoryLine className="shrink-0" />
                          <span
                            className="truncate text-sm"
                            title={projectName}
                          >
                            {projectName}
                          </span>
                        </div>
                        <div className="shrink-0 transition-transform group-data-[state=closed]/trigger:-rotate-90">
                          <LuChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {projectSessions.map((session) => (
                          <SidebarMenuItem key={session.id}>
                            <SessionSidebarItem
                              ref={(r) => setSessionItemRef(session.id, r)}
                              session={session}
                              isActive={activeSessionId === session.id}
                              isSessionActive={isSessionActive(session)}
                              onClick={() => openTab(session.id)}
                              isStreaming={streamingSessions.has(session.id)}
                              isResuming={resumingSessions.has(session.id)}
                              isCreating={creatingSessions.has(session.id)}
                              hasPendingPermission={
                                !!interactionPrompts[session.id]
                              }
                            />
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          })
        )}
      </SidebarContent>

      {/* Footer: Settings */}
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" onClick={handleSettingsClick}>
              <Setting5 className="shrink-0" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Dialogs */}
      <NewSessionDialog
        open={showNewSession}
        onOpenChange={setShowNewSession}
      />
    </Sidebar>
  );
}
