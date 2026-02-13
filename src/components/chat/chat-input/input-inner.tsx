import {
  usePromptInput,
  insertFileTag,
  extractContentParts,
  PromptInputEditor,
  PromptInputActions,
  PromptInputAction,
} from "@/components/prompt-kit/prompt-input";
import { PromptContent, AvailableCommand, FileEntry, Session } from "@/types";
import { Editor } from "@tiptap/core";
import { Send2, StopCircle } from "iconsax-reactjs";
import { useRef, useEffect, useCallback } from "react";
import { GrAttachment } from "react-icons/gr";
import { TbSlash } from "react-icons/tb";
import { FileSelector } from "./file-selector";
import { ModeSelector } from "./mode-selector";
import { ModelSelector } from "./model-selector";
import { SlashCommandSelector } from "./slash-command-selector";

// Simple MIME type lookup from extension
function guessMimeType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    ts: "text/typescript",
    tsx: "text/typescript",
    js: "text/javascript",
    jsx: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    rs: "text/rust",
    py: "text/x-python",
    html: "text/html",
    css: "text/css",
    toml: "text/toml",
    yaml: "text/yaml",
    yml: "text/yaml",
    txt: "text/plain",
    sh: "text/x-shellscript",
    sql: "text/sql",
    xml: "text/xml",
    svg: "image/svg+xml",
  };
  return ext ? mimeMap[ext] : undefined;
}

