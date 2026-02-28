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
import { DocumentText1, Folder, Send2, StopCircle } from "iconsax-reactjs";
import { useRef, useState, useEffect, useCallback } from "react";
import { VscClose } from "react-icons/vsc";
import { GrAttachment } from "react-icons/gr";
import { TbSlash } from "react-icons/tb";
import { FileSelector } from "./file-selector";
import { ModeSelector } from "./mode-selector";
import { ModelSelector } from "./model-selector";
import { SlashCommandSelector } from "./slash-command-selector";
import { useChatInputStore } from "@/stores";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ImageFile {
  name: string;
  data: string; // base64
  mimeType: string;
  preview: string; // object URL for display
}

// Helper function to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get pure base64
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  buttonSlashOpen,
  setButtonSlashOpen,
  commands,
  projectPath,
  session,
  handleCommandSelect,
  handleSlashButtonClick,
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
  buttonSlashOpen: boolean;
  setButtonSlashOpen: (v: boolean) => void;
  commands: AvailableCommand[];
  projectPath: string;
  session?: Session;
  handleCommandSelect: (cmd: AvailableCommand) => Promise<void>;
  handleSlashButtonClick: () => void;
}) {
  const { editor } = usePromptInput();
  const { registerAddFileToInput, unregisterAddFileToInput } =
    useChatInputStore();
  // Track whether the file selector was opened via @ trigger or via button
  const fileOpenSourceRef = useRef<"inline" | "button">("inline");

  // Image attachments
  const [images, setImages] = useState<ImageFile[]>([]);
  const submitRef = useRef<() => void>(() => {});

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Register TipTap handlePaste (for images) and handleKeyDown (for Enter submit)
  useEffect(() => {
    if (!editor) return;

    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          const imageItems = Array.from(items).filter((item) =>
            item.type.startsWith("image/")
          );

          if (imageItems.length === 0) return false;

          // Process images asynchronously
          (async () => {
            const newImages: ImageFile[] = [];
            for (const item of imageItems) {
              const file = item.getAsFile();
              if (!file) continue;
              try {
                const base64 = await fileToBase64(file);
                const preview = URL.createObjectURL(file);
                newImages.push({
                  name:
                    file.name ||
                    `image-${Date.now()}.${file.type.split("/")[1]}`,
                  data: base64,
                  mimeType: file.type,
                  preview,
                });
              } catch (error) {
                console.error("Failed to read pasted image:", error);
              }
            }
            if (newImages.length > 0) {
              setImages((prev) => [...prev, ...newImages]);
            }
          })();

          return true; // prevent TipTap default paste for image items
        },
        handleKeyDown: (_view, event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !(event as unknown as { isComposing: boolean }).isComposing
          ) {
            event.preventDefault();
            submitRef.current();
            return true;
          }
          return false;
        },
      },
    });
  }, [editor]);

  // Update the source ref when inline file open changes
  useEffect(() => {
    if (inlineFileOpen) fileOpenSourceRef.current = "inline";
  }, [inlineFileOpen]);

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
    },
    [editor, projectPath, setInlineFileOpen]
  );

  // Register the function to add files to input (for context menu)
  useEffect(() => {
    if (!editor || !session) return;

    const addFileToInput = (entry: FileEntry) => {
      const absolutePath = `${projectPath}/${entry.path}`;
      const uri = `file://${absolutePath}`;
      const mimeType = entry.is_dir ? null : guessMimeType(entry.name) || null;

      // Insert the file tag
      insertFileTag(editor, {
        path: entry.path,
        name: entry.name,
        uri,
        mimeType,
        isDir: entry.is_dir,
      });

      // Delay focus to ensure it happens after the context menu closes
      requestAnimationFrame(() => {
        editor.commands.focus("end");
      });
    };

    registerAddFileToInput(session.id, addFileToInput);

    return () => {
      unregisterAddFileToInput(session.id);
    };
  }, [
    editor,
    session,
    projectPath,
    registerAddFileToInput,
    unregisterAddFileToInput,
  ]);

  // Handle native file selector for attach button
  const handleNativeFileSelect = useCallback(
    async (type: "file" | "folder") => {
      if (!editor) return;

      try {
        const selected = await openDialog({
          defaultPath: projectPath,
          multiple: true,
          directory: type === "folder",
          title: type === "folder" ? "Select Folders" : "Select Files",
        });

        console.log("Selected:", selected, "Type:", typeof selected);

        if (!selected) return;

        // Handle both string (single selection) and array (multiple selection)
        const filePaths = Array.isArray(selected) ? selected : [selected];

        if (filePaths.length === 0) return;

        for (const filePath of filePaths) {
          // Get relative path if within project
          let relativePath = filePath;
          let displayName = filePath.split("/").pop() || filePath;

          if (filePath.startsWith(projectPath + "/")) {
            relativePath = filePath.substring(projectPath.length + 1);
          }

          const uri = `file://${filePath}`;
          const mimeType =
            type === "file" ? guessMimeType(displayName) || null : null;

          // Insert the file tag
          insertFileTag(editor, {
            path: relativePath,
            name: displayName,
            uri,
            mimeType,
            isDir: type === "folder",
          });
        }

        // Focus back to editor
        requestAnimationFrame(() => {
          editor.commands.focus("end");
        });
      } catch (error) {
        console.error("Failed to select:", error);
        toast.error(
          `Failed to select ${type === "folder" ? "folders" : "files"}`
        );
      }
    },
    [editor, projectPath]
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

    if (contentParts.length === 0 && images.length === 0 && !disabled) return;
    if (disabled) return;

    setInlineSlashOpen(false);
    setInlineSlashQuery("");
    setButtonSlashOpen(false);
    setInlineFileOpen(false);

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

    // Add image content
    images.forEach((img) => {
      content.push({
        type: "image",
        data: img.data,
        mimeType: img.mimeType,
      });
    });

    if (content.length > 0) {
      await onSend(content);
      editor.commands.clearContent();
      // Clean up image previews
      images.forEach((img) => {
        if (img.preview) URL.revokeObjectURL(img.preview);
      });
      setImages([]);
    }
  }, [
    editor,
    disabled,
    images,
    onSend,
    setInlineSlashOpen,
    setInlineSlashQuery,
    setButtonSlashOpen,
    setInlineFileOpen,
  ]);

  // Keep submitRef in sync with latest handleOnSubmit
  useEffect(() => {
    submitRef.current = handleOnSubmit;
  }, [handleOnSubmit]);

  return (
    <>
      {/* Image attachment previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {images.map((img, index) => (
            <div
              key={index}
              className="relative group flex items-center gap-2 rounded-lg bg-primary/5 p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={img.preview}
                alt={img.name}
                className="h-16 w-16 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <span className="block truncate text-sm max-w-[120px]">
                  {img.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {img.mimeType}
                </span>
              </div>
              <button
                className="cursor-pointer hover:bg-muted p-1 rounded-md"
                onClick={() => removeImage(index)}
              >
                <VscClose />
              </button>
            </div>
          ))}
        </div>
      )}

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl text-muted-foreground"
              >
                <GrAttachment className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => handleNativeFileSelect("file")}
              >
                <DocumentText1 className="size-4" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => handleNativeFileSelect("folder")}
              >
                <Folder className="size-4" />
                Folders
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SlashCommandSelector
            open={buttonSlashOpen}
            onOpenChange={setButtonSlashOpen}
            commands={commands}
            searchQuery=""
            onSelect={handleCommandSelect}
            align="end"
          >
            <PromptInputAction tooltip="Slash Command">
              <button
                type="button"
                onClick={handleSlashButtonClick}
                className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl text-muted-foreground"
              >
                <TbSlash className="size-5" />
              </button>
            </PromptInputAction>
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
