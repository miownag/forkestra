import { PromptInput } from "@/components/prompt-kit/prompt-input";
import { useState, useCallback, useMemo } from "react";
import type { Session, AvailableCommand, PromptContent } from "@/types";
import { ChatInputInner } from "./input-inner";
import { RotatingTip, TipItem } from "@/components/ui/rotating-tip";
import {
  Command,
  DocumentText1,
  Flashy,
  GalleryAdd,
  Keyboard,
} from "iconsax-reactjs";

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  session,
  hasMessage,
}: {
  onSend: (content: PromptContent[]) => Promise<void>;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  session?: Session;
  hasMessage?: boolean;
}) {
  const [input, setInput] = useState("");
  const [inlineSlashOpen, setInlineSlashOpen] = useState(false);
  const [inlineSlashQuery, setInlineSlashQuery] = useState("");
  const [buttonSlashOpen, setButtonSlashOpen] = useState(false);
  const [inlineFileOpen, setInlineFileOpen] = useState(false);
  const [buttonFileOpen, setButtonFileOpen] = useState(false);

  const commands = session?.available_commands ?? [];
  const projectPath = session?.worktree_path || session?.project_path || "";

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);

      // Detect slash command pattern: "/" at start or after a space
      const slashMatch = value.match(/(^|\s)\/(\S*)$/);
      if (slashMatch && commands.length > 0) {
        const query = slashMatch[2];
        const hasMatches = query
          ? commands.some((c) =>
              c.name.toLowerCase().startsWith(query.toLowerCase())
            )
          : true;
        if (hasMatches) {
          setInlineSlashQuery(query);
          setInlineSlashOpen(true);
          setInlineFileOpen(false);
        } else {
          setInlineSlashOpen(false);
          setInlineSlashQuery("");
        }
      } else {
        setInlineSlashOpen(false);
        setInlineSlashQuery("");
      }

      // Detect @ pattern: "@" at start or after a space
      const atMatch = value.match(/(^|\s)@(\S*)$/);
      if (atMatch && !slashMatch) {
        setInlineFileOpen(true);
      } else if (!atMatch) {
        setInlineFileOpen(false);
      }
    },
    [commands]
  );

  const handleCommandSelect = useCallback(
    async (command: AvailableCommand) => {
      setInlineSlashOpen(false);
      setInlineSlashQuery("");
      setButtonSlashOpen(false);
      setInput("");
      await onSend([{ type: "text", text: `/${command.name}` }]);
    },
    [onSend]
  );

  const handleSlashButtonClick = () => {
    if (commands.length > 0) {
      setButtonSlashOpen(!buttonSlashOpen);
    }
  };

  const handleAttachButtonClick = () => {
    setButtonFileOpen(!buttonFileOpen);
  };

  // Mock tips for the rotating tip component
  const tips: TipItem[] = useMemo(
    () => [
      {
        id: "1",
        content: (
          <span className="flex items-center gap-1.5">
            <Keyboard className="size-4" />
            Press <kbd className="px-1 bg-muted font-mono rounded">
              Enter
            </kbd>{" "}
            to send,{" "}
            <kbd className="px-1 bg-muted font-mono rounded">Shift + Enter</kbd>{" "}
            for new line
          </span>
        ),
      },
      {
        id: "2",
        content: (
          <span className="flex items-center gap-1.5">
            <GalleryAdd className="size-3.5" />
            <kbd className="px-1 bg-muted font-mono rounded">⌘ + V</kbd> to
            attach images in context
          </span>
        ),
      },
      {
        id: "3",
        content: (
          <span className="flex items-center gap-1.5">
            <DocumentText1 className="size-3.5" />
            Type <span className="text-primary/90 font-medium">@</span> to
            reference files in your project
          </span>
        ),
      },
      {
        id: "4",
        content: (
          <span className="flex items-center gap-1.5">
            <Flashy className="size-3.5" />
            Use <span className="text-primary/90 font-medium">/</span> commands
            for quick actions like /init
          </span>
        ),
      },
      {
        id: "5",
        content: (
          <span className="flex items-center gap-1.5">
            <Command className="size-3" />
            Use{" "}
            <kbd className="px-1 py-0.5 bg-muted font-mono rounded">
              ⌘ + ⌥ + N
            </kbd>{" "}
            to quickly create a new session based on the current one
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="w-full mx-auto mb-4 space-y-3">
      <RotatingTip
        tips={tips}
        interval={5000}
        showNavigation={false}
        showBgAndBorder={hasMessage}
        showCloseButton={hasMessage}
        showIndicator={hasMessage}
      />
      <PromptInput
        value={input}
        onValueChange={handleInputChange}
        isLoading={isLoading}
        onSubmit={undefined}
        className="w-full"
        disabled={disabled}
        autoFocus
      >
        <ChatInputInner
          input={input}
          setInput={setInput}
          onSend={onSend}
          disabled={disabled}
          isLoading={isLoading}
          onStop={onStop}
          inlineSlashOpen={inlineSlashOpen}
          setInlineSlashOpen={setInlineSlashOpen}
          inlineSlashQuery={inlineSlashQuery}
          setInlineSlashQuery={setInlineSlashQuery}
          inlineFileOpen={inlineFileOpen}
          setInlineFileOpen={setInlineFileOpen}
          buttonFileOpen={buttonFileOpen}
          setButtonFileOpen={setButtonFileOpen}
          buttonSlashOpen={buttonSlashOpen}
          setButtonSlashOpen={setButtonSlashOpen}
          commands={commands}
          projectPath={projectPath}
          session={session}
          handleCommandSelect={handleCommandSelect}
          handleSlashButtonClick={handleSlashButtonClick}
          handleAttachButtonClick={handleAttachButtonClick}
        />
      </PromptInput>
    </div>
  );
}
