import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { SkillConfig } from "@/types";
import { Eye, Trash } from "iconsax-reactjs";

interface SkillCardProps {
  skill: SkillConfig;
  onToggle: (id: string, enabled: boolean) => void;
  onView?: (skill: SkillConfig) => void;
  onRemove?: (skill: SkillConfig) => void;
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

export function SkillCard({
  skill,
  onToggle,
  onView,
  onRemove,
}: SkillCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    if (!onRemove) return;
    setIsRemoving(true);
    try {
      await onRemove(skill);
    } finally {
      setIsRemoving(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-4 transition-all",
          "backdrop-blur-sm bg-card/80",
          !skill.enabled && "opacity-60"
        )}
      >
        <div className="flex items-start gap-3">
          <Switch
            checked={skill.enabled}
            onCheckedChange={(checked) => onToggle(skill.id, checked)}
            className="mt-0.5"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{skill.name}</span>
              <span className="shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
                {getSourceLabel(skill.source)}
              </span>
            </div>

            {skill.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {skill.description}
              </p>
            )}

            <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">
              {skill.path}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onView && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 [&_svg]:size-4"
                onClick={() => onView(skill)}
              >
                <Eye />
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 [&_svg]:size-4 text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash />
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove skill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the skill "{skill.name}" from your configuration.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
