import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { Button } from "@/components/ui/button";
import { VscCheck, VscClose, VscWarning } from "react-icons/vsc";
import { useSelectorSettingsStore } from "@/stores";

interface JsonEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  onCancel: () => void;
}

export function JsonEditor({ value, onChange, onCancel }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);

  useEffect(() => {
    setJsonText(JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  const handleChange = (newValue: string) => {
    setJsonText(newValue);
    try {
      JSON.parse(newValue);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onChange(parsed);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const isValid = error === null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <CodeMirror
          value={jsonText}
          extensions={[json()]}
          onChange={handleChange}
          theme={resolvedTheme}
          className="text-xs"
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

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
          <VscWarning className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Invalid JSON</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleApply}
          disabled={!isValid}
          className="flex-1"
          variant="default"
        >
          <VscCheck className="h-4 w-4 mr-2" />
          Apply Changes
        </Button>
        <Button onClick={onCancel} variant="outline" className="flex-1">
          <VscClose className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
