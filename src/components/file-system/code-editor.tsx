import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { languages } from "@codemirror/language-data";
import { type LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { useSelectorSettingsStore } from "@/stores";
import { getFileExtension } from "@/lib/file-types";

interface CodeEditorProps {
  value: string;
  filePath: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  className?: string;
}

function findLanguageDescription(
  filePath: string
): LanguageDescription | undefined {
  const ext = getFileExtension(filePath);
  const fileName = filePath.split("/").pop()?.toLowerCase() || "";

  return languages.find(
    (lang) =>
      lang.extensions.includes(ext) ||
      lang.filename?.test(fileName) ||
      lang.alias.includes(ext)
  );
}

export function CodeEditor({
  value,
  filePath,
  onChange,
  onSave,
  readOnly = false,
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);
  const [langSupport, setLangSupport] = useState<LanguageSupport | null>(null);

  // Load language support lazily based on file extension
  useEffect(() => {
    const langDesc = findLanguageDescription(filePath);
    if (langDesc) {
      langDesc.load().then(setLangSupport);
    } else {
      setLangSupport(null);
    }
  }, [filePath]);

  // Cmd+S / Ctrl+S keymap
  const saveKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            onSave?.();
            return true;
          },
        },
      ]),
    [onSave]
  );

  const extensions = useMemo(() => {
    const exts = [saveKeymap];
    if (langSupport) exts.push(langSupport as never);
    return exts;
  }, [saveKeymap, langSupport]);

  return (
    <CodeMirror
      value={value}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      theme={resolvedTheme}
      className={className}
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
  );
}
