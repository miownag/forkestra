import { useSessionStore, useSelectorTerminalStore } from "@/stores";
import { ChatWindow } from "@/components/chat/chat-window";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ActionToolbar } from "@/components/toolbar/action-toolbar";
import { VscFolderOpened } from "react-icons/vsc";
import { LuGitBranch } from "react-icons/lu";

export function SessionPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const { position } = useSelectorTerminalStore(["position"]);

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
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Main Content Area */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{
          flexDirection: position === "right" ? "row" : "column",
        }}
      >
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Session Header */}
          <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <h2 className="font-medium text-sm truncate">{activeSession.name}</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <LuGitBranch className="h-3 w-3" />
                    {activeSession.branch_name || "-"}
                  </span>
                  <span
                    className="flex items-center gap-1 truncate"
                    title={activeSession.project_path || "-"}
                  >
                    <VscFolderOpened className="h-3 w-3 shrink-0" />
                    <span className="truncate">{activeSession.project_path.split("/").pop() || "-"}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Action Toolbar */}
              <ActionToolbar
                sessionId={activeSession.id}
                sessionCwd={activeSession.worktree_path}
              />

              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  activeSession.status === "active"
                    ? "bg-green-500/10 text-green-600"
                    : activeSession.status === "creating"
                      ? "bg-yellow-500/10 text-yellow-600"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {activeSession.status === "active"
                  ? "Active"
                  : activeSession.status === "creating"
                    ? "Creating..."
                    : activeSession.status}
              </span>
              <span className="text-xs text-muted-foreground">
                {activeSession.provider === "claude" ? "Claude Code" : "Kimi Code"}
              </span>
            </div>
          </div>

          {/* Chat Window */}
          <ChatWindow sessionId={activeSession.id} />
        </div>

        {/* Terminal Panel - render for all sessions to preserve xterm buffers */}
        {sessions.map((session) => (
          <TerminalPanel
            key={session.id}
            sessionId={session.id}
            sessionCwd={session.worktree_path}
            isVisible={session.id === activeSessionId}
          />
        ))}
      </div>
    </div>
  );
}
