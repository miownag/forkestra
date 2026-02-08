import { useEffect } from "react";
import { VscClose } from "react-icons/vsc";
import { LuGitBranch, LuMonitor } from "react-icons/lu";
import { useSelectorSessionStore, useSelectorSettingsStore } from "@/stores";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarToggleButton, ThemeToggleButton } from "./title-bar-controls";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";

export function SessionTabBar() {
  const { sidebarCollapsed, isFullscreen } = useSelectorSettingsStore([
    "sidebarCollapsed",
    "isFullscreen",
  ]);
  const {
    sessions,
    activeSessionId,
    openTabIds,
    openTab,
    closeTab,
    closeOtherTabs,
  } = useSelectorSessionStore([
    "sessions",
    "activeSessionId",
    "openTabIds",
    "openTab",
    "closeTab",
    "closeOtherTabs",
  ]);

  // Cmd+W to close active tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeSessionId) {
          closeTab(activeSessionId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSessionId, closeTab]);

  const handleCloseAll = () => {
    for (const id of [...openTabIds]) {
      closeTab(id);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "shrink-0 h-11 z-50 flex items-center pr-2 w-full bg-muted/20",
        isFullscreen ? "pl-2" : sidebarCollapsed ? "pl-24" : "pl-2",
      )}
    >
      {/* Left: sidebar toggle when collapsed */}
      {sidebarCollapsed && <SidebarToggleButton className="ml-1 mr-1" />}

      {/* Center: tabs */}
      <Tabs
        value={activeSessionId ?? undefined}
        onValueChange={(value) => openTab(value)}
        className="flex-1 min-w-0 px-1"
      >
        <TabsList
          data-tauri-drag-region
          className="h-8 w-full justify-start bg-transparent p-0 gap-0.5"
        >
          {openTabIds.map((tabId) => {
            const session = sessions.find((s) => s.id === tabId);
            if (!session) return null;
            return (
              <TabItem
                key={tabId}
                session={session}
                isActive={tabId === activeSessionId}
                onClose={() => closeTab(tabId)}
                onCloseOthers={() => closeOtherTabs(tabId)}
                onCloseAll={handleCloseAll}
              />
            );
          })}
        </TabsList>
      </Tabs>

      {/* Right: theme toggle */}
      <ThemeToggleButton className="ml-1" />
    </div>
  );
}

interface TabItemProps {
  session: Session;
  isActive: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
}

function TabItem({
  session,
  isActive,
  onClose,
  onCloseOthers,
  onCloseAll,
}: TabItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TabsTrigger
          value={session.id}
          className={cn(
            "group/tab flex-1 h-8 px-3 pr-1.5 text-xs gap-1.5 max-w-[180px]",
            "cursor-pointer select-none rounded-md rounded-b-none border border-b-0 border-border/30!",
            isActive
              ? "bg-linear-to-b from-primary/20 to-primary/2 text-foreground font-semibold border-border!"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {session.is_local ? (
            <LuMonitor
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive ? "text-muted-foreground" : "text-muted-foreground/30",
              )}
            />
          ) : (
            <LuGitBranch
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isActive ? "text-primary" : "text-primary/30",
              )}
            />
          )}
          <span className="truncate">{session.name}</span>
          {session.status === "creating" && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
          )}
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              "rounded p-0.5 shrink-0 ml-auto hover:bg-foreground/10",
              isActive
                ? "opacity-60 hover:opacity-100"
                : "opacity-0 group-hover/tab:opacity-100",
            )}
          >
            <VscClose className="h-3 w-3" />
          </span>
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClose} className="cursor-pointer">
          Close Tab
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseOthers} className="cursor-pointer">
          Close Other Tabs
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onCloseAll}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          Close All Tabs
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
