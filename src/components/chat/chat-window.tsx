import { useRef, useMemo } from "react";
import { useSelectorSessionStore } from "@/stores";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { InteractionPromptPanel } from "./interaction-prompt";
import { Button } from "@/components/ui/button";
import PROVIDER_ICONS_MAP from "@/constants/icons";
import { ProviderType, PromptContent } from "@/types";
import { Loader } from "@/components/prompt-kit/loader";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "../prompt-kit/scroll-button";
import { Typewriter } from "@/components/ui/typewriter";
import { Spinner } from "../ui/spinner";

const EMPTY_MESSAGES: never[] = [];

interface ChatWindowProps {
  sessionId: string;
  isActive: boolean;
}

export function ChatWindow({ sessionId, isActive }: ChatWindowProps) {
  const {
    messages: messagesMap,
    sessions,
    sendMessage,
    sendInteractionResponse,
    resumeSession,
    stopStreaming,
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
    "stopStreaming",
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
    [messagesMap, sessionId]
  );

  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const ProviderIcon = session?.provider
    ? PROVIDER_ICONS_MAP[session.provider as ProviderType]
    : PROVIDER_ICONS_MAP.claude;
  const lastMessage = messages[messages.length - 1];
  const isWaitingForResponse =
    isLoading && lastMessage && lastMessage.role === "user";

  const handleSend = async (content: PromptContent[]) => {
    if (hasInteractionPrompt) {
      // If there's an interaction prompt, send the first text content as interaction response
      const textContent = content.find((c) => c.type === "text");
      if (textContent && textContent.type === "text") {
        await sendInteractionResponse(sessionId, textContent.text);
      }
    } else {
      // Normal message send
      await sendMessage(sessionId, content);
    }
  };

  const handleStop = () => {
    stopStreaming(sessionId);
  };

  const handleResume = async () => {
    try {
      await resumeSession(sessionId);
    } catch (error) {
      console.error("Failed to resume session:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden sm:w-3xl md:w-4xl mx-auto">
      {messages.length === 0 ? (
        /* Empty state - centered layout with input below icon */
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="flex flex-col items-center text-muted-foreground mb-8">
            <ProviderIcon.Combine
              size={48}
              type="color"
              className="flex items-center justify-center"
            />
            <p className="text-base mt-4">
              <Typewriter
                className="font-mono"
                text="How can I assist you with your code today?"
                speed={30}
                delay={300}
                deps={[isActive]}
              />
            </p>
          </div>

          {/* Create error state */}
          {hasCreateError && (
            <div className="flex items-center justify-start mx-auto gap-3 px-4 py-3 mb-4 rounded-lg border border-destructive/50 bg-destructive/10">
              <p className="text-sm text-destructive">
                Failed to create session: {storeError}
              </p>
            </div>
          )}

          {/* Resume Banner */}
          {canResume && !isResuming && !isCreating && (
            <div className="flex items-center justify-center mx-auto gap-3 px-4 py-3 mb-4 rounded-lg border border-border bg-muted/50">
              <p className="text-sm text-muted-foreground">Session paused</p>
              <Button size="sm" variant="default" onClick={handleResume}>
                Resume
              </Button>
            </div>
          )}

          {/* Resuming state */}
          {isResuming && (
            <div className="flex items-center justify-center mx-auto gap-2 px-4 py-3 mb-4 rounded-lg border border-border bg-muted/50">
              <Spinner className="text-foreground" />
              <p className="text-sm text-muted-foreground">
                Resuming session...
              </p>
            </div>
          )}

          {/* Input */}
          <div className="w-full">
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              disabled={isTerminated || isResuming || hasCreateError}
              session={session}
            />
          </div>
        </div>
      ) : (
        /* Messages view - scrollable with input at bottom */
        <>
          <ChatContainerRoot className="flex-1 relative">
            <ChatContainerContent className="p-4 space-y-4 min-h-full">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {isWaitingForResponse && (
                <Loader variant="dots" className="ml-1" />
              )}
              <ChatContainerScrollAnchor ref={scrollAnchorRef} />
            </ChatContainerContent>
            <div className="absolute right-1/2 translate-x-1/2 bottom-4 z-10">
              <ScrollButton
                className="shadow-sm"
                variant="secondary"
                size="icon"
              />
            </div>
          </ChatContainerRoot>

          {/* Interaction Prompt */}
          {hasInteractionPrompt && isLoading && (
            <InteractionPromptPanel sessionId={sessionId} />
          )}

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
              <Spinner className="text-foreground" />
              <p className="text-sm text-muted-foreground">
                Resuming session...
              </p>
            </div>
          )}

          {/* Input */}
          <div className="px-8">
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              disabled={isTerminated || isResuming || hasCreateError}
              session={session}
            />
          </div>
        </>
      )}
    </div>
  );
}
