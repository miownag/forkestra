import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LuArrowUp, LuSquare, LuCheck } from "react-icons/lu";
import { GrAttachment } from "react-icons/gr";
import { useState, useCallback } from "react";
import type { Session, AvailableCommand } from "@/types";
import { TbBrain, TbSlash } from "react-icons/tb";
import { SlashCommandSelector } from "./slash-command-selector";

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  session,
  onModelChange,
}: {
  onSend: (content: string) => Promise<void>;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  session?: Session;
  onModelChange?: (modelId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [inlineSlashOpen, setInlineSlashOpen] = useState(false);
  const [inlineSlashQuery, setInlineSlashQuery] = useState("");
  const [buttonSlashOpen, setButtonSlashOpen] = useState(false);

  const commands = session?.available_commands ?? [];

  const availableModels = session?.available_models ?? [];
  const currentModel = availableModels.find(
    (m) => m.model_id === session?.model,
  );

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
              c.name.toLowerCase().startsWith(query.toLowerCase()),
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
    [commands],
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
    [onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" && inlineSlashOpen) {
        e.preventDefault();
        setInlineSlashOpen(false);
        setInlineSlashQuery("");
      }
    },
    [inlineSlashOpen],
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

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId);
    setModelPopoverOpen(false);
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
        <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
          <PopoverTrigger asChild>
            {currentModel ? (
              <button className="flex items-center gap-1 p-1.5 rounded-md cursor-pointer text-muted-foreground hover:bg-secondary-foreground/5!">
                <TbBrain />
                <span className="text-xs">{currentModel.display_name}</span>
              </button>
            ) : (
              <span />
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-lg p-1"
            align="start"
            side="top"
            sideOffset={8}
          >
            {availableModels.map((m) => (
              <button
                key={m.model_id}
                type="button"
                className="w-full flex justify-between items-center rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                onClick={() => handleModelSelect(m.model_id)}
              >
                <div className="flex flex-col justify-between">
                  <span className="text-xs flex-1 text-left">
                    {m.display_name}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {m.description}
                  </p>
                </div>
                {session?.model === m.model_id && (
                  <LuCheck className="size-4 text-primary" />
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>

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
              <GrAttachment className="text-primary size-4" />
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
              <TbSlash className="text-primary size-5" />
            </button>
          </SlashCommandSelector>
          <PromptInputAction
            tooltip={isLoading ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={isLoading ? onStop : handleOnSubmit}
              disabled={!isLoading && disabled}
            >
              {isLoading ? (
                <LuSquare className="size-4 fill-current" />
              ) : (
                <LuArrowUp className="size-5" />
              )}
            </Button>
          </PromptInputAction>
        </div>
      </PromptInputActions>
    </PromptInput>
  );
}
