import { useState } from "react";
import { VscSettingsGear, VscAdd } from "react-icons/vsc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSessionStore,
  useProviderStore,
  useSelectorSettingsStore,
} from "@/stores";
import { NewSessionDialog } from "@/components/session/new-session-dialog";
import { SessionItem } from "@/components/session/session-context-menu";
import { cn } from "@/lib/utils";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { useRouter, useLocation } from "@tanstack/react-router";

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  useStreamEvents();

  const [showNewSession, setShowNewSession] = useState(false);
  const router = useRouter();
  const location = useLocation();
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const providers = useProviderStore((s) => s.providers);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);

  const installedProviders = providers.filter((p) => p.installed);

  const activeSessions = sessions.filter(
    (s) => s.status === "active" || s.status === "creating",
  );

  const handleSettingsClick = () => {
    if (location.pathname !== "/settings") {
      router.navigate({ to: "/settings" });
    }
  };

  return (
    <>
      <aside
        className={cn(
          "bg-background border-r flex flex-col transition-all duration-300 h-full",
          collapsed ? "w-0 overflow-hidden" : "w-64",
        )}
      >
        {/* Header with Logo and Collapse Button */}
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-2">
            <img
              src={`/icon-${resolvedTheme}.png`}
              alt="Forkestra"
              className="h-5 w-5 shrink-0 opacity-75 select-none pointer-events-none"
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
        </div>

        {/* New Session Button */}
        <div className="px-3 mb-2 mt-1">
          {installedProviders.length === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <Button className="w-full mb-2" size="sm" disabled>
                    <VscAdd className="mr-1 h-4 w-4" />
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
              className="w-full mb-2"
              size="sm"
            >
              <VscAdd className="mr-1 h-4 w-4" />
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
    </>
  );
}
