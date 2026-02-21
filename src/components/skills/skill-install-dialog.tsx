import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CliResult } from "@/types";

interface SkillInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (source: string, global: boolean, agent?: string) => Promise<CliResult>;
}

export function SkillInstallDialog({
  open,
  onOpenChange,
  onInstall,
}: SkillInstallDialogProps) {
  const [source, setSource] = useState("");
  const [global, setGlobal] = useState(true);
  const [agent, setAgent] = useState("claude");
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<CliResult | null>(null);

  const handleInstall = async () => {
    if (!source.trim()) return;
    setInstalling(true);
    setResult(null);
    try {
      const res = await onInstall(source.trim(), global, agent || undefined);
      setResult(res);
      if (res.exit_code === 0) {
        // Close dialog after successful install
        setTimeout(() => {
          onOpenChange(false);
          setSource("");
          setResult(null);
        }, 1500);
      }
    } catch {
      // Error handled by store
    } finally {
      setInstalling(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!installing) {
      onOpenChange(open);
      if (!open) {
        setSource("");
        setResult(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install Skill</DialogTitle>
          <DialogDescription>
            Install a skill using <code className="text-xs">npx skills add</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Source</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. vercel-labs/ai-sdk-skill"
              className="font-mono text-sm"
              disabled={installing}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInstall();
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Agent</Label>
            <Input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="claude"
              className="font-mono text-sm"
              disabled={installing}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={global}
              onCheckedChange={setGlobal}
              disabled={installing}
            />
            <Label className="text-sm">Install globally</Label>
          </div>

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
            disabled={!source.trim() || installing}
          >
            {installing ? "Installing..." : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
