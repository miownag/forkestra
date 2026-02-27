import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useSelectorTerminalStore,
  useSelectorSessionStore,
  useSessionLayoutStore,
  useScmStore,
} from "@/stores";
import { ChatWindow } from "@/components/chat/chat-window";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ActionToolbar } from "@/components/toolbar/action-toolbar";
import { FileTree } from "@/components/file-system/file-tree";
import { FileViewer } from "@/components/file-system/file-viewer";
import { ScmPanel } from "@/components/scm/scm-panel";
import { ScmDiffViewer } from "@/components/scm/scm-diff-viewer";
import { ConflictResolver } from "@/components/scm/conflict-resolver";
import { LuGitBranch, LuFolderOpen, LuFolderTree } from "react-icons/lu";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Driving, Refresh } from "iconsax-reactjs";
import { toast } from "sonner";

interface SessionTabContentProps {
  sessionId: string;
  isActive: boolean;
}

function SessionTabContent({ sessionId, isActive }: SessionTabContentProps) {
  const { position } = useSelectorTerminalStore(["position"]);
  const { sessions, creatingSessions, sessionErrors } = useSelectorSessionStore(
    ["sessions", "creatingSessions", "sessionErrors"],
  );
  const {
    getLayout,
    toggleFileTree,
    setFileViewerMode,
    closeFileViewer,
    setFileViewerContext,
  } = useSessionLayoutStore();
  const scmStatus = useScmStore((s) => s.statuses[sessionId]);

  const session = sessions.find((s) => s.id === sessionId);
  const isCreating =
    session?.status === "creating" || creatingSessions.has(sessionId);

  const layout = getLayout(sessionId);
  const {
    showFileTree,
    showFileViewer,
    selectedFile,
    fileViewerMode,
    leftPanelMode,
    fileViewerContext,
  } = layout;

  const repoPath = session
    ? session.is_local
      ? session.project_path
      : session.worktree_path
    : "";

  if (!session) return null;

  return (
    <div
      className={cn(
        "flex-1 flex h-full overflow-hidden",
        !isActive && "hidden",
      )}
    >
      {(() => {
        const isMultiPanel = showFileTree || (showFileViewer && selectedFile);
        return (
          <ResizablePanelGroup
            orientation="horizontal"
            className={cn("w-full", isMultiPanel && "gap-1 p-1")}
          >
            {/* Left: File Tree or SCM Panel (conditional) */}
            {showFileTree && (
              <>
                <ResizablePanel
                  defaultSize="10%"
                  minSize="10%"
                  maxSize="15%"
                  className="rounded-lg overflow-hidden border"
                >
                  {leftPanelMode === "scm" ? (
                    <ScmPanel sessionId={session.id} repoPath={repoPath} />
                  ) : (
                    <FileTree
                      projectPath={session.project_path}
                      sessionId={session.id}
                    />
                  )}
                </ResizablePanel>
                <ResizableHandle className="w-0 bg-transparent after:w-0.5 data-[separator=hover]:after:bg-primary data-[separator=active]:after:bg-primary after:rounded-full after:delay-200" />
              </>
            )}

            {/* Middle: Chat Area (always visible) */}
            <ResizablePanel
              defaultSize="40%"
              minSize="40%"
              maxSize="50%"
              className={cn(
                isMultiPanel && "rounded-lg overflow-hidden border",
              )}
            >
              <div
                className="flex flex-col h-full w-full"
                style={{
                  flexDirection: position === "right" ? "row" : "column",
                }}
              >
                {/* Chat Area */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                  {/* Session Header */}
                  <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/20 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* File Tree Toggle Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 shrink-0 [&_svg]:size-4.5 rounded-md opacity-60"
                        onClick={() => toggleFileTree(session.id)}
                        title="Toggle file tree"
                      >
                        <LuFolderTree />
                      </Button>

                      <div className="min-w-0">
                        <h2
                          className="font-medium text-sm truncate"
                          title={session.name}
                        >
                          {session.name}
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <LuGitBranch className="size-3" />
                            {session.branch_name || "-"}
                            <SyncButton projectPath={session.project_path} />
                          </span>
                          <span
                            className="flex items-center gap-1 truncate"
                            title={session.project_path || "-"}
                          >
                            <LuFolderOpen className="size-3 shrink-0" />
                            <span
                              className="truncate"
                              title={session.project_path.split("/").pop()}
                            >
                              {session.project_path.split("/").pop() || "-"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Action Toolbar */}
                      <ActionToolbar
                        sessionId={session.id}
                        sessionCwd={session.worktree_path}
                      />

                      {session.status === "error" &&
                      sessionErrors[session.id] ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-600 cursor-default">
                                Error
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              className="max-w-sm bg-destructive text-destructive-foreground"
                            >
                              {sessionErrors[session.id].message}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            session.status === "active"
                              ? "bg-green-500/10 text-green-600"
                              : session.status === "error"
                                ? "bg-red-500/10 text-red-600"
                                : isCreating
                                  ? "bg-yellow-500/10 text-yellow-600"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {session.status === "active"
                            ? "Active"
                            : isCreating
                              ? "Creating..."
                              : session.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chat Window */}
                  <ChatWindow sessionId={session.id} isActive={isActive} />
                </div>

                {/* Terminal Panel */}
                <TerminalPanel
                  sessionId={session.id}
                  sessionCwd={session.worktree_path}
                  isVisible={isActive}
                />
              </div>
            </ResizablePanel>

            {/* Right: File Viewer / Diff / Conflict (conditional) */}
            {showFileViewer && selectedFile && (
              <>
                <ResizableHandle className="w-0 bg-transparent after:w-0.5 data-[separator=hover]:after:bg-primary data-[separator=active]:after:bg-primary after:rounded-full after:delay-200" />
                <ResizablePanel
                  defaultSize="50%"
                  minSize="40%"
                  maxSize="50%"
                  className="rounded-lg overflow-hidden border"
                >
                  {fileViewerContext === "conflict" ? (
                    <ConflictResolver
                      sessionId={session.id}
                      repoPath={repoPath}
                      filePath={selectedFile}
                      onClose={() => closeFileViewer(session.id)}
                      onResolved={() => {
                        setFileViewerContext(session.id, "file");
                        closeFileViewer(session.id);
                      }}
                    />
                  ) : fileViewerContext === "diff" ? (
                    <ScmDiffViewer
                      sessionId={session.id}
                      repoPath={repoPath}
                      filePath={selectedFile}
                      staged={
                        scmStatus?.staged.some(
                          (f) => f.path === selectedFile,
                        ) ?? false
                      }
                      onClose={() => closeFileViewer(session.id)}
                    />
                  ) : (
                    <FileViewer
                      sessionId={session.id}
                      projectPath={session.project_path}
                      filePath={selectedFile}
                      mode={fileViewerMode}
                      onModeChange={(mode) =>
                        setFileViewerMode(session.id, mode)
                      }
                      onClose={() => closeFileViewer(session.id)}
                    />
                  )}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        );
      })()}
    </div>
  );
}

export function SessionPanel() {
  const { openTabIds, activeSessionId, sessions } = useSelectorSessionStore([
    "openTabIds",
    "activeSessionId",
    "sessions",
  ]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  if (!activeSession) {
    return (
      <div className="h-full flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center max-w-md px-4">
          <Driving className="size-24 mx-auto mb-6 opacity-20" />
          <h2 className="text-lg font-medium mb-2">No Session Selected</h2>
          <p className="text-sm">
            Create a new session or select an existing one from the sidebar to
            start coding with AI assistance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {openTabIds.map((tabId) => (
        <SessionTabContent
          key={tabId}
          sessionId={tabId}
          isActive={tabId === activeSessionId}
        />
      ))}
    </>
  );
}

// Sync button component
interface SyncButtonProps {
  projectPath: string;
}

function SyncButton({ projectPath }: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<{
    ahead: number;
    behind: number;
  } | null>(null);

  // Check status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [ahead, behind] = await invoke<[number, number]>("git_status", {
          projectPath,
        });
        setStatus({ ahead, behind });
      } catch {
        setStatus(null);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [projectPath]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await invoke<string>("git_sync", { projectPath });
      toast.success(result);
      // Refresh status
      const [ahead, behind] = await invoke<[number, number]>("git_status", {
        projectPath,
      });
      setStatus({ ahead, behind });
    } catch (err) {
      console.error("Failed to sync:", err);
      toast.error(`Sync failed: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePull = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await invoke<string>("git_pull", { projectPath });
      toast.success(result);
      // Refresh status
      const [ahead, behind] = await invoke<[number, number]>("git_status", {
        projectPath,
      });
      setStatus({ ahead, behind });
    } catch (err) {
      console.error("Failed to pull:", err);
      toast.error(`Pull failed: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePush = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await invoke<string>("git_push", { projectPath });
      toast.success(result);
      // Refresh status
      const [ahead, behind] = await invoke<[number, number]>("git_status", {
        projectPath,
      });
      setStatus({ ahead, behind });
    } catch (err) {
      console.error("Failed to push:", err);
      toast.error(`Push failed: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <span className="flex items-center gap-0.5">
      {/* Pull button - show when behind > 0 */}
      {status && status.behind > 0 && (
        <button
          onClick={handlePull}
          disabled={isSyncing}
          className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-muted transition-colors text-blue-600 dark:text-blue-400 cursor-pointer"
          title={`Pull ${status.behind} commits`}
        >
          <span className="text-[10px] leading-none">↓</span>
          <span className="text-[10px] leading-none">{status.behind}</span>
        </button>
      )}

      {/* Push button - show when ahead > 0 */}
      {status && status.ahead > 0 && (
        <button
          onClick={handlePush}
          disabled={isSyncing}
          className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-muted transition-colors text-green-600 dark:text-green-400 cursor-pointer"
          title={`Push ${status.ahead} commits`}
        >
          <span className="text-[10px] leading-none">↑</span>
          <span className="text-[10px] leading-none">{status.ahead}</span>
        </button>
      )}

      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className={cn(
          "p-0.5 rounded hover:bg-muted transition-colors cursor-pointer",
          isSyncing && "animate-spin",
        )}
        title="Sync with remote"
      >
        <Refresh className="size-3" />
      </button>
    </span>
  );
}
