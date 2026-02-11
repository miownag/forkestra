import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Button } from "@/components/ui/button";
import { VscCheck, VscClose, VscWarning, VscRefresh, VscFolder } from "react-icons/vsc";
import { Loader } from "@/components/prompt-kit/loader";
import { useSelectorSettingsStore, useSettingsStore } from "@/stores";

export function GlobalSettingsEditor() {
  const [jsonText, setJsonText] = useState("");
  const [originalJson, setOriginalJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsPath, setSettingsPath] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);
  const loadSettingsToStore = useSettingsStore((state) => state.loadSettings);

  useEffect(() => {
    loadSettings();
    loadSettingsPath();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const json = await invoke<string>("get_settings_json");
      setJsonText(json);
      setOriginalJson(json);
      setError(null);
      setIsDirty(false);
    } catch (err) {
      setError((err as Error).toString());
    } finally {
      setIsLoading(false);
    }
  };

  const loadSettingsPath = async () => {
    try {
      const path = await invoke<string>("get_settings_path");
      setSettingsPath(path);
    } catch (err) {
      console.error("Failed to get settings path:", err);
    }
  };

  const handleChange = (newValue: string) => {
    setJsonText(newValue);
    setIsDirty(newValue !== originalJson);
    try {
      JSON.parse(newValue);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSave = async () => {
    try {
      JSON.parse(jsonText); // Validate first
      setIsSaving(true);
      await invoke("update_settings_json", { json: jsonText });
      setOriginalJson(jsonText);
      setIsDirty(false);
      setError(null);
      // Reload settings to store to update UI immediately
      await loadSettingsToStore();
    } catch (err) {
      setError((err as Error).toString());
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setJsonText(originalJson);
    setIsDirty(false);
    setError(null);
  };

  const handleReload = async () => {
    await loadSettings();
  };

  const isValid = error === null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader variant="classic" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Global Settings</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <VscFolder className="h-3 w-3" />
            {settingsPath}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReload}
          disabled={isSaving}
        >
          <VscRefresh className="h-4 w-4 mr-2" />
          Reload from Disk
        </Button>
      </div>

      {/* Editor */}
      <div className="rounded-lg border overflow-hidden">
        <CodeMirror
          value={jsonText}
          extensions={[json()]}
          onChange={handleChange}
          theme={resolvedTheme}
          className="text-sm"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
          <VscWarning className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Invalid JSON</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {isDirty && (
        <div className="flex gap-2 p-4 rounded-lg border bg-muted/50">
          <Button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="flex-1"
            variant="default"
          >
            {isSaving ? (
              <>
                <Loader variant="classic" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <VscCheck className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex-1"
            disabled={isSaving}
          >
            <VscClose className="h-4 w-4 mr-2" />
            Discard Changes
          </Button>
        </div>
      )}
    </div>
  );
}
