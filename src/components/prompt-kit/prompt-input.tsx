import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import React, { createContext, useContext, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import { FileTag, type FileTagAttrs } from "./file-tag-extension";
import type { Editor } from "@tiptap/core";

type PromptInputContextType = {
  isLoading: boolean;
  editor: Editor | null;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  // Legacy: plain text value for compatibility with slash command detection etc.
  value: string;
  setValue: (value: string) => void;
  placeholderRef: React.RefObject<string>;
};

const defaultPlaceholderRef = { current: "" };

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  editor: null,
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  value: "",
  setValue: () => {},
  placeholderRef: defaultPlaceholderRef,
});

function usePromptInput() {
  return useContext(PromptInputContext);
}

export { usePromptInput };

export type PromptInputProps = {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  onEditorUpdate?: (editor: Editor) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
} & React.ComponentProps<"div">;

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onEditorUpdate,
  onSubmit,
  children,
  disabled = false,
  onClick,
  ...props
}: PromptInputProps) {
  const isComposingRef = useRef(false);
  const placeholderRef = useRef("");

  const editor = useEditor(
    {
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        History,
        FileTag,
        Placeholder.configure({
          placeholder: () => placeholderRef.current,
        }),
      ],
      content: "",
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            "text-primary min-h-[44px] w-full resize-none border-none bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 text-sm",
        },
        handleKeyDown: (_view, event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !isComposingRef.current
          ) {
            event.preventDefault();
            onSubmit?.();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        // Extract plain text for slash command detection etc.
        const text = ed.getText();
        onValueChange?.(text);
        onEditorUpdate?.(ed);
      },
    },
    [disabled]
  );

  // Sync disabled state
  React.useEffect(() => {
    if (editor && editor.isEditable === disabled) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // Only focus the editor if the click target is the container itself or the editor area,
    // not action buttons/popovers which manage their own focus
    const target = e.target as HTMLElement;
    const isActionArea = target.closest("[data-prompt-actions]");
    if (!disabled && !isActionArea) editor?.commands.focus();
    onClick?.(e);
  };

  // Listen for composition events on the container
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };
  const handleCompositionEnd = () => {
    isComposingRef.current = false;
  };

  return (
    <TooltipProvider>
      <PromptInputContext.Provider
        value={{
          isLoading,
          editor,
          maxHeight,
          onSubmit,
          disabled,
          placeholderRef,
          value: value ?? editor?.getText() ?? "",
          setValue: (v: string) => {
            if (editor) {
              editor.commands.setContent(v ? `<p>${v}</p>` : "");
            }
            onValueChange?.(v);
          },
        }}
      >
        <div
          onClick={handleClick}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className={cn(
            "bg-background cursor-text rounded-3xl border border-input p-2 shadow-xs transition-all focus-within:border-transparent! focus-within:ring-2 focus-within:ring-ring/20",
            disabled && "cursor-not-allowed opacity-60",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </PromptInputContext.Provider>
    </TooltipProvider>
  );
}

export type PromptInputEditorProps = {
  placeholder?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  className?: string;
};

function PromptInputEditor({
  placeholder,
  className,
  onKeyDown,
  onPaste,
}: PromptInputEditorProps) {
  const { editor, maxHeight, placeholderRef } = usePromptInput();

  // Update the placeholder ref so the Placeholder extension picks it up
  React.useEffect(() => {
    if (placeholder !== undefined) {
      placeholderRef.current = placeholder;
      // Dispatch an empty transaction to trigger decoration re-render
      if (editor) {
        editor.view.dispatch(editor.state.tr);
      }
    }
  }, [editor, placeholder, placeholderRef]);

  if (!editor) return null;

  return (
    <div
      className={cn("prompt-editor", className)}
      style={{
        maxHeight: typeof maxHeight === "number" ? maxHeight : maxHeight,
        overflowY: "auto",
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

// Helper: insert a file tag into the editor
export function insertFileTag(editor: Editor, attrs: FileTagAttrs) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "fileTag",
      attrs,
    })
    .insertContent(" ")
    .run();
}

// Helper: extract file tags from the editor's document
export function extractFileTags(editor: Editor): FileTagAttrs[] {
  const tags: FileTagAttrs[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "fileTag") {
      tags.push(node.attrs as FileTagAttrs);
    }
  });
  return tags;
}

// Helper: extract content parts in order (text and file tags interspersed)
export function extractContentParts(
  editor: Editor
): Array<{ type: "text" | "fileTag"; content: string | FileTagAttrs }> {
  const parts: Array<{
    type: "text" | "fileTag";
    content: string | FileTagAttrs;
  }> = [];

  // Traverse the document tree in order
  editor.state.doc.descendants((node) => {
    if (node.isText) {
      const text = node.text || "";
      // Merge consecutive text parts
      if (parts.length > 0 && parts[parts.length - 1].type === "text") {
        parts[parts.length - 1].content =
          (parts[parts.length - 1].content as string) + text;
      } else {
        parts.push({ type: "text", content: text });
      }
    } else if (node.type.name === "fileTag") {
      parts.push({ type: "fileTag", content: node.attrs as FileTagAttrs });
    }
    // For other node types (paragraph, hardBreak, etc.), continue traversing their children
    return true;
  });

  return parts;
}

// Helper: get plain text (without file tags) from the editor
export function getEditorPlainText(editor: Editor): string {
  // getText() returns text content only, skipping non-text nodes
  return editor.getText();
}

export type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>;

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div
      data-prompt-actions=""
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export type PromptInputActionProps = {
  className?: string;
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
} & React.ComponentProps<typeof Tooltip>;

function PromptInputAction({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInput();

  return (
    <Tooltip {...props}>
      <TooltipTrigger
        asChild
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  PromptInput,
  PromptInputEditor,
  PromptInputActions,
  PromptInputAction,
};
