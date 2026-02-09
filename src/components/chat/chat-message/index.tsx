import type { ChatMessage as ChatMessageType } from "@/types";
import { cn } from "@/lib/utils";
import { Steps } from "./steps";

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
        {isUser ? (
          <div className="max-w-none">{message.content}</div>
        ) : (
          <Steps message={message} />
        )}
      </div>
    </div>
  );
}
