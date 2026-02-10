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
import { useState } from "react";
import type { Session } from "@/types";
import { TbBrain } from "react-icons/tb";

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  session,
  onModelChange,
}: {
  onSend: (content: string) => Promise<void>;
  isLoading: boolean;
  disabled?: boolean;
  session?: Session;
  onModelChange?: (modelId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);

  const availableModels = session?.available_models ?? [];
  const currentModel = availableModels.find(
    (m) => m.model_id === session?.model,
  );

  const handleOnSubmit = async () => {
    if (input.trim() && !disabled) {
      await onSend(input);
      setInput("");
    }
  };

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId);
    setModelPopoverOpen(false);
  };

  return (
    <PromptInput
      value={input}
      onValueChange={setInput}
      isLoading={isLoading}
      onSubmit={handleOnSubmit}
      className="w-full max-w-(--breakpoint-md) mx-auto mb-4"
    >
      <PromptInputTextarea
        placeholder={
          disabled ? "Waiting for response..." : "Type your instruction..."
        }
        disabled={disabled}
      />

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
          <PromptInputAction tooltip="Attach files">
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
          <PromptInputAction
            tooltip={isLoading ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleOnSubmit}
              disabled={disabled}
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
