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
import { ModelTag } from "@lobehub/icons";
import type { Session } from "@/types";

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
    (m) => m.model_id === session?.model
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
              <button className="text-xs p-1.5 rounded-md cursor-pointer">
                <ModelTag
                  model={currentModel.model_id}
                  className="size-4 fill-current bg-transparent! hover:bg-secondary-foreground/10!"
                  type="color"
                />
              </button>
            ) : session?.model ? (
              <button className="text-xs p-1.5 rounded-md cursor-pointer text-muted-foreground">
                {session.model}
              </button>
            ) : (
              <span />
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-52 p-1"
            align="start"
            side="top"
            sideOffset={8}
          >
            {availableModels.map((m) => (
              <button
                key={m.model_id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                onClick={() => handleModelSelect(m.model_id)}
              >
                <span className="text-xs flex-1 text-left">
                  {m.display_name}
                </span>
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
