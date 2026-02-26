import { useSessionLayoutStore } from "@/stores";
import { Hierarchy2, Refresh } from "iconsax-reactjs";
import { LuFolderTree, LuGitBranch } from "react-icons/lu";
import { RiGitRepositoryLine } from "react-icons/ri";
import { cn } from "@/lib/utils";

interface LeftPanelHeaderProps {
  sessionId: string;
  mode: "file-tree" | "scm";
  label: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function LeftPanelHeader({
  sessionId,
  mode,
  label,
  onRefresh,
  isRefreshing,
}: LeftPanelHeaderProps) {
  const { setLeftPanelMode } = useSessionLayoutStore();

  const isScm = mode === "scm";
  const switchMode = isScm ? "file-tree" : "scm";
  const switchTitle = isScm
    ? "Switch to File Tree"
    : "Switch to Source Control";

  return (
    <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
        {isScm ? (
          <LuGitBranch className="size-3.5 shrink-0 opacity-75" />
        ) : (
          <RiGitRepositoryLine className="size-3.5 shrink-0 opacity-75" />
        )}
        <span className="truncate" title={label}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setLeftPanelMode(sessionId, switchMode)}
          className="p-1 rounded hover:bg-muted transition-colors cursor-pointer"
          title={switchTitle}
        >
          {isScm ? (
            <LuFolderTree className="size-3.5 opacity-75" />
          ) : (
            <Hierarchy2 className="size-3.5 opacity-75" />
          )}
        </button>
        <button
          onClick={onRefresh}
          className={cn(
            "p-1 rounded hover:bg-muted transition-colors cursor-pointer",
            isRefreshing && "animate-spin",
          )}
          title="Refresh"
        >
          <Refresh className="size-3.5 opacity-75" />
        </button>
      </div>
    </div>
  );
}
