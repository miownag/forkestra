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
import { FiAlertCircle } from "react-icons/fi";
import { Pause, Play, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

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
    terminateSession,
    streamingSessions,
    resumingSessions,
    creatingSessions,
    interactionPrompts,
    error: storeError,
    clearError,
  } = useSelectorSessionStore([
    "messages",
    "sessions",
    "sendMessage",
    "sendInteractionResponse",
    "resumeSession",
    "stopStreaming",
    "terminateSession",
    "streamingSessions",
    "resumingSessions",
    "creatingSessions",
    "interactionPrompts",
    "error",
    "clearError",
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
  const hasResumeError = !!storeError && canResume && !isResuming;

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
    clearError();
    try {
      await resumeSession(sessionId);
    } catch (error) {
      console.error("Failed to resume session:", error);
      // Error is already set in store, no need to handle here
    }
  };

  const handleDeleteSession = async () => {
    try {
      await terminateSession(sessionId, true);
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden mx-auto w-4/5 max-w-4xl">
      {messages.length === 0 ? (
        /* Empty state - centered layout with input below icon */
        <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-24">
          <div className="flex flex-col items-center text-muted-foreground mb-12">
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

          {/* Input with floating notifications */}
          <div className="w-full relative">
            {/* Create error state - floating above input */}
            {hasCreateError && (
              <div className="absolute left-4 right-4 bottom-full mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-gradient-to-r from-destructive/10 to-destructive/5 backdrop-blur-sm shadow-lg shadow-destructive/10">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                  <AlertTriangle className="size-4" />
                </div>
                <p className="text-sm text-destructive/90">
                  Failed to create session: {storeError}
                </p>
              </div>
            )}

            {/* Resume Banner - floating above input */}
            {canResume && !isResuming && !isCreating && !hasResumeError && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-[calc(100%-2rem)] max-w-lg flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/5 backdrop-blur-sm shadow-lg shadow-amber-500/10">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/20 text-muted-foreground ring-1 ring-amber-500/30">
                    <Pause className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">
                      Session paused
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Click resume to continue
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleResume}
                  className="h-8 px-4 gap-1.5 text-xs font-medium border-0 shadow-sm shadow-primary/20 transition-all duration-200"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              </div>
            )}

            {/* Resume error state - floating above input */}
            {hasResumeError && (
              <div className="absolute left-4 right-4 bottom-full mb-3 flex flex-col gap-3 px-4 py-4 rounded-xl border border-destructive/30 bg-gradient-to-r from-destructive/10 to-destructive/5 backdrop-blur-sm shadow-lg shadow-destructive/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                    <FiAlertCircle className="size-4" />
                  </div>
                  <p className="text-sm text-destructive/90">
                    Failed to resume session: {storeError}
                  </p>
                </div>
                <div className="flex gap-2 pl-11">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResume}
                    className="h-8 px-3 gap-1.5 text-xs font-medium border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteSession}
                    className="h-8 px-3 gap-1.5 text-xs font-medium transition-all duration-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Resuming state - floating above input */}
            {isResuming && (
              <div className="absolute left-4 right-4 bottom-full mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/5 backdrop-blur-sm shadow-lg shadow-cyan-500/10">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/20">
                  <Spinner className="size-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/90">
                    Resuming session
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Please wait...
                  </p>
                </div>
              </div>
            )}

            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              disabled={isTerminated || isResuming || hasCreateError}
              session={session}
              hasMessage={false}
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

          {/* Input with floating notifications */}
          <div className="px-8 relative">
            {/* Create error state - floating above input */}
            {hasCreateError && (
              <div className="absolute left-12 right-12 bottom-full mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-gradient-to-r from-destructive/10 to-destructive/5 backdrop-blur-sm shadow-lg shadow-destructive/10">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                  <AlertTriangle className="size-4" />
                </div>
                <p className="text-sm text-destructive/90">
                  Failed to create session: {storeError}
                </p>
              </div>
            )}

            {/* Resume Banner - floating above input */}
            {canResume && !isResuming && !isCreating && !hasResumeError && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-[calc(100%-6rem)] max-w-lg flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/5 backdrop-blur-sm shadow-lg shadow-amber-500/10">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/20 text-muted-foreground ring-1 ring-amber-500/30">
                    <Pause className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">
                      Session paused
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Click resume to continue
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleResume}
                  className="h-8 px-4 gap-1.5 text-xs font-medium border-0 shadow-sm shadow-primary/20 transition-all duration-200"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              </div>
            )}

            {/* Resume error state - floating above input */}
            {hasResumeError && (
              <div className="absolute left-12 right-12 bottom-full mb-3 flex flex-col gap-3 px-4 py-4 rounded-xl border border-destructive/30 bg-gradient-to-r from-destructive/10 to-destructive/5 backdrop-blur-sm shadow-lg shadow-destructive/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                    <FiAlertCircle className="size-4" />
                  </div>
                  <p className="text-sm text-destructive/90">
                    Failed to resume session: {storeError}
                  </p>
                </div>
                <div className="flex gap-2 pl-11">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResume}
                    className="h-8 px-3 gap-1.5 text-xs font-medium border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteSession}
                    className="h-8 px-3 gap-1.5 text-xs font-medium transition-all duration-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Resuming state - floating above input */}
            {isResuming && (
              <div className="absolute left-12 right-12 bottom-full mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/5 backdrop-blur-sm shadow-lg shadow-cyan-500/10">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/20">
                  <Spinner className="size-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/90">
                    Resuming session
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Please wait...
                  </p>
                </div>
              </div>
            )}

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
