import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { GrAttachment } from "react-icons/gr";
import { useState, useCallback } from "react";
import type { Session, AvailableCommand, PromptContent } from "@/types";
import { TbSlash } from "react-icons/tb";
import { SlashCommandSelector } from "./slash-command-selector";
import { ModelSelector } from "./model-selector";
import { ModeSelector } from "./mode-selector";
import { Send2, StopCircle } from "iconsax-reactjs";
import { VscClose } from "react-icons/vsc";
import { Button } from "@/components/ui/button";

interface ImageFile {
  name: string;
  data: string; // base64
  mimeType: string;
  preview?: string; // preview URL for display
}

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  session,
}: {
  onSend: (content: PromptContent[]) => Promise<void>;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  session?: Session;
}) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [inlineSlashOpen, setInlineSlashOpen] = useState(false);
  const [inlineSlashQuery, setInlineSlashQuery] = useState("");
  const [buttonSlashOpen, setButtonSlashOpen] = useState(false);

  const commands = session?.available_commands ?? [];

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);

      // Detect slash command pattern: "/" at start or after a space
      const slashMatch = value.match(/(^|\s)\/(\S*)$/);
      if (slashMatch && commands.length > 0) {
        const query = slashMatch[2]; // text after "/"
        // Check if any commands match; if not, close the selector
        const hasMatches = query
          ? commands.some((c) =>
              c.name.toLowerCase().startsWith(query.toLowerCase())
            )
          : true;
        if (hasMatches) {
          setInlineSlashQuery(query);
          setInlineSlashOpen(true);
        } else {
          setInlineSlashOpen(false);
          setInlineSlashQuery("");
        }
      } else {
        setInlineSlashOpen(false);
        setInlineSlashQuery("");
      }
    },
    [commands]
  );

  const handleCommandSelect = useCallback(
    async (command: AvailableCommand) => {
      // Directly send the command
      setInlineSlashOpen(false);
      setInlineSlashQuery("");
      setButtonSlashOpen(false);
      setInput("");
      await onSend([{ type: "text", text: `/${command.name}` }]);
    },
    [onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" && inlineSlashOpen) {
        e.preventDefault();
        setInlineSlashOpen(false);
        setInlineSlashQuery("");
      }
    },
    [inlineSlashOpen]
  );

  const handleOnSubmit = async () => {
    if ((input.trim() || images.length > 0) && !disabled) {
      setInlineSlashOpen(false);
      setInlineSlashQuery("");
      setButtonSlashOpen(false);

      const content: PromptContent[] = [];

      // Add text content if present
      if (input.trim()) {
        content.push({ type: "text", text: input });
      }

      // Add image content
      images.forEach((img) => {
        content.push({
          type: "image",
          data: img.data,
          mimeType: img.mimeType,
        });
      });

      await onSend(content);
      setInput("");
      setImages([]);
    }
  };

  const handleSlashButtonClick = () => {
    if (commands.length > 0) {
      setButtonSlashOpen(!buttonSlashOpen);
    }
  };

  const removeImg = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newImages: ImageFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        try {
          const base64 = await fileToBase64(file);
          const preview = URL.createObjectURL(file);

          newImages.push({
            name: file.name,
            data: base64,
            mimeType: file.type,
            preview,
          });
        } catch (error) {
          console.error("Failed to read file:", error);
        }
      }

      setImages((prev) => [...prev, ...newImages]);
      e.target.value = ""; // Reset input
    },
    []
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) return;

      e.preventDefault();

      const newImages: ImageFile[] = [];

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;

        try {
          const base64 = await fileToBase64(file);
          const preview = URL.createObjectURL(file);

          newImages.push({
            name: file.name || `image-${Date.now()}.${file.type.split("/")[1]}`,
            data: base64,
            mimeType: file.type,
            preview,
          });
        } catch (error) {
          console.error("Failed to read pasted image:", error);
        }
      }

      setImages((prev) => [...prev, ...newImages]);
    },
    []
  );

  // Helper function to convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
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
  };

  return (
    <PromptInput
      value={input}
      onValueChange={handleInputChange}
      isLoading={isLoading}
      onSubmit={handleOnSubmit}
      className="w-full max-w-(--breakpoint-md) mx-auto mb-4"
    >
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pb-2">
          {images.map((img, index) => (
            <div
              key={index}
              className="relative flex items-center gap-2 rounded-lg bg-primary/5 p-2"
              onClick={(e) => e.stopPropagation()}
            >
              {img.preview && (
                <img
                  src={img.preview}
                  alt={img.name}
                  className="h-16 w-16 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <span className="block truncate text-sm">{img.name}</span>
                <span className="text-xs text-muted-foreground">
                  {img.mimeType}
                </span>
              </div>
              <button
                className="cursor-pointer hover:bg-muted p-1 rounded-md"
                onClick={() => removeImg(index)}
              >
                <VscClose />
              </button>
            </div>
          ))}
        </div>
      )}
      <SlashCommandSelector
        open={inlineSlashOpen}
        onOpenChange={setInlineSlashOpen}
        commands={commands}
        searchQuery={inlineSlashQuery}
        onSelect={handleCommandSelect}
      >
        <PromptInputTextarea
          placeholder={
            disabled ? "Waiting for response..." : "Type your instruction..."
          }
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </SlashCommandSelector>

      <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <ModelSelector session={session} />
          <ModeSelector session={session} />
        </div>

        <div className="flex items-center gap-2">
          <PromptInputAction tooltip="Choose Files">
            <label
              htmlFor="select-file-path"
              className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl"
            >
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                id="select-file-path"
                onChange={handleFileSelect}
              />
              <GrAttachment className="size-4" />
            </label>
          </PromptInputAction>
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
    </PromptInput>
  );
}
