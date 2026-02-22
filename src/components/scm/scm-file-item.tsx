import { cn } from "@/lib/utils";
import type { GitFileStatus, GitFileStatusKind } from "@/types";
import { Button } from "@/components/ui/button";
import { LuPlus, LuMinus, LuUndo2, LuFileWarning } from "react-icons/lu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScmFileItemProps {
  file: GitFileStatus;
  group: "staged" | "unstaged" | "untracked" | "conflicts";
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<
  GitFileStatusKind,
  { label: string; color: string }
> = {
  added: { label: "A", color: "text-green-500" },
  modified: { label: "M", color: "text-yellow-500" },
  deleted: { label: "D", color: "text-red-500" },
  renamed: { label: "R", color: "text-purple-500" },
  copied: { label: "C", color: "text-blue-500" },
  untracked: { label: "U", color: "text-muted-foreground" },
  conflicted: { label: "C", color: "text-orange-500" },
};

export function ScmFileItem({
  file,
  group,
  onStage,
  onUnstage,
  onDiscard,
  onClick,
}: ScmFileItemProps) {
  const config = STATUS_CONFIG[file.status];
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 rounded group/item cursor-pointer text-xs"
      onClick={onClick}
      title={file.path}
    >
      <span className={cn("font-mono w-4 shrink-0 text-center", config.color)}>
        {config.label}
      </span>
      <span className="truncate flex-1 min-w-0">
        <span>{fileName}</span>
        {dirPath && (
          <span className="text-muted-foreground ml-1">{dirPath}</span>
        )}
      </span>

      {/* Hover actions */}
      <div className="hidden group-hover/item:flex items-center gap-0.5 shrink-0">
        {group === "staged" && onUnstage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 [&_svg]:size-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstage();
                }}
              >
                <LuMinus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unstage</TooltipContent>
          </Tooltip>
        )}
        {group === "unstaged" && onStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 [&_svg]:size-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onStage();
                }}
              >
                <LuPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stage</TooltipContent>
          </Tooltip>
        )}
        {group === "unstaged" && onDiscard && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 [&_svg]:size-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
              >
                <LuUndo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Discard Changes</TooltipContent>
          </Tooltip>
        )}
        {group === "untracked" && onStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 [&_svg]:size-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onStage();
                }}
              >
                <LuPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stage</TooltipContent>
          </Tooltip>
        )}
        {group === "conflicts" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 [&_svg]:size-3 text-orange-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.();
                }}
              >
                <LuFileWarning />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resolve Conflict</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
