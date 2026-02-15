import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { LuX, LuFileText, LuEye, LuRefreshCw } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { categorizeFile } from "@/lib/file-types";
import { CodeEditor } from "./code-editor";
import { FilePreview } from "./file-preview";

interface FileViewerProps {
  sessionId: string;
  projectPath: string;
  filePath: string;
  mode: "edit" | "preview";
  onModeChange: (mode: "edit" | "preview") => void;
  onClose: () => void;
}

export function FileViewer({
  projectPath,
  filePath,
  mode,
  onModeChange,
  onClose,
}: FileViewerProps) {
  const [content, setContent] = useState<string>("");
  const [editedContent, setEditedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = editedContent !== content;
  const fileCategory = categorizeFile(filePath);
  const fileName = filePath.split("/").pop() || filePath;

  const loadFile = useCallback(async () => {
    if (!filePath || !projectPath) {
      setError("Invalid file path");
      setIsLoading(false);
      return;
    }

    // Binary files (images, videos, etc.) don't need text content loading
    if (categorizeFile(filePath) === "binary") {
      setContent("");
      setEditedContent("");
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const fileContent = await invoke<string>("read_file", {
        projectPath,
        relativePath: filePath,
      });
      setContent(fileContent);
      setEditedContent(fileContent);
    } catch (err) {
      console.error("Failed to read file:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [filePath, projectPath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // Force mode to "preview" for binary files, "edit" for code files
  useEffect(() => {
    if (fileCategory === "binary" && mode !== "preview") {
      onModeChange("preview");
    } else if (fileCategory === "code" && mode !== "edit") {
      onModeChange("edit");
    }
  }, [fileCategory, mode, onModeChange]);

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await invoke("write_file", {
        projectPath,
        relativePath: filePath,
        content: editedContent,
      });
      setContent(editedContent);
      toast.success("File saved");
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsSaving(false);
    }
  }, [editedContent, isDirty, isSaving, projectPath, filePath]);

  const handleRefresh = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Refreshing will discard them. Continue?"
      );
      if (!confirmed) return;
    }
    loadFile();
  }, [isDirty, loadFile]);

  const showModeToggle = fileCategory === "previewable";
  const showRefresh = fileCategory !== "binary";
  const showDirtyIndicator = fileCategory !== "binary";

  return (
    <div className="flex flex-col h-full w-full overflow-auto">
      {/* Header */}
      <div className="border-b px-3 py-2 shrink-0 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate" title={filePath}>
              {fileName}
            </h3>
            <p
              className="text-xs text-muted-foreground truncate"
              title={filePath}
            >
              {filePath}
            </p>
          </div>
          {showDirtyIndicator && isDirty && (
            <span
              className="h-2 w-2 rounded-full bg-yellow-500 shrink-0"
              title="Unsaved changes"
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Mode Toggle - only for previewable files */}
          {showModeToggle && (
            <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
              <Button
                variant={mode === "edit" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2 gap-1",
                  mode === "edit" && "bg-background shadow-sm"
                )}
                onClick={() => onModeChange("edit")}
              >
                <LuFileText className="h-3.5 w-3.5" />
                <span className="text-xs">Edit</span>
              </Button>
              <Button
                variant={mode === "preview" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2 gap-1",
                  mode === "preview" && "bg-background shadow-sm"
                )}
                onClick={() => onModeChange("preview")}
              >
                <LuEye className="h-3.5 w-3.5" />
                <span className="text-xs">Preview</span>
              </Button>
            </div>
          )}

          {/* Refresh Button */}
          {showRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleRefresh}
              title="Refresh from disk"
            >
              <LuRefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <LuX className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading file...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-destructive p-4">
            <div>
              <p className="font-medium">Failed to load file</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        ) : fileCategory === "binary" ? (
          <FilePreview
            content={content}
            filePath={filePath}
            projectPath={projectPath}
          />
        ) : mode === "preview" ? (
          <FilePreview
            content={editedContent}
            filePath={filePath}
            projectPath={projectPath}
          />
        ) : (
          <CodeEditor
            value={editedContent}
            filePath={filePath}
            onChange={setEditedContent}
            onSave={handleSave}
            className="h-full text-xs"
          />
        )}
      </div>
    </div>
  );
}
