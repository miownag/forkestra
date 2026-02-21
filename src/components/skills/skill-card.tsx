import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
  const isUserInstalled = skill.source.type === "user_installed";

  return (
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
          {isUserInstalled && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 [&_svg]:size-4 text-destructive hover:text-destructive"
              onClick={() => onRemove(skill)}
            >
              <Trash />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
