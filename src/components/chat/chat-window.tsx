import { useRef, useEffect, useMemo, useState } from "react";
import { useSelectorSessionStore } from "@/stores";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { InteractionPromptPanel } from "./interaction-prompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const EMPTY_MESSAGES: never[] = [];

interface ChatWindowProps {
  sessionId: string;
}

export function ChatWindow({ sessionId }: ChatWindowProps) {
  const {
    messages: messagesMap,
    sessions,
    sendMessage,
    sendInteractionResponse,
    resumeSession,
    streamingSessions,
    interactionPrompts,
  } = useSelectorSessionStore([
    "messages",
    "sessions",
    "sendMessage",
    "sendInteractionResponse",
    "resumeSession",
    "streamingSessions",
    "interactionPrompts",
  ]);
  const isLoading = streamingSessions.has(sessionId);
  const hasInteractionPrompt = !!interactionPrompts[sessionId];
  const session = sessions.find((s) => s.id === sessionId);
  const isTerminated =
    session?.status === "terminated" ||
    session?.status === "error" ||
    session?.status === "paused";
  const canResume = isTerminated && !!session?.acp_session_id;
  const [isResuming, setIsResuming] = useState(false);
  const messages = useMemo(
    () => messagesMap[sessionId] ?? EMPTY_MESSAGES,
    [messagesMap, sessionId],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (content: string) => {
    if (hasInteractionPrompt) {
      // If there's an interaction prompt, send the content as interaction response
      await sendInteractionResponse(sessionId, content);
    } else {
      // Normal message send
      await sendMessage(sessionId, content);
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    try {
      await resumeSession(sessionId);
    } catch (error) {
      console.error("Failed to resume session:", error);
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden sm:w-3xl md:w-4xl mx-auto gap-4">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 min-h-full">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p className="text-sm">
                Send a message to start the conversation...
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Interaction Prompt */}
      {hasInteractionPrompt && <InteractionPromptPanel sessionId={sessionId} />}

      {/* Resume Banner */}
      {canResume && !isResuming && (
        <div className="flex items-center justify-center gap-3 px-4 py-3 mx-4 rounded-lg border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Session paused
          </p>
          <Button size="sm" variant="default" onClick={handleResume}>
            Resume
          </Button>
        </div>
      )}

      {/* Resuming state */}
      {isResuming && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 mx-4 rounded-lg border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Resuming session...
          </p>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        disabled={isTerminated || isResuming}
      />
    </div>
  );
}