// Inner component that has access to the PromptInput context (editor)
export function ChatInputInner({
  onSend,
  disabled,
  isLoading,
  onStop,
  inlineSlashOpen,
  setInlineSlashOpen,
  inlineSlashQuery,
  setInlineSlashQuery,
  inlineFileOpen,
  setInlineFileOpen,
  buttonFileOpen,
  setButtonFileOpen,
  buttonSlashOpen,
  setButtonSlashOpen,
  commands,
  projectPath,
  session,
  handleCommandSelect,
  handleSlashButtonClick,
  handleAttachButtonClick,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: (content: PromptContent[]) => Promise<void>;
  disabled?: boolean;
  isLoading: boolean;
  onStop: () => void;
  inlineSlashOpen: boolean;
  setInlineSlashOpen: (v: boolean) => void;
  inlineSlashQuery: string;
  setInlineSlashQuery: (v: string) => void;
  inlineFileOpen: boolean;
  setInlineFileOpen: (v: boolean) => void;
  buttonFileOpen: boolean;
  setButtonFileOpen: (v: boolean) => void;
  buttonSlashOpen: boolean;
  setButtonSlashOpen: (v: boolean) => void;
  commands: AvailableCommand[];
  projectPath: string;
  session?: Session;
  handleCommandSelect: (cmd: AvailableCommand) => Promise<void>;
  handleSlashButtonClick: () => void;
  handleAttachButtonClick: () => void;
}) {
  const { editor } = usePromptInput();
  // Track whether the file selector was opened via @ trigger or via button
  const fileOpenSourceRef = useRef<"inline" | "button">("inline");

  // Update the source ref when inline or button file open changes
  useEffect(() => {
    if (inlineFileOpen) fileOpenSourceRef.current = "inline";
  }, [inlineFileOpen]);
  useEffect(() => {
    if (buttonFileOpen) fileOpenSourceRef.current = "button";
  }, [buttonFileOpen]);

  const handleFileEntrySelect = useCallback(
    (entry: FileEntry) => {
      if (!editor) return;

      const absolutePath = `${projectPath}/${entry.path}`;
      const uri = `file://${absolutePath}`;
      const mimeType = entry.is_dir ? null : guessMimeType(entry.name) || null;

      // Only remove @query text if opened via @ trigger
      if (fileOpenSourceRef.current === "inline") {
        deleteAtTrigger(editor);
      }

      // Insert the file tag
      insertFileTag(editor, {
        path: entry.path,
        name: entry.name,
        uri,
        mimeType,
        isDir: entry.is_dir,
      });

      setInlineFileOpen(false);
      setButtonFileOpen(false);
    },
    [editor, projectPath, setInlineFileOpen, setButtonFileOpen]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (inlineSlashOpen) {
          e.preventDefault();
          setInlineSlashOpen(false);
          setInlineSlashQuery("");
        }
        if (inlineFileOpen) {
          e.preventDefault();
          setInlineFileOpen(false);
        }
      }
    },
    [
      inlineSlashOpen,
      inlineFileOpen,
      setInlineSlashOpen,
      setInlineSlashQuery,
      setInlineFileOpen,
    ]
  );

  const handleOnSubmit = useCallback(async () => {
    if (!editor) return;

    const contentParts = extractContentParts(editor);

    if (contentParts.length === 0 && !disabled) return;
    if (disabled) return;

    setInlineSlashOpen(false);
    setInlineSlashQuery("");
    setButtonSlashOpen(false);
    setInlineFileOpen(false);
    setButtonFileOpen(false);

    const content: PromptContent[] = [];

    // Convert content parts to PromptContent, maintaining order
    contentParts.forEach((part) => {
      if (part.type === "text") {
        const text = part.content as string;
        // Always include text parts to maintain order, even if empty/whitespace
        content.push({ type: "text", text });
      } else if (part.type === "fileTag") {
        const tag = part.content as {
          path: string;
          name: string;
          uri: string;
          mimeType: string | null;
          isDir: boolean;
        };
        content.push({
          type: "resource_link",
          uri: tag.uri,
          name: tag.name,
          mimeType: tag.mimeType || undefined,
        });
      }
    });

    if (content.length > 0) {
      await onSend(content);
      editor.commands.clearContent();
    }
  }, [
    editor,
    disabled,
    onSend,
    setInlineSlashOpen,
    setInlineSlashQuery,
    setButtonSlashOpen,
    setInlineFileOpen,
    setButtonFileOpen,
  ]);

  // Register submit handler with the editor's handleKeyDown
  useEffect(() => {
    if (!editor) return;

    // Override the Enter key handling to use our submit
    const originalKeyDown = editor.options.editorProps?.handleKeyDown;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleKeyDown: (view, event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !(event as unknown as { isComposing: boolean }).isComposing
          ) {
            event.preventDefault();
            handleOnSubmit();
            return true;
          }
          if (originalKeyDown) {
            return originalKeyDown(view, event);
          }
          return false;
        },
      },
    });
  }, [editor, handleOnSubmit]);

  return (
    <>
      {/* Textarea with popover selectors */}
      <FileSelector
        open={inlineFileOpen}
        onOpenChange={setInlineFileOpen}
        projectPath={projectPath}
        onSelect={handleFileEntrySelect}
      >
        <SlashCommandSelector
          open={inlineSlashOpen}
          onOpenChange={setInlineSlashOpen}
          commands={commands}
          searchQuery={inlineSlashQuery}
          onSelect={handleCommandSelect}
        >
          <PromptInputEditor
            placeholder={
              disabled ? "Waiting for response..." : "Type your instruction..."
            }
            onKeyDown={handleKeyDown}
          />
        </SlashCommandSelector>
      </FileSelector>

      <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <ModelSelector session={session} />
          <ModeSelector session={session} />
        </div>

        <div className="flex items-center gap-2">
          <FileSelector
            open={buttonFileOpen}
            onOpenChange={setButtonFileOpen}
            projectPath={projectPath}
            onSelect={handleFileEntrySelect}
            align="end"
          >
            <PromptInputAction tooltip="Attach File">
              <button
                type="button"
                onClick={handleAttachButtonClick}
                className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl text-muted-foreground"
              >
                <GrAttachment className="size-4" />
              </button>
            </PromptInputAction>
          </FileSelector>
          <SlashCommandSelector
            open={buttonSlashOpen}
            onOpenChange={setButtonSlashOpen}
            commands={commands}
            searchQuery=""
            onSelect={handleCommandSelect}
            align="end"
          >
            <button
              type="button"
              onClick={handleSlashButtonClick}
              className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl text-muted-foreground"
            >
              <TbSlash className="size-5" />
            </button>
          </SlashCommandSelector>
          <button
            className="h-8 w-8 hover:text-primary/70 rounded-full cursor-pointer text-primary"
            onClick={isLoading ? onStop : handleOnSubmit}
            disabled={!isLoading && disabled}
          >
            {isLoading ? (
              <StopCircle variant="Bold" className="size-7" />
            ) : (
              <Send2 variant="Bold" className="size-6" />
            )}
          </button>
        </div>
      </PromptInputActions>
    </>
  );
}

// Helper: delete the @trigger text from the editor (everything from @ to cursor)
function deleteAtTrigger(editor: Editor) {
  const { state } = editor;
  const { from } = state.selection;
  const textBefore = state.doc.textBetween(Math.max(0, from - 50), from, "\n");
  const atMatch = textBefore.match(/(^|\s)@(\S*)$/);
  if (atMatch) {
    const deleteFrom =
      from - atMatch[0].length + (atMatch[1] ? atMatch[1].length : 0);
    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
  }
}
