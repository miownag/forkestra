import { useState, useEffect, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  useSelectorSettingsStore,
  useSelectorProviderStore,
  useSelectorSessionStore,
  useSelectorMcpStore,
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

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { BranchSearchSelect } from "./branch-search-select";
import type { McpServerConfig, ProviderType } from "@/types";
import { LuFolderGit2 } from "react-icons/lu";
import { PROVIDER_ICONS_MAP, ProviderCombineIcon } from "@/constants/icons";
import { cn } from "@/lib/utils";
import { ArrowDown2, CloseCircle, AddCircle } from "iconsax-reactjs";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: {
    provider?: ProviderType;
    projectPath?: string;
    useLocal?: boolean;
    baseBranch?: string;
  };
}

export function NewSessionDialog({
  open,
  onOpenChange,
  defaultValues,
}: NewSessionDialogProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>("claude");
  const [projectPath, setProjectPath] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [useLocal, setUseLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [excludedMcpIds, setExcludedMcpIds] = useState<Set<string>>(new Set());
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const { createSession } = useSelectorSessionStore(["createSession"]);
  const { providers } = useSelectorProviderStore(["providers"]);
  const { fetchServersForDirectory } = useSelectorMcpStore(["fetchServersForDirectory"]);
  const { defaultProjectPath, defaultWorkMode } = useSelectorSettingsStore([
    "defaultProjectPath",
    "defaultWorkMode",
  ]);

  // Update form values when dialog opens
  useEffect(() => {
    if (open) {
      const installed = providers.filter((p) => p.installed);
      const defaultProvider = installed[0]?.provider_type ?? "claude";
      // Apply default values if provided, otherwise use settings defaults
      setProvider(defaultValues?.provider || defaultProvider);
      setProjectPath(defaultValues?.projectPath || "");
      setBaseBranch(defaultValues?.baseBranch || "");
      setUseLocal(defaultValues?.useLocal ?? defaultWorkMode === "local");
      setMcpServers([]);
      setExcludedMcpIds(new Set());
      setMcpOpen(false);
    }
  }, [open, defaultValues, defaultWorkMode, providers]);

  // Fetch MCP servers when projectPath changes
  useEffect(() => {
    if (!projectPath.trim()) {
      setMcpServers([]);
      setExcludedMcpIds(new Set());
      return;
    }

    let cancelled = false;
    setMcpLoading(true);
    fetchServersForDirectory(projectPath).then((servers) => {
      if (!cancelled) {
        setMcpServers(servers);
        setExcludedMcpIds(new Set());
        setMcpLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectPath, fetchServersForDirectory]);

  const handleExcludeMcp = useCallback((id: string) => {
    setExcludedMcpIds((prev) => new Set([...prev, id]));
  }, []);

  const handleRestoreMcp = useCallback((id: string) => {
    setExcludedMcpIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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

    setError(null);

    // Close dialog immediately
    onOpenChange(false);

    // Reset form
    setName("");
    setProjectPath("");
    setBaseBranch("");
    setUseLocal(false);
    setMcpServers([]);
    setExcludedMcpIds(new Set());

    // Create session in background - errors will be shown in the session
    try {
      await createSession({
        name: name.trim() || "New Session",
        provider,
        project_path: projectPath,
        base_branch: useLocal ? undefined : baseBranch || undefined,
        use_local: useLocal,
        fetch_first: true,
        excluded_mcp_ids: Array.from(excludedMcpIds),
      });
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setError(null);
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

        <div className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="provider">AI Provider</Label>
            <div className="flex w-fit items-center gap-1 mt-2 p-1 rounded-full border border-border/60 bg-muted/30">
              {installedProviders.map((p) => {
                const Icon = PROVIDER_ICONS_MAP[p.provider_type as keyof typeof PROVIDER_ICONS_MAP];
                const isSelected = provider === p.provider_type;
                return (
                  <button
                    key={p.provider_type}
                    type="button"
                    onClick={() => setProvider(p.provider_type)}
                    className={cn(
                      "flex items-center justify-center h-9 rounded-full transition-all duration-200 ease-out",
                      isSelected
                        ? "px-3 bg-background shadow-sm"
                        : "px-1 cursor-pointer hover:bg-background"
                    )}
                    title={p.provider_type}
                  >
                    {isSelected ? (
                      <span className="px-2 flex items-center justify-center">
                        {Icon ? (
                          <ProviderCombineIcon
                            icon={Icon}
                            className="flex items-center gap-1"
                            size={18}
                            type="color"
                          />
                        ) : (
                          <span className="text-xs font-medium">{p.name}</span>
                        )}
                      </span>
                    ) : (
                      <span className="px-2 flex items-center justify-center">
                        {Icon ? (
                          <Icon.Avatar size={20} />
                        ) : (
                          <span className="text-xs">{p.name.charAt(0)}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
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
                <LuFolderGit2 />
              </Button>
            </div>
            {!useLocal && (
              <p className="text-xs text-muted-foreground mt-2">
                Must be a git repository
              </p>
            )}
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
                  includeRemote
                  placeholder="Select base branch..."
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Leave empty to use the default branch
              </p>
            </div>
          )}

          {/* MCP Settings */}
          {projectPath.trim() && mcpServers.length > 0 && (
            <Collapsible open={mcpOpen} onOpenChange={setMcpOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 cursor-pointer group">
                <ArrowDown2
                  size={14}
                  className={cn(
                    "text-muted-foreground transition-transform duration-200",
                    !mcpOpen && "-rotate-90"
                  )}
                />
                <span className="text-sm font-medium">MCP Servers</span>
                <Badge variant="secondary" className="text-[0.6rem] px-1.5 py-0 font-medium">
                  {mcpServers.length - excludedMcpIds.size}/{mcpServers.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1.5">
                  {mcpLoading ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      Loading MCP servers...
                    </p>
                  ) : (
                    mcpServers.map((server) => {
                      const isExcluded = excludedMcpIds.has(server.id);
                      return (
                        <div
                          key={server.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm",
                            isExcluded && "opacity-40"
                          )}
                        >
                          <span className="flex-1 truncate">{server.name}</span>
                          <span className="shrink-0 text-[0.6rem] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
                            {server.transport.type === "stdio" ? "Stdio" : server.transport.type.toUpperCase()}
                          </span>
                          {server.globally_available && (
                            <span className="shrink-0 text-[0.6rem] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
                              Global
                            </span>
                          )}
                          {isExcluded ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 [&_svg]:size-3.5 shrink-0"
                              onClick={() => handleRestoreMcp(server.id)}
                            >
                              <AddCircle />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 [&_svg]:size-3.5 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleExcludeMcp(server.id)}
                            >
                              <CloseCircle />
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!projectPath}>
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
