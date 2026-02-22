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
import { Textarea } from "@/components/ui/textarea";

interface SkillCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    name: string,
    description: string,
    content: string,
    global: boolean
  ) => Promise<void>;
}

export function SkillCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: SkillCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [global, setGlobal] = useState(true);
  const [creating, setCreating] = useState(false);

  const toKebabCase = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const handleCreate = async () => {
    const kebabName = toKebabCase(name);
    if (!kebabName || !content.trim()) return;
    setCreating(true);
    try {
      await onCreate(kebabName, description.trim(), content, global);
      onOpenChange(false);
      resetForm();
    } catch {
      // Error handled by store
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setContent("");
    setGlobal(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!creating) {
      onOpenChange(open);
      if (!open) resetForm();
    }
  };

  const kebabName = toKebabCase(name);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Skill</DialogTitle>
          <DialogDescription>
            Create a custom skill and install it to all agents
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 px-1">
          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-custom-skill"
              className="font-mono text-sm"
              disabled={creating}
            />
            {name && kebabName !== name.toLowerCase().trim() && (
              <p className="text-xs text-muted-foreground">
                Will be saved as: <span className="font-mono">{kebabName}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of what this skill does"
              className="text-sm"
              disabled={creating}
            />
          </div>

          {/* Content with tabs */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Write your skill instructions in Markdown...\n\nExample:\n# My Skill\n\nWhen the user asks you to...\n\n## Rules\n\n- Always do X\n- Never do Y`}
              className="font-mono text-sm min-h-[240px] resize-y"
              disabled={creating}
            />
          </div>

          {/* Global toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Install globally</Label>
              <p className="text-xs text-muted-foreground">
                {global
                  ? "Available across all projects"
                  : "Only available in current project"}
              </p>
            </div>
            <Switch
              checked={global}
              onCheckedChange={setGlobal}
              disabled={creating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!kebabName || !content.trim() || creating}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
