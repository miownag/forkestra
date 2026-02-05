import { useState } from "react";
import { VscSettingsGear, VscAdd } from "react-icons/vsc";
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
import { SessionItem } from "@/components/session/session-context-menu";
import { cn } from "@/lib/utils";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { useRouter, useLocation } from "@tanstack/react-router";
import { PiSidebarDuotone } from "react-icons/pi";

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
  const { sessions, activeSessionId, setActiveSession } =
    useSelectorSessionStore([
      "sessions",
      "activeSessionId",
      "setActiveSession",
    ]);
  const { providers } = useSelectorProviderStore(["providers"]);
  const { resolvedTheme, isFullscreen } = useSelectorSettingsStore([
    "resolvedTheme",
    "isFullscreen",
  ]);

  const installedProviders = providers.filter((p) => p.installed);

  const activeSessions = sessions.filter(
    (s) => s.status === "active" || s.status === "creating",
  );

  const handleSettingsClick = () => {
    if (location.pathname !== "/settings") {
      router.navigate({ to: "/settings" });
    }
  };

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <div
      className={cn(
        "h-full flex flex-col border-r bg-muted/75",
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
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-6"
            onClick={toggleSidebar}
          >
            <PiSidebarDuotone />
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
            <div className="flex flex-col gap-2">
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
              className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-6 self-start"
              onClick={toggleSidebar}
            >
              <PiSidebarDuotone />
            </Button>
          )}
        </div>

        {/* New Session Button */}
        <div className="px-3 mb-4">
          {installedProviders.length === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <Button className="w-full" size="sm" disabled>
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
              className="w-full"
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
                  session={session}
                  isActive={activeSessionId === session.id}
                  onClick={() => setActiveSession(session.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Settings */}
        <div className="flex p-2">
          <Button
            variant="ghost"
            onClick={handleSettingsClick}
            className={cn(
              "w-full",
              location.pathname === "/settings" && "bg-muted cursor-default",
            )}
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
