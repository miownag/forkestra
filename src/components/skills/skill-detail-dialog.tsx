import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/prompt-kit/markdown";
import type { SkillConfig } from "@/types";

interface SkillDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillConfig | null;
}

function getSourceLabel(source: SkillConfig["source"]) {
  switch (source.type) {
    case "global":
      return `${source.agent} Global`;
    case "project":
      return `${source.agent} Project`;
    case "user_installed":
      return "Installed";
    default:
      return "Unknown";
  }
}

export function SkillDetailDialog({
  open,
  onOpenChange,
  skill,
}: SkillDetailDialogProps) {
  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{skill.name}</DialogTitle>
            <span className="shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
              {getSourceLabel(skill.source)}
            </span>
          </div>
          {skill.description && (
            <DialogDescription>{skill.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-lg border bg-muted/50 p-4">
            {skill.content.trim() ? (
              <Markdown>{skill.content}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">No content.</p>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground pt-2">
          <span className="font-mono">{skill.path}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
