import { useState, useEffect, useCallback, useRef } from "react";
import { VscSettingsGear } from "react-icons/vsc";
import { IoCreateOutline } from "react-icons/io5";
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
import { useStreamEvents } from "@/hooks/use-stream-events";
import { useRouter, useLocation } from "@tanstack/react-router";
import { PiSidebar } from "react-icons/pi";

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function Sidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
}: SidebarProps) {
  useStreamEvents();

  const [showNewSession, setShowNewSession] = useState(false);
  const router = useRouter();
  const location = useLocation();
  const { sessions, activeSessionId, setActiveSession, fetchSessions } =
    useSelectorSessionStore([
      "sessions",
      "activeSessionId",
      "setActiveSession",
      "fetchSessions",
    ]);
  const { providers } = useSelectorProviderStore(["providers"]);
  const { resolvedTheme, isFullscreen } = useSelectorSettingsStore([
    "resolvedTheme",
    "isFullscreen",
  ]);

  const installedProviders = providers.filter((p) => p.installed);

  // Load sessions from backend on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const activeSessions = sessions.filter(
    (s) => s.status === "active" || s.status === "creating",
  );
  const historySessions = sessions.filter(
    (s) =>
      s.status === "terminated" ||
      s.status === "error" ||
      s.status === "paused",
  );

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
    [],
  );

  // Register keyboard shortcuts for active session actions (window-level)
  // Cmd+N to open new session dialog
  useEffect(() => {
    const handleNewSession = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
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

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <div
      className={cn(
        "h-full flex flex-col border-r bg-muted/30",
        sidebarCollapsed ? "w-0 overflow-hidden" : "w-64",
      )}
    >
      {!isFullscreen && (
        <div
          data-tauri-drag-region
          className={cn(
            "shrink-0 h-13 z-50 flex items-center pr-4 justify-end",
            isFullscreen ? "pl-4" : "pl-24",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5"
            onClick={toggleSidebar}
          >
            <PiSidebar />
          </Button>
        </div>
      )}
      <aside
        className={cn(
          "flex flex-col transition-all duration-300 flex-1",
          isFullscreen ? "mt-1" : "-mt-2",
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
              <PiSidebar />
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
                    <IoCreateOutline className="-mt-0.5 mr-0.5" />
                    New Session
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
              <IoCreateOutline className="-mt-0.5 mr-0.5" />
              New Session
            </Button>
          )}
        </div>

        <Separator />

        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider whitespace-nowrap mb-1">
              Sessions ({activeSessions.length})
            </div>
            {activeSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center whitespace-nowrap">
                No active sessions
              </p>
            ) : (
              activeSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  ref={(ref) => setSessionItemRef(session.id, ref)}
                  session={session}
                  isActive={activeSessionId === session.id}
                  onClick={() => setActiveSession(session.id)}
                />
              ))
            )}
          </div>
          {/* History Sessions */}
          {historySessions.length > 0 && (
            <div className="p-2 pt-0">
              <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider whitespace-nowrap mb-1">
                History ({historySessions.length})
              </div>
              {historySessions.map((session) => (
                <SessionItem
                  key={session.id}
                  ref={(ref) => setSessionItemRef(session.id, ref)}
                  session={session}
                  isActive={activeSessionId === session.id}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Settings */}
        <div className="flex p-2">
          <Button
            variant="ghost"
            onClick={handleSettingsClick}
            className="w-full"
            size="sm"
          >
            <VscSettingsGear className="mr-1 h-4 w-4" />
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
