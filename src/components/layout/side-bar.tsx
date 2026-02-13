import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSelectorSettingsStore,
  useSelectorProviderStore,
  useSelectorSessionStore,
} from "@/stores";
import { NewSessionDialog } from "@/components/session/new-session-dialog";
import {
  SessionItem,
  type SessionItemRef,
} from "@/components/session/session-context-menu";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { useRouter, useLocation } from "@tanstack/react-router";
import {
  SidebarLeft,
  Edit,
  ArrowRight2,
  ArrowDown2,
  Setting5,
} from "iconsax-reactjs";

export function Sidebar() {
  useStreamEvents();

  const [showNewSession, setShowNewSession] = useState(false);
  const router = useRouter();
  const location = useLocation();
  const { sessions, activeSessionId, openTab, fetchSessions } =
    useSelectorSessionStore([
      "sessions",
      "activeSessionId",
      "openTab",
      "fetchSessions",
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

  // Collapsible state for project groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const toggleGroup = useCallback((projectPath: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  }, []);

  // Refs for session items to trigger actions via keyboard
  const sessionItemRefs = useRef<Map<string, SessionItemRef>>(new Map());

  const setSessionItemRef = useCallback(
    (sessionId: string, ref: SessionItemRef | null) => {
      if (ref) {
        sessionItemRefs.current.set(sessionId, ref);
      } else {
        sessionItemRefs.current.delete(sessionId);
      }
    },
    []
  );

  // Register keyboard shortcuts for active session actions (window-level)
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
    <div
      className={cn(
        "h-full flex flex-col border-r bg-muted/30 shrink-0",
        sidebarCollapsed ? "w-0 overflow-hidden" : "w-64"
      )}
    >
      {!isFullscreen && (
        <div
          data-tauri-drag-region
          className="shrink-0 h-13 z-50 flex items-center pr-4 justify-end pl-24"
        >
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl"
            onClick={toggleSidebar}
          >
            <SidebarLeft />
          </Button>
        </div>
      )}
      <aside
        className={cn(
          "flex flex-col transition-all duration-300 flex-1",
          isFullscreen ? "mt-1" : "-mt-2"
        )}
      >
        {/* Header with Logo and Collapse Button */}
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-2">
            <img
              src={`/icon-${resolvedTheme}.png`}
              alt="Forkestra"
              className="h-6 w-6 shrink-0 select-none pointer-events-none -mt-0.5"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold leading-none whitespace-nowrap select-none cursor-default">
                Forkestra
              </h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                Version: 0.1.0
              </p>
            </div>
          </div>
          {isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5 self-start"
              onClick={toggleSidebar}
            >
              <SidebarLeft />
            </Button>
          )}
        </div>

        {/* New Session Button */}
        <div className="px-3 mb-4">
          {installedProviders.length === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full cursor-not-allowed">
                  <Button className="w-full select-none" size="sm" disabled>
                    <Edit className="-mt-0.5" />
                    New Session
                    <span className="ml-auto text-xs opacity-75 select-none">
                      ⌘ N
                    </span>
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>No AI CLI tools installed</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={() => setShowNewSession(true)}
              className="w-full select-none"
              size="sm"
            >
              <Edit className="-mt-0.5" />
              New Session
              <span className="ml-auto text-xs opacity-75 select-none">
                ⌘ N
              </span>
            </Button>
          )}
        </div>

        <Separator />

        {/* Sessions List - Grouped by Project Path */}

        {sessions.length === 0 ? (
          <div className="flex-1 flex justify-center items-center">
            <span className="text-xs text-muted-foreground">No sessions</span>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            {sortedProjectPaths.map((projectPath) => {
              const projectSessions = sessionsByProject[projectPath];
              const projectName = projectPath.split("/").pop() || projectPath;
              const isCollapsed = collapsedGroups.has(projectPath);
              return (
                <div key={projectPath} className="pt-2">
                  <div
                    className="flex items-center text-[0.8rem] font-medium text-muted-foreground px-2 py-1 tracking-wider whitespace-nowrap mb-1 cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => toggleGroup(projectPath)}
                  >
                    {isCollapsed ? (
                      <ArrowRight2
                        variant="Bold"
                        className="mr-1 h-3.5 w-3.5 shrink-0"
                      />
                    ) : (
                      <ArrowDown2
                        variant="Bold"
                        className="mr-1 h-3.5 w-3.5 shrink-0"
                      />
                    )}
                    <span className="truncate" title={projectPath}>
                      {projectName}
                    </span>
                  </div>
                  {!isCollapsed &&
                    projectSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        ref={(ref) => setSessionItemRef(session.id, ref)}
                        session={session}
                        isActive={activeSessionId === session.id}
                        isSessionActive={isSessionActive(session)}
                        onClick={() => openTab(session.id)}
                      />
                    ))}
                </div>
              );
            })}
          </ScrollArea>
        )}

        {/* Settings */}
        <div className="flex p-2">
          <Button
            variant="ghost"
            onClick={handleSettingsClick}
            className="w-full duration-0"
            size="sm"
          >
            <Setting5 className="mr-1 h-4 w-4" />
            Settings
          </Button>
        </div>
      </aside>

      {/* Dialogs */}
      <NewSessionDialog
        open={showNewSession}
        onOpenChange={setShowNewSession}
      />
    </div>
  );
}
