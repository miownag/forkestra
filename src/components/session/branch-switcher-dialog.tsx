import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuCheck, LuGitBranch, LuPlus, LuArrowLeft } from "react-icons/lu";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelectorSessionStore } from "@/stores";
import type { Session } from "@/types";

interface BranchSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
  initialMode?: "list" | "create";
}

export function BranchSwitcherDialog({
  open,
  onOpenChange,
  session,
  initialMode = "list",
}: BranchSwitcherDialogProps) {
  const [mode, setMode] = useState<"list" | "create">(initialMode);
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [showRemote, setShowRemote] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [loading, setLoading] = useState(false);

  const { updateSessionBranch } = useSelectorSessionStore([
    "updateSessionBranch",
  ]);

  const repoPath = session.is_local
    ? session.project_path
    : session.worktree_path;

  const fetchBranches = useCallback(async () => {
    try {
      const localBranches = await invoke<string[]>("list_branches", {
        projectPath: session.project_path,
        includeRemote: false,
      });
      setBranches(localBranches);

      const allBranches = await invoke<string[]>("list_branches", {
        projectPath: session.project_path,
        includeRemote: true,
      });
      setRemoteBranches(
        allBranches.filter((b) => !localBranches.includes(b)),
      );
    } catch (error) {
      console.error("Failed to fetch branches:", error);
    }
  }, [session.project_path]);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setNewBranchName("");
      fetchBranches();
    }
  }, [open, initialMode, fetchBranches]);

  const handleSwitchBranch = async (branchName: string) => {
    if (branchName === session.branch_name) {
      onOpenChange(false);
      return;
    }

    setLoading(true);
    try {
      await invoke("git_checkout_branch", {
        repoPath,
        branchName,
      });
      await updateSessionBranch(session.id, branchName);
      toast.success(`Switched to branch "${branchName}"`);
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await invoke("git_create_branch", {
        repoPath,
        branchName: name,
        startPoint: null as string | null,
      });
      await updateSessionBranch(session.id, name);
      toast.success(`Created and switched to branch "${name}"`);
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRemoteBranch = (remoteBranch: string) => {
    // e.g. "origin/feature-x" → "feature-x"
    const localName = remoteBranch.includes("/")
      ? remoteBranch.split("/").slice(1).join("/")
      : remoteBranch;
    setNewBranchName(localName);
    setMode("create");
  };

  if (mode === "create") {
    return (
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Create Branch"
        description="Create a new git branch"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setMode("list")}
            >
              <LuArrowLeft className="size-4" />
            </Button>
            <h3 className="text-sm font-medium">Create new branch</h3>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) handleCreateBranch();
              }}
              autoFocus
            />
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || loading}
              size="sm"
            >
              Create
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Branch will be created from current HEAD
          </p>
        </div>
      </CommandDialog>
    );
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Switch Branch"
      description="Search and switch to a git branch"
    >
      <Command>
        <CommandInput placeholder="Search branches..." />
        <CommandList>
          <CommandEmpty>No branches found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              className="cursor-pointer"
              onSelect={() => setMode("create")}
            >
              <LuPlus className="size-4" />
              <span>Create new branch...</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Local Branches">
            {branches.map((branch) => (
              <CommandItem
                key={branch}
                className="cursor-pointer"
                onSelect={() => handleSwitchBranch(branch)}
                disabled={loading}
              >
                <LuGitBranch className="size-4" />
                <span className="truncate">{branch}</span>
                {branch === session.branch_name && (
                  <LuCheck className="ml-auto size-4 text-accent-foreground" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
          {remoteBranches.length > 0 && (
            <>
              <CommandSeparator />
              {showRemote ? (
                <CommandGroup heading="Remote Branches">
                  {remoteBranches.map((branch) => (
                    <CommandItem
                      key={branch}
                      className="cursor-pointer"
                      onSelect={() => handleSelectRemoteBranch(branch)}
                      disabled={loading}
                    >
                      <LuGitBranch className="size-4 text-muted-foreground" />
                      <span className="truncate text-muted-foreground">
                        {branch}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <CommandGroup>
                  <CommandItem
                    className="cursor-pointer text-muted-foreground"
                    onSelect={() => setShowRemote(true)}
                  >
                    Show remote branches ({remoteBranches.length})
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
