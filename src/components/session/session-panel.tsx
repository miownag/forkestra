import {
  useSelectorTerminalStore,
  useSelectorSessionStore,
  useSessionLayoutStore,
} from "@/stores";
import { ChatWindow } from "@/components/chat/chat-window";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ActionToolbar } from "@/components/toolbar/action-toolbar";
import { FileTree } from "@/components/file-system/file-tree";
import { FileViewer } from "@/components/file-system/file-viewer";
import { LuGitBranch, LuFolderOpen, LuFolderTree } from "react-icons/lu";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";

interface SessionTabContentProps {
  sessionId: string;
  isActive: boolean;
}

function SessionTabContent({ sessionId, isActive }: SessionTabContentProps) {
  const { position } = useSelectorTerminalStore(["position"]);
  const { sessions, creatingSessions } = useSelectorSessionStore([
    "sessions",
    "creatingSessions",
  ]);
  const { getLayout, toggleFileTree, setFileViewerMode, closeFileViewer } =
    useSessionLayoutStore();

  const session = sessions.find((s) => s.id === sessionId);
  const isCreating =
    session?.status === "creating" || creatingSessions.has(sessionId);

  const layout = getLayout(sessionId);
  const { showFileTree, showFileViewer, selectedFile, fileViewerMode } = layout;

  if (!session) return null;

  return (
    <div
      className={cn(
        "flex-1 flex h-full overflow-hidden",
        !isActive && "hidden"
      )}
    >
      <ResizablePanelGroup orientation="horizontal" className="w-full">
        {/* Left: File Tree (conditional) */}
        {showFileTree && (
          <>
            <ResizablePanel defaultSize="10%" minSize="10%" maxSize="15%">
              <FileTree
                projectPath={session.project_path}
                sessionId={session.id}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        {/* Middle: Chat Area (always visible) */}
        <ResizablePanel defaultSize="40%" minSize="40%" maxSize="50%">
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
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => toggleFileTree(session.id)}
                    title="Toggle file tree"
                  >
                    <LuFolderTree className="h-4 w-4" />
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
                        <LuGitBranch className="h-3 w-3" />
                        {session.branch_name || "-"}
                      </span>
                      <span
                        className="flex items-center gap-1 truncate"
                        title={session.project_path || "-"}
                      >
                        <LuFolderOpen className="h-3 w-3 shrink-0" />
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

                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      session.status === "active"
                        ? "bg-green-500/10 text-green-600"
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

        {/* Right: File Viewer (conditional) */}
        {showFileViewer && selectedFile && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%" minSize="40%" maxSize="50%">
              <FileViewer
                sessionId={session.id}
                projectPath={session.project_path}
                filePath={selectedFile}
                mode={fileViewerMode}
                onModeChange={(mode) => setFileViewerMode(session.id, mode)}
                onClose={() => closeFileViewer(session.id)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
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
          <LuGitBranch className="h-24 w-24 mx-auto mb-6 opacity-20" />
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
