import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useSessionStore, useProviderStore } from "@/stores";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderType } from "@/types";
import { VscFolder } from "react-icons/vsc";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewSessionDialog({
  open,
  onOpenChange,
}: NewSessionDialogProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderType>("claude");
  const [projectPath, setProjectPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useSessionStore((s) => s.createSession);
  const providers = useProviderStore((s) => s.providers);
  const installedProviders = providers.filter((p) => p.installed);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        defaultPath: "/Users",
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });
      if (selected) {
        setProjectPath(selected as string);
      }
    } catch (err) {
      console.error("Failed to open folder dialog:", err);
    }
  };

  const handleCreate = async () => {
    if (!name || !projectPath || !provider) return;

    setIsCreating(true);
    setError(null);
    try {
      await createSession({
        name,
        provider,
        project_path: projectPath,
        base_branch: baseBranch || undefined,
      });
      onOpenChange(false);
      // Reset form
      setName("");
      setProjectPath("");
      setBaseBranch("");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Start a new AI coding session with an isolated git worktree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="name">Session Name</Label>
            <Input
              id="name"
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Feature: Add login page"
            />
          </div>

          <div>
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as ProviderType)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {installedProviders.map((p) => (
                  <SelectItem key={p.provider_type} value={p.provider_type}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="projectPath">Project Directory</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="projectPath"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSelectFolder}
              >
                <VscFolder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Must be a git repository
            </p>
          </div>

          <div>
            <Label htmlFor="baseBranch">Base Branch (optional)</Label>
            <Input
              id="baseBranch"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Leave empty to use the default branch
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name || !projectPath}
          >
            {isCreating ? "Creating..." : "Create Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
