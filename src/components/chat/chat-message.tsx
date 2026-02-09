import type { ChatMessage as ChatMessageType } from "@/types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/prompt-kit/markdown";
import { Loader } from "../prompt-kit/loader";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "max-w-full rounded-lg px-4 py-3",
          isUser && "bg-primary text-primary-foreground",
        )}
      >
        <div
          className={cn(
            "max-w-none",
            !isUser && "prose prose-sm dark:prose-invert",
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <div className="text-foreground">
              <Markdown>{message.content}</Markdown>
            </div>
          )}
        </div>

        {/* Streaming indicator */}
        {message.is_streaming && (
          <Loader variant="dots" className="ml-1 text-foreground" />
        )}
      </div>
    </div>
  );
}
