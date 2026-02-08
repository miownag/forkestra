import { useRef, useEffect, useCallback, useState } from "react";
import { useSelectorTerminalStore } from "@/stores/terminal-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VscClose,
  VscAdd,
  VscChevronDown,
  VscLayoutPanel,
  VscLayoutSidebarRight,
} from "react-icons/vsc";
import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";
import { XtermTerminal } from "./xterm-terminal";
import { AiOutlineClear } from "react-icons/ai";

interface TerminalPanelProps {
  sessionId: string;
  sessionCwd: string;
}

export function TerminalPanel({ sessionId, sessionCwd }: TerminalPanelProps) {
  const {
    terminals,
    activeTerminalId,
    isPanelOpen,
    position,
    panelSize,
    togglePanel,
    setPosition,
    setPanelSize,
    setActiveTerminal,
    closeTerminal,
    createTerminal,
  } = useSelectorTerminalStore([
    "terminals",
    "activeTerminalId",
    "isPanelOpen",
    "position",
    "panelSize",
    "togglePanel",
    "setPosition",
    "setPanelSize",
    "setActiveTerminal",
    "closeTerminal",
    "createTerminal",
  ]);

  const sessionTerminals = terminals.filter((t) => t.sessionId === sessionId);

  const handleCreateTerminal = async () => {
    await createTerminal(sessionId, sessionCwd);
  };

  const handleCloseTerminal = async (
    e: React.MouseEvent,
    terminalId: string,
  ) => {
    e.stopPropagation();
    await closeTerminal(terminalId);
  };

  const togglePosition = () => {
    setPosition(position === "bottom" ? "right" : "bottom");
  };

  return (
    <div
      className={cn(
        "bg-background border-border flex flex-col",
        position === "right" ? "border-l h-full" : "border-t w-full",
        !isPanelOpen && "hidden",
      )}
      style={{
        [position === "right" ? "width" : "height"]: panelSize,
        minWidth: position === "right" ? 200 : undefined,
        minHeight: position === "bottom" ? 100 : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 border-b bg-muted/30">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {sessionTerminals.length > 0 ? (
            <Tabs
              value={activeTerminalId || undefined}
              onValueChange={setActiveTerminal}
              className="w-full"
            >
              <TabsList className="bg-transparent p-0 gap-0.5">
                {sessionTerminals.map((terminal) => (
                  <TabsTrigger
                    key={terminal.id}
                    value={terminal.id}
                    style={{
                      boxShadow: "none",
                    }}
                    className={cn(
                      "h-full pr-1 text-xs data-[state=active]:text-foreground flex items-center gap-1.5 max-w-[120px]",
                      "transition-colors hover:bg-muted",
                      "border-b-2 border-b-transparent! data-[state=active]:border-b-primary! rounded-none cursor-pointer",
                    )}
                  >
                    <span className="truncate">{terminal.name}</span>
                    <span
                      onClick={(e) => handleCloseTerminal(e, terminal.id)}
                      className="rounded p-0.5 cursor-pointer hover:bg-muted-foreground/20"
                      role="button"
                      aria-label="close"
                    >
                      <VscClose />
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <span className="text-xs text-muted-foreground px-2">terminal</span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleCreateTerminal}
          >
            <VscAdd className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={togglePosition}
            aria-label={
              position === "bottom" ? "move to right" : "move to bottom"
            }
          >
            {position === "bottom" ? (
              <VscLayoutSidebarRight className="h-3.5 w-3.5" />
            ) : (
              <VscLayoutPanel className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={togglePanel}
            title={isPanelOpen ? "close" : "open"}
          >
            <VscChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-hidden relative">
        {sessionTerminals.length > 0 ? (
          sessionTerminals.map((terminal) => (
            <TerminalInstance
              key={terminal.id}
              terminal={terminal}
              isActive={terminal.id === activeTerminalId}
            />
          ))
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm mb-2">No terminal opened</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateTerminal}
                className="gap-1.5"
              >
                <VscAdd className="h-3.5 w-3.5" />
                Create terminal
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <ResizeHandle
        position={position}
        panelSize={panelSize}
        onResize={setPanelSize}
      />
    </div>
  );
}

interface TerminalInstanceProps {
  terminal: {
    id: string;
    name: string;
    cwd: string;
  };
  isActive: boolean;
}

function TerminalInstance({ terminal, isActive }: TerminalInstanceProps) {
  const { sendInput, clearOutput } = useSelectorTerminalStore([
    "sendInput",
    "clearOutput",
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermWriteRef = useRef<((data: string) => void) | null>(null);
  const xtermClearRef = useRef<(() => void) | null>(null);

  // Listen for terminal output
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    const setupListener = async () => {
      unlisten = await listen<{ terminalId: string; data: string }>(
        "terminal:output",
        (event) => {
          if (isCancelled) return;
          const { terminalId, data } = event.payload;
          if (terminalId === terminal.id && xtermWriteRef.current) {
            // Strip bracketed paste mode enable/disable sequences
            // to keep bracketed paste permanently disabled
            const filtered = data.replace(/\x1b\[\?2004[hl]/g, "");
            if (filtered) {
              xtermWriteRef.current(filtered);
            }
          }
        },
      );
    };

    setupListener();

    return () => {
      isCancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [terminal.id]);

  const handleData = useCallback(
    async (data: string) => {
      await sendInput(terminal.id, data);
    },
    [terminal.id, sendInput],
  );

  const handleClear = useCallback(() => {
    clearOutput(terminal.id);
    xtermClearRef.current?.();
  }, [terminal.id, clearOutput]);

  const handleXtermReady = useCallback(
    (write: (data: string) => void, clear: () => void) => {
      xtermWriteRef.current = write;
      xtermClearRef.current = clear;
    },
    [],
  );

  return (
    <div
      ref={terminalRef}
      className={cn("h-full flex flex-col", !isActive && "hidden")}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/20 border-b text-xs">
        <span className="text-muted-foreground truncate" title={terminal.cwd}>
          {terminal.cwd}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={handleClear}
          title="clear"
        >
          <AiOutlineClear className="h-3 w-3" />
        </Button>
      </div>

      {/* Xterm Terminal */}
      <div className="flex-1 overflow-hidden p-2">
        <XtermTerminal
          terminalId={terminal.id}
          isActive={isActive}
          onData={handleData}
          onReady={handleXtermReady}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

interface ResizeHandleProps {
  position: "right" | "bottom";
  panelSize: number;
  onResize: (size: number) => void;
}

function ResizeHandle({ position, panelSize, onResize }: ResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(panelSize);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startPosRef.current = position === "right" ? e.clientX : e.clientY;
      startSizeRef.current = panelSize;
    },
    [position, panelSize],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = position === "right" ? e.clientX : e.clientY;
      const delta = startPosRef.current - currentPos;

      if (position === "right") {
        onResize(Math.max(200, Math.min(800, startSizeRef.current + delta)));
      } else {
        onResize(Math.max(100, Math.min(600, startSizeRef.current + delta)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, position, onResize]);

  return (
    <div
      className={cn(
        "hover:bg-primary/20 transition-colors",
        position === "right"
          ? "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize"
          : "absolute top-0 left-0 right-0 h-1 cursor-row-resize",
      )}
      onMouseDown={handleMouseDown}
    />
  );
}
