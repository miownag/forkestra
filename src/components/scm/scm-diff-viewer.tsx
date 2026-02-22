import { useEffect, useState } from "react";
import { useScmStore } from "@/stores";

interface ScmDiffViewerProps {
  sessionId: string;
  repoPath: string;
  filePath: string;
  staged: boolean;
  onClose: () => void;
}

export function ScmDiffViewer({
  sessionId,
  repoPath,
  filePath,
  staged,
  onClose,
}: ScmDiffViewerProps) {
  const fetchFileDiff = useScmStore((s) => s.fetchFileDiff);
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFileDiff(sessionId, repoPath, filePath, staged).then((d) => {
      if (!cancelled) {
        setDiff(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, repoPath, filePath, staged, fetchFileDiff]);

  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center justify-between shrink-0 bg-muted/20">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-medium truncate">{fileName}</span>
          <span className="text-muted-foreground text-xs">
            {staged ? "(staged)" : "(unstaged)"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm px-2 cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading diff...
          </div>
        ) : diff ? (
          <pre className="text-xs font-mono p-4 leading-relaxed">
            {diff.split("\n").map((line, i) => {
              let className = "";
              if (line.startsWith("+")) {
                className = "bg-green-500/10 text-green-600 dark:text-green-400";
              } else if (line.startsWith("-")) {
                className = "bg-red-500/10 text-red-600 dark:text-red-400";
              }
              return (
                <div key={i} className={className}>
                  {line}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No changes
          </div>
        )}
      </div>
    </div>
  );
}
