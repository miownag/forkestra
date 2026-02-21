import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SkillConfig } from "@/types";

interface SkillDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillConfig | null;
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
          <DialogTitle>{skill.name}</DialogTitle>
          {skill.description && (
            <DialogDescription>{skill.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-lg border bg-muted/50 p-4">
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
              {skill.content}
            </pre>
          </div>
        </div>
        <div className="text-xs text-muted-foreground pt-2">
          <span className="font-mono">{skill.path}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
