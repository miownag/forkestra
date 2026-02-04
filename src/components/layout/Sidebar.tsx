import { useState } from "react";
import { VscSettingsGear, VscAdd, VscClose } from "react-icons/vsc";
import { PiSidebarSimple } from "react-icons/pi";
import { LuGitBranch } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionStore, useProviderStore } from "@/stores";
import { NewSessionDialog } from "@/components/session/NewSessionDialog";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const terminateSession = useSessionStore((s) => s.terminateSession);
  const providers = useProviderStore((s) => s.providers);

  const installedProviders = providers.filter((p) => p.installed);

  const activeSessions = sessions.filter(
    (s) => s.status === "active" || s.status === "creating",
  );

  const handleTerminate = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await terminateSession(sessionId, false);
  };

  return (
    <>
      <aside
        className={cn(
          "bg-muted/30 border-r flex flex-col transition-all duration-300",
          collapsed ? "w-0 overflow-hidden" : "w-64",
        )}
      >
        {/* Header with Logo and Collapse Button */}
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-2">
            <LuGitBranch className="h-5 w-5 shrink-0" />
            <div className="flex flex-col gap-2">
              <h1 className="text-lg font-semibold leading-none whitespace-nowrap select-none">
                Forkestra
              </h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                Version: 0.1.0
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggle}
          >
            <PiSidebarSimple />
          </Button>
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShowNewSession(true)}
                className="w-full mb-2"
                size="sm"
                disabled={installedProviders.length === 0}
              >
                <VscAdd className="mr-1 h-4 w-4" />
                New Session
              </Button>
            </TooltipTrigger>
            {installedProviders.length === 0 && (
              <TooltipContent>
                <p>No AI CLI tools installed</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        <Separator />

        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider whitespace-nowrap">
              Sessions ({activeSessions.length})
            </div>
            {activeSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center whitespace-nowrap">
                No active sessions
              </p>
            ) : (
              activeSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md mb-1 transition-colors group relative",
                    activeSessionId === session.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium truncate pr-6 text-sm">
                    {session.name}
                  </div>
                  <div
                    className={cn(
                      "text-xs truncate",
                      activeSessionId === session.id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {session.provider === "claude" ? "Claude" : "Kimi"} •{" "}
                    {session.branch_name.split("/").pop()}
                  </div>
                  <button
                    onClick={(e) => handleTerminate(e, session.id)}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                      activeSessionId === session.id
                        ? "hover:bg-primary-foreground/20"
                        : "hover:bg-muted-foreground/20",
                    )}
                  >
                    <VscClose className="h-3.5 w-3.5" />
                  </button>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Settings */}
        <div className="flex p-2">
          <Button
            variant="ghost"
            onClick={() => setShowSettings(true)}
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
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
