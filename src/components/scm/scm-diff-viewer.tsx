import { useEffect, useState } from "react";
import { useScmStore } from "@/stores";
import { VscClose } from "react-icons/vsc";
import { DocumentText1 } from "iconsax-reactjs";
import { FILE_EXT_SETI_ICONS_MAP } from "@/constants/icons";
import { Button } from "../ui/button";

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
  const fileIconSrc =
    FILE_EXT_SETI_ICONS_MAP[
      filePath.split(".").pop() as keyof typeof FILE_EXT_SETI_ICONS_MAP
    ] || "";

  // Parse diff lines with line numbers
  const parsedLines: {
    oldNum: string;
    newNum: string;
    text: string;
    type: "add" | "del" | "ctx";
  }[] = [];
  if (diff) {
    let oldLine = 0;
    let newLine = 0;
    for (const line of diff.split("\n")) {
      // Skip all header lines
      if (line.startsWith("diff --git")) continue;
      if (line.startsWith("index ")) continue;
      if (line.startsWith("--- ")) continue;
      if (line.startsWith("+++ ")) continue;
      if (line.startsWith("old mode")) continue;
      if (line.startsWith("new mode")) continue;
      if (line.startsWith("new file mode")) continue;
      if (line.startsWith("deleted file mode")) continue;
      if (line.startsWith("similarity index")) continue;
      if (line.startsWith("rename from")) continue;
      if (line.startsWith("rename to")) continue;
      // Parse hunk header for line numbers
      if (line.startsWith("@@")) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = parseInt(match[1], 10);
          newLine = parseInt(match[2], 10);
        }
        continue;
      }
      if (line.startsWith("+")) {
        parsedLines.push({
          oldNum: "",
          newNum: String(newLine),
          text: line,
          type: "add",
        });
        newLine++;
      } else if (line.startsWith("-")) {
        parsedLines.push({
          oldNum: String(oldLine),
          newNum: "",
          text: line,
          type: "del",
        });
        oldLine++;
      } else {
        parsedLines.push({
          oldNum: String(oldLine),
          newNum: String(newLine),
          text: line,
          type: "ctx",
        });
        oldLine++;
        newLine++;
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center justify-between shrink-0 bg-muted/20">
        <div className="flex items-center gap-0.5 text-sm min-w-0">
          {fileIconSrc ? (
            <img src={fileIconSrc} alt="" className="size-5.5 shrink-0" />
          ) : (
            <DocumentText1 className="size-5.5 shrink-0 scale-70" />
          )}
          <span className="font-medium truncate mr-2">{fileName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="[&_svg]:size-4 size-6"
        >
          <VscClose />
        </Button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading diff...
          </div>
        ) : parsedLines.length > 0 ? (
          <pre className="text-xs font-mono p-4 leading-relaxed min-w-full w-fit">
            {parsedLines.map((line, i) => {
              let className = "";
              if (line.type === "add") {
                className =
                  "bg-green-500/10 text-green-600 dark:text-green-400";
              } else if (line.type === "del") {
                className = "bg-red-500/10 text-red-600 dark:text-red-400";
              }
              return (
                <p key={i} className={`flex ${className}`}>
                  <span className="inline-block w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
                    {line.oldNum}
                  </span>
                  <span className="inline-block w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none">
                    {line.newNum}
                  </span>
                  <span className="inline-block w-4 shrink-0 text-center select-none">
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : ""}
                  </span>
                  <span className="flex-1">{line.text.substring(1)}</span>
                </p>
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
