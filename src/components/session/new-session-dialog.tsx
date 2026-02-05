import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  useSelectorSettingsStore,
  useSelectorProviderStore,
  useSelectorSessionStore,
} from "@/stores";
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
import { Switch } from "@/components/ui/switch";
import { BranchSearchSelect } from "./branch-search-select";
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
  const [useLocal, setUseLocal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createSession } = useSelectorSessionStore(["createSession"]);
  const { providers } = useSelectorProviderStore(["providers"]);
  const { defaultProjectPath } = useSelectorSettingsStore([
    "defaultProjectPath",
  ]);

  const installedProviders = providers.filter((p) => p.installed);

  const handleSelectFolder = async () => {
    try {
      const home = await homeDir();
      const selected = await openDialog({
        defaultPath: defaultProjectPath || home,
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
    if (!projectPath || !provider) return;

    setIsCreating(true);
    setError(null);
    try {
      await createSession({
        name: name.trim() || "New Session",
        provider,
        project_path: projectPath,
        base_branch: useLocal ? undefined : baseBranch || undefined,
        use_local: useLocal,
      });
      onOpenChange(false);
      // Reset form
      setName("");
      setProjectPath("");
      setBaseBranch("");
      setUseLocal(false);
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
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          e.preventDefault();
          return false;
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Start a new AI coding session with an isolated git work tree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="name">
              Session Name{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="name"
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Default is `New Session`"
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="useLocal">Local Mode</Label>
              <p className="text-xs text-muted-foreground">
                Use the project directory directly without creating a worktree
              </p>
            </div>
            <Switch
              id="useLocal"
              checked={useLocal}
              onCheckedChange={setUseLocal}
            />
          </div>

          {!useLocal && (
            <div>
              <Label htmlFor="baseBranch">Base Branch</Label>
              <div className="mt-2">
                <BranchSearchSelect
                  projectPath={projectPath}
                  value={baseBranch}
                  onChange={setBaseBranch}
                  placeholder="Select base branch..."
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Leave empty to use the default branch
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !projectPath}>
            {isCreating ? "Creating..." : "Create Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
