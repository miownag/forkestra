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
import { SidebarToggleButton, ThemeToggleButton } from "./title-bar-controls";
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
    reorderTab,
  } = useSelectorSessionStore([
    "sessions",
    "activeSessionId",
    "openTabIds",
    "openTab",
    "closeTab",
    "closeOtherTabs",
    "reorderTab",
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
        "shrink-0 h-11 z-50 flex items-center pr-2 w-full bg-muted/20",
        isFullscreen ? "pl-2" : sidebarCollapsed ? "pl-24" : "pl-2"
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
}

function SortableTabItem({
  session,
  isActive,
  onClose,
  onCloseOthers,
  onCloseAll,
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
            "group/tab h-8 px-3 pr-1.5 text-xs gap-1.5 flex-1 basis-0 max-w-[180px]",
            "cursor-pointer select-none rounded-md rounded-b-none border border-b-0 border-border/30!",
            isDragging && "opacity-40",
            isActive ? "font-semibold border-primary/30!" : "hover:bg-muted/50",
            session.is_local ? "text-local/75" : "text-worktree/75",
            isActive && (session.is_local ? "text-local" : "text-worktree")
          )}
        >
          <ProviderIcon.Color size={14} />
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
      <span className="truncate">{session.name}</span>
    </div>
  );
}
