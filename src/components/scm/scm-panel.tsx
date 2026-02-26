import { useState, useEffect, useCallback } from "react";
import { useScmStore, useSessionLayoutStore } from "@/stores";
import { ScmFileGroup } from "./scm-file-group";
import { ScmMergeBar } from "./scm-merge-bar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LuCheck } from "react-icons/lu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeftPanelHeader } from "@/components/ui/left-panel-header";

interface ScmPanelProps {
  sessionId: string;
  repoPath: string;
}

export function ScmPanel({ sessionId, repoPath }: ScmPanelProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);

  const {
    statuses,
    loading,
    fetchScmStatus,
    stageFile,
    unstageFile,
    stageAll,
    discardFile,
    commit,
    abortMerge,
    abortRebase,
    continueMerge,
    continueRebase,
  } = useScmStore();

  const { selectFile, setFileViewerContext, getLayout } =
    useSessionLayoutStore();

  const status = statuses[sessionId];
  const isLoading = loading[sessionId];
  const selectedFile = getLayout(sessionId).selectedFile;

  // Poll SCM status every 3 seconds
  const refreshStatus = useCallback(() => {
    fetchScmStatus(sessionId, repoPath);
  }, [sessionId, repoPath, fetchScmStatus]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      await commit(sessionId, repoPath, commitMessage.trim());
      setCommitMessage("");
      toast.success("Committed successfully");
    } catch (err) {
      toast.error(`Commit failed: ${err}`);
    } finally {
      setCommitting(false);
    }
  };

  const handleFileClick = (filePath: string, isConflict: boolean) => {
    selectFile(sessionId, filePath);
    setFileViewerContext(sessionId, isConflict ? "conflict" : "diff");
  };

  const handleAbort = async () => {
    try {
      if (status?.merge_in_progress) {
        await abortMerge(sessionId, repoPath);
        toast.success("Merge aborted");
      } else if (status?.rebase_in_progress) {
        await abortRebase(sessionId, repoPath);
        toast.success("Rebase aborted");
      }
    } catch (err) {
      toast.error(`Abort failed: ${err}`);
    }
  };

  const handleContinue = async () => {
    try {
      if (status?.merge_in_progress) {
        await continueMerge(sessionId, repoPath);
        toast.success("Merge completed");
      } else if (status?.rebase_in_progress) {
        await continueRebase(sessionId, repoPath);
        toast.success("Rebase completed");
      }
    } catch (err) {
      toast.error(`Continue failed: ${err}`);
    }
  };

  const handleStageAll = async () => {
    try {
      await stageAll(sessionId, repoPath);
    } catch (err) {
      toast.error(`Stage all failed: ${err}`);
    }
  };

  const totalChanges =
    (status?.staged.length ?? 0) +
    (status?.unstaged.length ?? 0) +
    (status?.untracked.length ?? 0) +
    (status?.conflicts.length ?? 0);

  const canCommit =
    (status?.staged.length ?? 0) > 0 &&
    (status?.conflicts.length ?? 0) === 0 &&
    commitMessage.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      <LeftPanelHeader
        sessionId={sessionId}
        mode="scm"
        label={status?.branch_name ?? "..."}
        onRefresh={refreshStatus}
        isRefreshing={isLoading}
      />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-1">
          {/* Merge/Rebase bar */}
          {(status?.merge_in_progress || status?.rebase_in_progress) && (
            <ScmMergeBar
              type={status.merge_in_progress ? "merge" : "rebase"}
              conflictCount={status.conflicts.length}
              onAbort={handleAbort}
              onContinue={handleContinue}
            />
          )}

          {/* Commit area */}
          <div className="px-2 pt-1">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message..."
              className="w-full text-xs resize-none border rounded-md p-2 bg-background outline-none focus:ring-1 focus:ring-ring min-h-14"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleCommit();
                }
              }}
              autoCapitalize="off"
              autoComplete="off"
            />
            <Button
              size="sm"
              className="h-6 text-xs w-full mt-1 [&_svg]:size-3"
              disabled={!canCommit || committing}
              onClick={handleCommit}
            >
              <LuCheck />
              Commit
            </Button>
          </div>

          {/* File groups */}
          {totalChanges === 0 && !isLoading && (
            <div className="text-xs text-muted-foreground text-center py-8">
              No changes
            </div>
          )}

          <ScmFileGroup
            title="Merge Conflicts"
            count={status?.conflicts.length ?? 0}
            files={status?.conflicts ?? []}
            group="conflicts"
            defaultOpen
            selectedFile={selectedFile}
            onFileClick={(path) => handleFileClick(path, true)}
          />

          <ScmFileGroup
            title="Staged Changes"
            count={status?.staged.length ?? 0}
            files={status?.staged ?? []}
            group="staged"
            defaultOpen
            selectedFile={selectedFile}
            onUnstageFile={(path) => unstageFile(sessionId, repoPath, path)}
            onFileClick={(path) => handleFileClick(path, false)}
          />

          <ScmFileGroup
            title="Changes"
            count={status?.unstaged.length ?? 0}
            files={status?.unstaged ?? []}
            group="unstaged"
            defaultOpen
            selectedFile={selectedFile}
            onStageAll={handleStageAll}
            onStageFile={(path) => stageFile(sessionId, repoPath, path)}
            onDiscardFile={(path) => discardFile(sessionId, repoPath, path)}
            onFileClick={(path) => handleFileClick(path, false)}
          />

          <ScmFileGroup
            title="Untracked"
            count={status?.untracked.length ?? 0}
            files={status?.untracked ?? []}
            group="untracked"
            defaultOpen={false}
            selectedFile={selectedFile}
            onStageAll={handleStageAll}
            onStageFile={(path) => stageFile(sessionId, repoPath, path)}
            onFileClick={(path) => handleFileClick(path, false)}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
