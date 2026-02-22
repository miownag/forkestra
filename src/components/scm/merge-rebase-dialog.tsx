import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BranchSearchSelect } from "@/components/session/branch-search-select";
import { useScmStore } from "@/stores";
import { toast } from "sonner";
import type { MergeRebaseResult } from "@/types";
import { LuGitBranch } from "react-icons/lu";

type Direction = "update_from" | "merge_to";
type Method = "merge" | "rebase";

interface MergeRebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  projectPath: string;
  repoPath: string;
  currentBranch: string;
  isLocal: boolean;
  onResult?: (result: MergeRebaseResult, direction: Direction) => void;
}

export function MergeRebaseDialog({
  open,
  onOpenChange,
  sessionId,
  projectPath,
  repoPath,
  currentBranch,
  isLocal,
  onResult,
}: MergeRebaseDialogProps) {
  const [direction, setDirection] = useState<Direction>("update_from");
  const [method, setMethod] = useState<Method>("merge");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);

  const { mergeFrom, rebaseOnto, mergeTo } = useScmStore();

  const handleStart = async () => {
    if (!branch) return;
    setLoading(true);
    try {
      let result: MergeRebaseResult;

      if (direction === "update_from") {
        if (method === "merge") {
          result = await mergeFrom(sessionId, repoPath, branch);
        } else {
          result = await rebaseOnto(sessionId, repoPath, branch);
        }
      } else {
        result = await mergeTo(sessionId, projectPath, branch);
      }

      // Handle result
      if (result === "success") {
        toast.success(
          direction === "update_from"
            ? `Updated from ${branch}`
            : `Merged to ${branch}`
        );
      } else if (result === "up_to_date") {
        toast.info("Already up to date");
      } else if (typeof result === "object" && "conflicts" in result) {
        toast.warning(
          `${result.conflicts.length} conflict(s) need resolution`
        );
      }

      onResult?.(result, direction);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Operation failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const directionLabel =
    direction === "update_from"
      ? `${method === "merge" ? "Merge" : "Rebase"} ${branch || "..."} → ${currentBranch}`
      : `Merge ${currentBranch} → ${branch || "..."}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge / Rebase</DialogTitle>
          <DialogDescription>
            Update your session branch or merge changes to another branch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Direction */}
          <div className="grid gap-2">
            <Label className="text-sm">Direction</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as Direction)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="update_from">Update from branch</SelectItem>
                {!isLocal && (
                  <SelectItem value="merge_to">Merge to branch</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Method (only for update_from) */}
          {direction === "update_from" && (
            <div className="grid gap-2">
              <Label className="text-sm">Method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as Method)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge</SelectItem>
                  <SelectItem value="rebase">Rebase</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Branch */}
          <div className="grid gap-2">
            <Label className="text-sm">Branch</Label>
            <BranchSearchSelect
              projectPath={projectPath}
              value={branch}
              onChange={setBranch}
              includeRemote
              placeholder="Select branch..."
            />
          </div>

          {/* Preview */}
          {branch && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 flex items-center gap-2">
              <LuGitBranch className="size-3 shrink-0" />
              <span>{directionLabel}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!branch || loading}>
            {loading ? "Working..." : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
