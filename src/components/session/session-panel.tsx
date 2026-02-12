import { useSelectorTerminalStore, useSelectorSessionStore } from "@/stores";
import { ChatWindow } from "@/components/chat/chat-window";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { ActionToolbar } from "@/components/toolbar/action-toolbar";
import { VscFolderOpened } from "react-icons/vsc";
import { LuGitBranch } from "react-icons/lu";
import { cn } from "@/lib/utils";

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

  const session = sessions.find((s) => s.id === sessionId);
  const isCreating =
    session?.status === "creating" || creatingSessions.has(sessionId);

  if (!session) return null;

  return (
    <div
      className={cn(
        "flex-1 flex h-full overflow-hidden",
        !isActive && "hidden"
      )}
    >
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
                <h2 className="font-medium text-sm truncate">{session.name}</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <LuGitBranch className="h-3 w-3" />
                    {session.branch_name || "-"}
                  </span>
                  <span
                    className="flex items-center gap-1 truncate"
                    title={session.project_path || "-"}
                  >
                    <VscFolderOpened className="h-3 w-3 shrink-0" />
                    <span className="truncate">
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
              <span className="text-xs text-muted-foreground">
                {session.provider === "claude" ? "Claude Code" : "Kimi Code"}
              </span>
            </div>
          </div>

          {/* Chat Window */}
          <ChatWindow sessionId={session.id} />
        </div>

        {/* Terminal Panel */}
        <TerminalPanel
          sessionId={session.id}
          sessionCwd={session.worktree_path}
          isVisible={isActive}
        />
      </div>
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
