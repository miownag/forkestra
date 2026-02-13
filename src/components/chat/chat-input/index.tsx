import { PromptInput } from "@/components/prompt-kit/prompt-input";
import { useState, useCallback } from "react";
import type { Session, AvailableCommand, PromptContent } from "@/types";
import { ChatInputInner } from "./input-inner";

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

  return (
    <PromptInput
      value={input}
      onValueChange={handleInputChange}
      isLoading={isLoading}
      onSubmit={undefined}
      className="w-full max-w-(--breakpoint-md) mx-auto mb-4"
      disabled={disabled}
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
  );
}
