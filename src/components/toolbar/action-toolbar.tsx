import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSelectorTerminalStore } from "@/stores/terminal-store";
import { useSessionLayoutStore } from "@/stores";
import { Code1, Discover, Hierarchy, Hierarchy2 } from "iconsax-reactjs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { MergeRebaseDialog } from "@/components/scm/merge-rebase-dialog";
import { PostMergeDialog } from "@/components/scm/post-merge-dialog";
import { useSelectorSessionStore, useSettingsStore } from "@/stores";
import type { MergeRebaseResult } from "@/types";

interface ActionToolbarProps {
  sessionId: string;
  sessionCwd: string;
}

export function ActionToolbar({ sessionId, sessionCwd }: ActionToolbarProps) {
  const { panelOpenSessions, togglePanel, getOrCreateTerminalForSession } =
    useSelectorTerminalStore([
      "panelOpenSessions",
      "togglePanel",
      "getOrCreateTerminalForSession",
    ]);

  const { getLayout, toggleFileTree, setLeftPanelMode } = useSessionLayoutStore();
  const { sessions } = useSelectorSessionStore(["sessions"]);
  const session = sessions.find((s) => s.id === sessionId);

  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showPostMergeDialog, setShowPostMergeDialog] = useState(false);

  const panelOpen = panelOpenSessions[sessionId] ?? false;

  const postMergeAction = useSettingsStore((s) => s.postMergeAction);
  const terminateSession = useSelectorSessionStore([
    "terminateSession",
  ]).terminateSession;

  const handleTerminalClick = async () => {
    if (!panelOpen) {
      await getOrCreateTerminalForSession(sessionId, sessionCwd);
    } else {
      togglePanel(sessionId);
    }
  };

  const handleScmClick = () => {
    const layout = getLayout(sessionId);
    if (layout.showFileTree && layout.leftPanelMode === "scm") {
      toggleFileTree(sessionId);
    } else {
      setLeftPanelMode(sessionId, "scm");
    }
  };

  const handleMergeResult = (result: MergeRebaseResult, direction: string) => {
    if (result === "success" && direction === "merge_to") {
      if (postMergeAction === "ask") {
        setShowPostMergeDialog(true);
      } else if (postMergeAction === "cleanup" && session) {
        terminateSession(session.id, true);
      }
      // "keep" — do nothing
    }
    if (typeof result === "object" && "conflicts" in result) {
      // Auto-open SCM panel on conflicts
      setLeftPanelMode(sessionId, "scm");
    }
  };

  const repoPath = session
    ? session.is_local
      ? session.project_path
      : session.worktree_path
    : "";

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 [&_svg]:size-4 rounded-md text-muted-foreground hover:text-foreground"
            onClick={handleScmClick}
          >
            <Hierarchy2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Source Control</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-md hover:text-foreground"
            onClick={() => setShowMergeDialog(true)}
          >
            <Hierarchy />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Merge / Rebase</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-8 h-8 shrink-0 [&_svg]:size-4.5 rounded-md",
              panelOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={handleTerminalClick}
          >
            <Code1 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open Terminal</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-md hover:text-foreground"
            onClick={() => {
              console.log("Browser clicked");
            }}
          >
            <Discover />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Preview</TooltipContent>
      </Tooltip>

      {/* Merge/Rebase Dialog */}
      {session && (
        <MergeRebaseDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          sessionId={session.id}
          projectPath={session.project_path}
          repoPath={repoPath}
          currentBranch={session.branch_name}
          isLocal={session.is_local}
          onResult={handleMergeResult}
        />
      )}

      {/* Post-Merge Dialog */}
      {session && (
        <PostMergeDialog
          open={showPostMergeDialog}
          onOpenChange={setShowPostMergeDialog}
          sessionName={session.name}
          onKeep={() => {}}
          onCleanup={() => terminateSession(session.id, true)}
        />
      )}
    </div>
  );
}
