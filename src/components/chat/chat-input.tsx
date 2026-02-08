import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";
import { LuArrowUp, LuSquare } from "react-icons/lu";
import { GrAttachment } from "react-icons/gr";
import { useState } from "react";

export function ChatInput({
  onSend,
  isLoading,
  disabled,
}: {
  onSend: (content: string) => Promise<void>;
  isLoading: boolean;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const handleOnSubmit = async () => {
    if (input.trim() && !disabled) {
      await onSend(input);
      setInput("");
    }
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
        <PromptInputAction tooltip="Attach files">
          <label
            htmlFor="file-upload"
            className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl"
          >
            <input type="file" multiple className="hidden" id="file-upload" />
            <GrAttachment className="text-primary size-5" />
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
      </PromptInputActions>
    </PromptInput>
  );
}
