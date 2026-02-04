import { useSessionStore } from "@/stores";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { VscFolderOpened } from "react-icons/vsc";
import { LuGitBranch } from "react-icons/lu";

export function SessionPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Session Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-medium text-sm">{activeSession.name}</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <LuGitBranch className="h-3 w-3" />
                {activeSession.branch_name.split("/").pop()}
              </span>
              <span className="flex items-center gap-1">
                <VscFolderOpened className="h-3 w-3" />
                {activeSession.project_path.split("/").pop()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
  );
}
