import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";
import type { GitFileStatus } from "@/types";
import { ScmFileItem } from "./scm-file-item";

interface ScmFileGroupProps {
  title: string;
  count: number;
  files: GitFileStatus[];
  group: "staged" | "unstaged" | "untracked" | "conflicts";
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  selectedFile?: string | null;
  onStageAll?: () => void;
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
  selectedFile,
  onStageAll,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onFileClick,
}: ScmFileGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div>
      <div className="flex items-center group">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "flex items-center gap-1 flex-1 px-2 py-1 text-xs font-medium hover:bg-muted/50 rounded cursor-pointer min-w-0",
          )}
        >
          {open ? (
            <LuChevronDown className="size-3 shrink-0" />
          ) : (
            <LuChevronRight className="size-3 shrink-0" />
          )}
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
          <span className="text-muted-foreground ml-auto shrink-0">{count}</span>
        </button>
        {onStageAll && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStageAll();
            }}
            className="p-1 rounded hover:bg-muted transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
            title="Stage All"
          >
            <LuPlus className="size-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="ml-1">
          {files.map((file) => (
            <ScmFileItem
              key={file.path}
              file={file}
              group={group}
              selected={selectedFile === file.path}
              onStage={onStageFile ? () => onStageFile(file.path) : undefined}
              onUnstage={
                onUnstageFile ? () => onUnstageFile(file.path) : undefined
              }
              onDiscard={
                onDiscardFile ? () => onDiscardFile(file.path) : undefined
              }
              onClick={onFileClick ? () => onFileClick(file.path) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
