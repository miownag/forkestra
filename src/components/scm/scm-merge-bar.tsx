import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LuTriangleAlert } from "react-icons/lu";

interface ScmMergeBarProps {
  type: "merge" | "rebase";
  conflictCount: number;
  onAbort: () => void;
  onContinue: () => void;
}

export function ScmMergeBar({
  type,
  conflictCount,
  onAbort,
  onContinue,
}: ScmMergeBarProps) {
  const label = type === "merge" ? "MERGE IN PROGRESS" : "REBASE IN PROGRESS";

  return (
    <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-md p-2 mx-2">
      <div className="flex items-center gap-2 text-xs">
        <LuTriangleAlert className="size-3.5 text-yellow-600 shrink-0" />
        <span className="font-medium text-yellow-700 dark:text-yellow-400">
          {label}
        </span>
        {conflictCount > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[10px] font-medium">
            {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs flex-1"
          onClick={onAbort}
        >
          Abort
        </Button>
        <Button
          size="sm"
          className={cn(
            "h-6 text-xs flex-1",
            conflictCount > 0 && "opacity-50 cursor-not-allowed"
          )}
          disabled={conflictCount > 0}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
