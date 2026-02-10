import { useRef, useEffect, useMemo } from "react";
import { useSelectorSessionStore } from "@/stores";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { InteractionPromptPanel } from "./interaction-prompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import PROVIDER_ICONS_MAP from "@/constants/icons";
import { ProviderType } from "@/types";
import { Loader } from "@/components/prompt-kit/loader";

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
    setSessionModel,
    streamingSessions,
    resumingSessions,
    creatingSessions,
    interactionPrompts,
    error: storeError,
  } = useSelectorSessionStore([
    "messages",
    "sessions",
    "sendMessage",
    "sendInteractionResponse",
    "resumeSession",
    "setSessionModel",
    "streamingSessions",
    "resumingSessions",
    "creatingSessions",
    "interactionPrompts",
    "error",
  ]);
  const isLoading = streamingSessions.has(sessionId);
  const hasInteractionPrompt = !!interactionPrompts[sessionId];
  const session = sessions.find((s) => s.id === sessionId);
  const isCreating =
    session?.status === "creating" || creatingSessions.has(sessionId);
  const isTerminated =
    session?.status === "terminated" ||
    session?.status === "error" ||
    session?.status === "paused";
  const canResume = isTerminated && !!session?.acp_session_id;
  const isResuming = resumingSessions.has(sessionId);
  const hasCreateError = !!storeError && isCreating;

  const messages = useMemo(
    () => messagesMap[sessionId] ?? EMPTY_MESSAGES,
    [messagesMap, sessionId],
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ProviderIcon = session?.provider
    ? PROVIDER_ICONS_MAP[session.provider as ProviderType]
    : PROVIDER_ICONS_MAP.claude;
  const lastMessage = messages[messages.length - 1];
  const isWaitingForResponse =
    isLoading && lastMessage && lastMessage.role === "user";

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
    try {
      await resumeSession(sessionId);
    } catch (error) {
      console.error("Failed to resume session:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden sm:w-3xl md:w-4xl mx-auto gap-4">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 min-h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground h-128">
              <ProviderIcon.Combine
                size={48}
                type="color"
                className="flex items-center justify-center"
              />
              <p className="text-sm mt-4">
                Send a message to start the conversation...
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          {isWaitingForResponse && <Loader variant="dots" className="ml-1" />}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Interaction Prompt */}
      {hasInteractionPrompt && <InteractionPromptPanel sessionId={sessionId} />}

      {/* Create error state */}
      {hasCreateError && (
        <div className="flex items-center justify-start mx-auto gap-3 px-4 py-3 rounded-lg border border-destructive/50 bg-destructive/10">
          <p className="text-sm text-destructive">
            Failed to create session: {storeError}
          </p>
        </div>
      )}

      {/* Resume Banner */}
      {canResume && !isResuming && !isCreating && (
        <div className="flex items-center justify-center mx-auto gap-3 px-4 py-3 rounded-lg border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground">Session paused</p>
          <Button size="sm" variant="default" onClick={handleResume}>
            Resume
          </Button>
        </div>
      )}

      {/* Resuming state */}
      {isResuming && (
        <div className="flex items-center justify-center mx-auto gap-2 px-4 py-3 rounded-lg border border-border bg-muted/50">
          <Loader variant="classic" className="text-foreground" />
          <p className="text-sm text-muted-foreground">Resuming session...</p>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        disabled={isTerminated || isResuming || hasCreateError}
        session={session}
        onModelChange={(modelId) => setSessionModel(sessionId, modelId)}
      />
    </div>
  );
}
