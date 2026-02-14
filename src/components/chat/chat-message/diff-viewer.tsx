import { useState, useMemo } from "react";
import { parseDiff, Diff, Hunk } from "react-diff-view";
import { createTwoFilesPatch } from "diff";
import "react-diff-view/style/index.css";
import { useSelectorSettingsStore } from "@/stores";
import { cn } from "@/lib/utils";
import { Copy, CopySuccess } from "iconsax-reactjs";
import { LuMaximize, LuMinimize } from "react-icons/lu";

interface DiffViewerProps {
  path: string;
  oldText?: string;
  newText: string;
}

/**
 * Generate a fake git object hash for diff header
 */
function fakeGitIndex(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Normalize diff text to standard Git diff format
 * Handles custom formats (with ===) and standard unified diff formats
 */
function normalizeToGitDiff(diffText: string, filePath: string): string {
  const trimmed = diffText.trim();

  // Already in git diff format
  if (trimmed.startsWith("diff --git")) {
    return trimmed;
  }

  // Extract the unified diff part (--- +++ @@)
  const lines = trimmed.split("\n");
  let unifiedDiffStart = -1;

  // Find where the unified diff starts (--- line)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("---")) {
      unifiedDiffStart = i;
      break;
    }
  }

  if (unifiedDiffStart === -1) {
    // No unified diff found, return empty
    return "";
  }

  // Extract the unified diff portion
  const unifiedDiff = lines.slice(unifiedDiffStart).join("\n");

  // Prepend git diff header
  const fileName = filePath.split("/").pop() || "file";
  const gitHeader = [
    `diff --git a/${fileName} b/${fileName}`,
    `index ${fakeGitIndex()}..${fakeGitIndex()} 100644`,
  ].join("\n");

  return `${gitHeader}\n${unifiedDiff}`;
}

/**
 * Extract old and new content from a diff-formatted string
 */
function extractContentFromDiff(diffText: string): {
  oldContent: string;
  newContent: string;
} {
  const lines = diffText.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    // Start of hunk
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // Skip backslash lines (e.g., "\ No newline at end of file")
    if (line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith("-")) {
      // Removed line (old content only)
      oldLines.push(line.substring(1));
    } else if (line.startsWith("+")) {
      // Added line (new content only)
      newLines.push(line.substring(1));
    } else if (line.startsWith(" ")) {
      // Context line (both old and new)
      const content = line.substring(1);
      oldLines.push(content);
      newLines.push(content);
    }
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

export function DiffViewer({ path, oldText, newText }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);
  const [viewType, setViewType] = useState<"split" | "unified">("unified");
  const [expanded, setExpanded] = useState(false);

  // Guard against undefined/null values
  const safeNewText = newText || "";
  const safeOldText = oldText || "";

  // Determine if input is pre-formatted diff or raw content
  const isDiffFormat = useMemo(() => {
    return (
      (safeNewText.includes("---") &&
        safeNewText.includes("+++") &&
        safeNewText.includes("@@")) ||
      safeNewText.includes("===")
    );
  }, [safeNewText]);

  // Generate standard Git diff format
  const gitDiffText = useMemo(() => {
    try {
      if (isDiffFormat && !safeOldText) {
        // Input is already a diff, normalize to Git format
        return normalizeToGitDiff(safeNewText, path);
      } else {
        // Input is raw content, generate diff
        const fileName = path.split("/").pop() || "file";
        const patch = createTwoFilesPatch(
          `a/${fileName}`,
          `b/${fileName}`,
          safeOldText,
          safeNewText,
          "",
          ""
        );

        // Convert to git diff format
        return normalizeToGitDiff(patch, path);
      }
    } catch (error) {
      console.error("Error generating git diff:", error);
      return "";
    }
  }, [isDiffFormat, safeOldText, safeNewText, path]);

  // Parse git diff to get file objects
  const files = useMemo(() => {
    if (!gitDiffText) {
      return [];
    }

    try {
      console.log("Parsing git diff text:", gitDiffText);
      const parsed = parseDiff(gitDiffText);
      console.log("Parsed result:", parsed);

      // Validate that hunks exist and are properly formatted
      const validFiles = parsed.filter((file) => {
        if (!file.hunks || file.hunks.length === 0) {
          console.warn("File has no hunks:", file);
          return false;
        }

        // Check if all hunks have changes array
        const allHunksValid = file.hunks.every((hunk) => {
          if (!hunk.changes) {
            console.warn("Hunk missing changes array:", hunk);
            return false;
          }
          return true;
        });

        return allHunksValid;
      });

      console.log("Valid files after filtering:", validFiles);
      return validFiles;
    } catch (e) {
      console.error("Error parsing diff:", e);
      console.error("Git diff text was:", gitDiffText);
      return [];
    }
  }, [gitDiffText]);

  // Extract new content for copy functionality
  const contentToCopy = useMemo(() => {
    if (isDiffFormat && !safeOldText) {
      const { newContent } = extractContentFromDiff(safeNewText);
      return newContent;
    }
    return safeNewText;
  }, [isDiffFormat, safeOldText, safeNewText]);

  const handleCopy = () => {
    if (copied) return;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileName = path.split("/").pop() || path;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {fileName}
          </span>
          <span className="text-xs text-muted-foreground">{path}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setViewType(viewType === "split" ? "unified" : "split")
            }
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted"
          >
            {viewType === "split" ? "Unified" : "Split"}
          </button>
          <button
            onClick={handleCopy}
            className={cn(
              "text-muted-foreground p-1 rounded-md",
              !copied && "hover:bg-muted cursor-pointer"
            )}
            title="Copy new content"
          >
            {copied ? (
              <CopySuccess className="size-4 text-green-500" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div
        className={cn(
          "diff-viewer overflow-x-auto relative ",
          resolvedTheme === "dark" ? "diff-theme-dark" : "diff-theme-light",
          !expanded && "max-h-60 overflow-y-hidden"
        )}
      >
        {files.length > 0 ? (
          <>
            {files.map((file, idx) => (
              <Diff
                key={idx}
                viewType={viewType}
                diffType={file.type}
                hunks={file.hunks || []}
              >
                {(hunks) =>
                  hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                }
              </Diff>
            ))}
            {
              <div
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  "absolute bottom-2 right-2",
                  "rounded-md p-2",
                  "text-xs font-semibold text-muted-foreground",
                  "bg-muted hover:bg-muted/50 "
                )}
                onClick={() => setExpanded((pre) => !pre)}
              >
                {expanded ? (
                  <LuMinimize className="size-4" />
                ) : (
                  <LuMaximize className="size-4" />
                )}
                {expanded ? "Collapse" : "Expand"}
              </div>
            }
          </>
        ) : (
          <div className="p-3 text-xs text-muted-foreground">
            No changes to display
          </div>
        )}
      </div>
    </div>
  );
}
