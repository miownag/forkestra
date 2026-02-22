import { useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowDown2, CloseCircle } from "iconsax-reactjs";
import { LuFolderGit2 } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { useSelectorSettingsStore, useSelectorSessionStore } from "@/stores";
import type { SkillInstallOptions, CliResult } from "@/types";

interface SkillInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (options: SkillInstallOptions) => Promise<CliResult>;
}

const DEFAULT_OPTIONS: SkillInstallOptions = {
  source: "",
  global: true,
  yes: true,
  all: true,
  full_depth: false,
  copy: false,
};

export function SkillInstallDialog({
  open,
  onOpenChange,
  onInstall,
}: SkillInstallDialogProps) {
  const [options, setOptions] = useState<SkillInstallOptions>(DEFAULT_OPTIONS);
  const [agentInput, setAgentInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<CliResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { defaultProjectPath } = useSelectorSettingsStore([
    "defaultProjectPath",
  ]);
  const { sessions, activeSessionId } = useSelectorSessionStore([
    "sessions",
    "activeSessionId",
  ]);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const updateOption = useCallback(
    <K extends keyof SkillInstallOptions>(
      key: K,
      value: SkillInstallOptions[K]
    ) => {
      setOptions((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "all" && value === true) {
          next.yes = true;
        }
        return next;
      });
    },
    []
  );

  const addAgent = useCallback(() => {
    const trimmed = agentInput.trim();
    if (!trimmed) return;
    setOptions((prev) => ({
      ...prev,
      agent: [...(prev.agent ?? []), trimmed],
    }));
    setAgentInput("");
  }, [agentInput]);

  const removeAgent = useCallback((index: number) => {
    setOptions((prev) => ({
      ...prev,
      agent: prev.agent?.filter((_, i) => i !== index),
    }));
  }, []);

  const addSkillFilter = useCallback(() => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    setOptions((prev) => ({
      ...prev,
      skill: [...(prev.skill ?? []), trimmed],
    }));
    setSkillInput("");
  }, [skillInput]);

  const removeSkillFilter = useCallback((index: number) => {
    setOptions((prev) => ({
      ...prev,
      skill: prev.skill?.filter((_, i) => i !== index),
    }));
  }, []);

  // Project path for non-global installs
  const [projectPath, setProjectPath] = useState("");

  const handleSelectFolder = async () => {
    try {
      const home = await homeDir();
      const selected = await openDialog({
        defaultPath: activeSession?.project_path || defaultProjectPath || home,
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

  // When global changes to false, pre-fill project path from active session
  const handleGlobalChange = (global: boolean) => {
    updateOption("global", global);
    if (!global && !projectPath) {
      setProjectPath(activeSession?.project_path ?? "");
    }
  };

  const handleInstall = async () => {
    if (!options.source.trim()) return;
    setInstalling(true);
    setResult(null);
    try {
      const res = await onInstall({
        ...options,
        source: options.source.trim(),
        agent: options.agent?.length ? options.agent : undefined,
        skill: options.skill?.length ? options.skill : undefined,
        project_path: !options.global && projectPath ? projectPath : undefined,
      });
      setResult(res);
      if (res.exit_code === 0) {
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 1500);
      }
    } catch {
      // Error handled by store
    } finally {
      setInstalling(false);
    }
  };

  const resetForm = () => {
    setOptions(DEFAULT_OPTIONS);
    setAgentInput("");
    setSkillInput("");
    setProjectPath("");
    setResult(null);
    setAdvancedOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!installing) {
      onOpenChange(open);
      if (!open) resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install Skill</DialogTitle>
          <DialogDescription>
            <p>
              Install skills from a repository using{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                @vercel-labs/skills
              </code>{" "}
              .
            </p>
            <p>
              You can check the{" "}
              <a
                href="https://skills.sh/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                documentation
              </a>{" "}
              for more details.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* Source */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Source</Label>
            <Input
              value={options.source}
              onChange={(e) => updateOption("source", e.target.value)}
              placeholder="e.g. vercel-labs/agent-skills"
              className="font-mono text-sm"
              disabled={installing}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInstall();
              }}
            />
          </div>

          {/* Toggle options */}
          <div className="space-y-3">
            {/* Install all */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Install all</Label>
                <p className="text-xs text-muted-foreground">
                  Install all skills from the repository for all agents.
                </p>
              </div>
              <Switch
                checked={options.all}
                onCheckedChange={(v) => updateOption("all", v)}
                disabled={installing}
              />
            </div>

            {/* Skills & Agents - only shown when Install all is off */}
            {!options.all && (
              <>
                {/* Skills */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">
                    Skills{" "}
                    <span className="text-muted-foreground font-normal">
                      (--skill)
                    </span>
                  </Label>
                  {options.skill && options.skill.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {options.skill.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary"
                        >
                          {s}
                          <button
                            onClick={() => removeSkillFilter(i)}
                            className="hover:text-destructive transition-colors"
                            disabled={installing}
                          >
                            <CloseCircle className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      placeholder="e.g. frontend-design"
                      className="font-mono text-sm"
                      disabled={installing}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkillFilter();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addSkillFilter}
                      disabled={installing || !skillInput.trim()}
                      className="shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* Agents */}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">
                    Agents{" "}
                    <span className="text-muted-foreground font-normal">
                      (--agent)
                    </span>
                  </Label>
                  {options.agent && options.agent.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {options.agent.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary"
                        >
                          {a}
                          <button
                            onClick={() => removeAgent(i)}
                            className="hover:text-destructive transition-colors"
                            disabled={installing}
                          >
                            <CloseCircle className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={agentInput}
                      onChange={(e) => setAgentInput(e.target.value)}
                      placeholder="claude"
                      className="font-mono text-sm"
                      disabled={installing}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAgent();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addAgent}
                      disabled={installing || !agentInput.trim()}
                      className="shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Install globally */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Install globally</Label>
                <p className="text-xs text-muted-foreground">
                  All projects will have access to the installed skills.
                </p>
              </div>
              <Switch
                checked={options.global}
                onCheckedChange={handleGlobalChange}
                disabled={installing}
              />
            </div>

            {/* Project path - shown when not global */}
            {!options.global && (
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Project Directory</Label>
                <div className="flex gap-2">
                  <Input
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                    placeholder="/path/to/your/project"
                    className="flex-1 font-mono text-sm"
                    disabled={installing}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSelectFolder}
                    disabled={installing}
                  >
                    <LuFolderGit2 />
                  </Button>
                </div>
                {activeSession?.project_path && (
                  <p className="text-xs text-muted-foreground">
                    Active session:{" "}
                    <button
                      className="text-primary hover:underline font-mono"
                      onClick={() => setProjectPath(activeSession.project_path)}
                    >
                      {activeSession.project_path}
                    </button>
                  </p>
                )}
              </div>
            )}

            {/* Skip prompts */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Skip prompts{" "}
                <span className="text-muted-foreground font-normal">(-y)</span>
              </Label>
              <Switch
                checked={options.yes}
                onCheckedChange={(v) => updateOption("yes", v)}
                disabled={installing || options.all}
              />
            </div>
          </div>

          {/* Advanced options */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowDown2
                  className={cn(
                    "size-3 transition-transform",
                    advancedOpen && "rotate-180"
                  )}
                />
                Advanced options
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Full depth</Label>
                  <p className="text-xs text-muted-foreground">
                    Search all subdirectories (--full-depth)
                  </p>
                </div>
                <Switch
                  checked={options.full_depth}
                  onCheckedChange={(v) => updateOption("full_depth", v)}
                  disabled={installing}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Copy files</Label>
                  <p className="text-xs text-muted-foreground">
                    Copy files instead of symlinking (--copy)
                  </p>
                </div>
                <Switch
                  checked={options.copy}
                  onCheckedChange={(v) => updateOption("copy", v)}
                  disabled={installing}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* CLI output */}
          {result && (
            <div className="rounded-lg border bg-muted/50 p-3 max-h-40 overflow-y-auto">
              {result.stdout && (
                <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                  {result.stdout}
                </pre>
              )}
              {result.stderr && (
                <pre className="text-xs whitespace-pre-wrap font-mono text-destructive">
                  {result.stderr}
                </pre>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={installing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!options.source.trim() || installing}
          >
            {installing ? "Installing..." : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
