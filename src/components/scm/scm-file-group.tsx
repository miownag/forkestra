import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { GitFileStatus } from "@/types";
import { ScmFileItem } from "./scm-file-item";

interface ScmFileGroupProps {
  title: string;
  count: number;
  files: GitFileStatus[];
  group: "staged" | "unstaged" | "untracked" | "conflicts";
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  onStageFile?: (filePath: string) => void;
  onUnstageFile?: (filePath: string) => void;
  onDiscardFile?: (filePath: string) => void;
  onFileClick?: (filePath: string) => void;
}

export function ScmFileGroup({
  title,
  count,
  files,
  group,
  defaultOpen = true,
  icon,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onFileClick,
}: ScmFileGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 w-full px-2 py-1 text-xs font-medium hover:bg-muted/50 rounded cursor-pointer"
        )}
      >
        {open ? (
          <LuChevronDown className="size-3 shrink-0" />
        ) : (
          <LuChevronRight className="size-3 shrink-0" />
        )}
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
        <span className="text-muted-foreground ml-auto shrink-0">
          {count}
        </span>
      </button>

      {open && (
        <div className="ml-1">
          {files.map((file) => (
            <ScmFileItem
              key={file.path}
              file={file}
              group={group}
              onStage={
                onStageFile ? () => onStageFile(file.path) : undefined
              }
              onUnstage={
                onUnstageFile ? () => onUnstageFile(file.path) : undefined
              }
              onDiscard={
                onDiscardFile ? () => onDiscardFile(file.path) : undefined
              }
              onClick={
                onFileClick ? () => onFileClick(file.path) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
