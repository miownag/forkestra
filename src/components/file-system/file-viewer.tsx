import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlockCode } from "@/components/prompt-kit/code-block";
import { useSelectorSettingsStore } from "@/stores";
import { invoke } from "@tauri-apps/api/core";
import { LuX, LuFileText, LuMonitor } from "react-icons/lu";
import { cn } from "@/lib/utils";

interface FileViewerProps {
  sessionId: string;
  projectPath: string;
  filePath: string;
  mode: "view" | "preview";
  onModeChange: (mode: "view" | "preview") => void;
  onClose: () => void;
}

// Language detection from file extension
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    md: "markdown",
    sql: "sql",
    dockerfile: "dockerfile",
    toml: "toml",
    ini: "ini",
    txt: "plaintext",
  };

  return languageMap[ext || ""] || "plaintext";
}

export function FileViewer({
  projectPath,
  filePath,
  mode,
  onModeChange,
  onClose,
}: FileViewerProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);

  useEffect(() => {
    async function loadFile() {
      if (!filePath || !projectPath) {
        setError("Invalid file path");
        setIsLoading(false);
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
      } catch (err) {
        console.error("Failed to read file:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }

    loadFile();
  }, [filePath, projectPath]);

  const fileName = filePath.split("/").pop() || filePath;
  const language = detectLanguage(filePath);
  const theme = resolvedTheme === "dark" ? "one-dark-pro" : "github-light";

  return (
    <div className="flex flex-col h-full w-full overflow-auto">
      {/* Header */}
      <div className="border-b px-3 py-2 shrink-0 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
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
        <div className="flex items-center gap-1 shrink-0">
          {/* Mode Toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button
              variant={mode === "view" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 px-2 gap-1",
                mode === "view" && "bg-background shadow-sm"
              )}
              onClick={() => onModeChange("view")}
            >
              <LuFileText className="h-3.5 w-3.5" />
              <span className="text-xs">View</span>
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
              <LuMonitor className="h-3.5 w-3.5" />
              <span className="text-xs">Preview</span>
            </Button>
          </div>

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
      <div className="flex-1 overflow-hidden">
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
        ) : mode === "view" ? (
          <div className="h-full overflow-auto">
            <CodeBlockCode
              code={content}
              language={language}
              theme={theme}
              className="[&_pre]:bg-background! h-full"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
            <div className="text-center">
              <LuMonitor className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Preview Coming Soon</p>
              <p className="text-xs mt-1">
                File preview functionality will be available in a future update
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
