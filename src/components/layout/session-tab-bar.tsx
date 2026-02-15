import { useEffect, useState } from "react";
import { VscClose } from "react-icons/vsc";
import { useSelectorSessionStore, useSelectorSettingsStore } from "@/stores";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggleButton } from "./title-bar-controls";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";
import PROVIDER_ICONS_MAP from "@/constants/icons";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { STATUS_BG_COLORS_MAP } from "../session/session-status-icon";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import { SidebarRight } from "iconsax-reactjs";

const getStatusColor = (
  status: Session["status"],
  isStreaming: boolean,
  isResuming: boolean,
  isCreating: boolean,
  hasPendingPermission: boolean
) => {
  if (hasPendingPermission) {
    return STATUS_BG_COLORS_MAP.pending_permission;
  }
  if (isCreating) {
    return STATUS_BG_COLORS_MAP.creating;
  }
  if (isResuming) {
    return STATUS_BG_COLORS_MAP.resuming;
  }
  if (isStreaming) {
    return STATUS_BG_COLORS_MAP.streaming;
  }
  if (status === "terminated") {
    return STATUS_BG_COLORS_MAP.terminated;
  }
  if (status === "paused") {
    return STATUS_BG_COLORS_MAP.paused;
  }
  if (status === "active") {
    return STATUS_BG_COLORS_MAP.completed;
  }
  return STATUS_BG_COLORS_MAP.completed;
};

export function SessionTabBar() {
  const { sidebarCollapsed, isFullscreen, toggleSidebar } =
    useSelectorSettingsStore([
      "sidebarCollapsed",
      "isFullscreen",
      "toggleSidebar",
    ]);
  const {
    sessions,
    activeSessionId,
    openTabIds,
    openTab,
    closeTab,
    closeOtherTabs,
    reorderTab,
    streamingSessions,
    resumingSessions,
    creatingSessions,
    interactionPrompts,
  } = useSelectorSessionStore([
    "sessions",
    "activeSessionId",
    "openTabIds",
    "openTab",
    "closeTab",
    "closeOtherTabs",
    "reorderTab",
    "streamingSessions",
    "resumingSessions",
    "creatingSessions",
    "interactionPrompts",
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const { state: sidebarState } = useSidebar();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingWidth, setDraggingWidth] = useState(0);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
    const el = document.querySelector(
      `[data-tab-id="${event.active.id}"]`
    ) as HTMLElement | null;
    if (el) {
      setDraggingWidth(el.getBoundingClientRect().width);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingId(null);
    if (over && active.id !== over.id) {
      const oldIndex = openTabIds.indexOf(String(active.id));
      const newIndex = openTabIds.indexOf(String(over.id));
      reorderTab(oldIndex, newIndex);
    }
  };

  const draggingSession = draggingId
    ? sessions.find((s) => s.id === draggingId)
    : null;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "shrink-0 h-13 z-50 flex items-center pr-2 w-full bg-muted/20",
        isFullscreen ? "pl-2" : sidebarCollapsed ? "pl-6" : "pl-2"
      )}
    >
      {sidebarState === "collapsed" && (
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl ml-4 mr-2"
          onClick={toggleSidebar}
        >
          <SidebarRight />
        </Button>
      )}
      {/* Center: tabs */}
      <Tabs
        value={activeSessionId ?? undefined}
        onValueChange={(value) => openTab(value)}
        className="flex-1 min-w-0 px-1"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={openTabIds}
            strategy={horizontalListSortingStrategy}
          >
            <TabsList
              data-tauri-drag-region
              className="h-8 w-full justify-start bg-transparent p-0 gap-0.5"
            >
              {openTabIds.map((tabId) => {
                const session = sessions.find((s) => s.id === tabId);
                if (!session) return null;
                return (
                  <SortableTabItem
                    key={tabId}
                    session={session}
                    isActive={tabId === activeSessionId}
                    onClose={() => closeTab(tabId)}
                    onCloseOthers={() => closeOtherTabs(tabId)}
                    onCloseAll={handleCloseAll}
                    isStreaming={streamingSessions.has(tabId)}
                    isResuming={resumingSessions.has(tabId)}
                    isCreating={creatingSessions.has(tabId)}
                    hasPendingPermission={!!interactionPrompts[tabId]}
                  />
                );
              })}
            </TabsList>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggingSession ? (
              <TabOverlay session={draggingSession} width={draggingWidth} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </Tabs>

      {/* Right: theme toggle */}
      <ThemeToggleButton className="ml-1" />
    </div>
  );
}

interface SortableTabItemProps {
  session: Session;
  isActive: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  isStreaming?: boolean;
  isResuming?: boolean;
  isCreating?: boolean;
  hasPendingPermission?: boolean;
}

function SortableTabItem({
  session,
  isActive,
  onClose,
  onCloseOthers,
  onCloseAll,
  isStreaming = false,
  isResuming = false,
  isCreating = false,
  hasPendingPermission = false,
}: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
    ),
    transition,
  };

  const ProviderIcon = PROVIDER_ICONS_MAP[session.provider];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TabsTrigger
          ref={setNodeRef}
          style={style}
          data-tab-id={session.id}
          {...attributes}
          {...listeners}
          value={session.id}
          className={cn(
            "group/tab h-8 px-3 pr-1.5 text-xs gap-1.5 flex-1 basis-0 max-w-45",
            "cursor-pointer select-none rounded-md rounded-b-none border border-b-0 border-border/30!",
            isDragging && "opacity-40",
            isActive
              ? "font-semibold bg-linear-to-b from-primary/20 to-primary/2"
              : "hover:bg-linear-to-b hover:from-muted/50 hover:to-muted/10",
            session.is_local ? "text-local/75" : "text-worktree/75",
            isActive && (session.is_local ? "text-local" : "text-worktree"),
            "transition-none"
          )}
        >
          <ProviderIcon.Color size={14} />
          <span className="truncate" title={session.name}>
            {session.name}
          </span>
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full mr-1 shrink-0",
              getStatusColor(
                session.status,
                isStreaming,
                isResuming,
                isCreating,
                hasPendingPermission
              )
            )}
          />
          <span
            role="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              "rounded p-0.5 shrink-0 ml-auto hover:bg-foreground/10",
              isActive
                ? "opacity-60 hover:opacity-100"
                : "opacity-0 group-hover/tab:opacity-100"
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

function TabOverlay({ session, width }: { session: Session; width: number }) {
  const ProviderIcon = PROVIDER_ICONS_MAP[session.provider];
  return (
    <div
      style={{ width }}
      className={cn(
        "inline-flex items-center h-8 px-3 pr-1.5 text-xs gap-1.5",
        "select-none rounded-md rounded-b-none border border-b-0 border-border!",
        "bg-linear-to-b from-primary/20 to-primary/2 font-semibold shadow-lg",
        session.is_local ? "text-local" : "text-worktree"
      )}
    >
      <ProviderIcon.Color size={14} />
      <span className="truncate" title={session.name}>
        {session.name}
      </span>
    </div>
  );
}
