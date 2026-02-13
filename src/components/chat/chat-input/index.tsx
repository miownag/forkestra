import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { GrAttachment } from "react-icons/gr";
import { useState, useCallback } from "react";
import type { Session, AvailableCommand } from "@/types";
import { TbSlash } from "react-icons/tb";
import { SlashCommandSelector } from "./slash-command-selector";
import { ModelSelector } from "./model-selector";
import { ModeSelector } from "./mode-selector";
import { Send2, StopCircle } from "iconsax-reactjs";

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  session,
}: {
  onSend: (content: string) => Promise<void>;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  session?: Session;
}) {
  const [input, setInput] = useState("");
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
      await onSend(`/${command.name}`);
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
    if (input.trim() && !disabled) {
      setInlineSlashOpen(false);
      setInlineSlashQuery("");
      setButtonSlashOpen(false);
      await onSend(input);
      setInput("");
    }
  };

  const handleSlashButtonClick = () => {
    if (commands.length > 0) {
      setButtonSlashOpen(!buttonSlashOpen);
    }
  };

  return (
    <PromptInput
      value={input}
      onValueChange={handleInputChange}
      isLoading={isLoading}
      onSubmit={handleOnSubmit}
      className="w-full max-w-(--breakpoint-md) mx-auto mb-4"
    >
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
                className="hidden"
                id="select-file-path"
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
