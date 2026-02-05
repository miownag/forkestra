import { useRef, useEffect, useMemo } from "react";
import { useSelectorSessionStore } from "@/stores";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ScrollArea } from "@/components/ui/scroll-area";

const EMPTY_MESSAGES: never[] = [];

interface ChatWindowProps {
  sessionId: string;
}

export function ChatWindow({ sessionId }: ChatWindowProps) {
  const { messages: messagesMap, sendMessage } = useSelectorSessionStore([
    "messages",
    "sendMessage",
  ]);
  const messages = useMemo(
    () => messagesMap[sessionId] ?? EMPTY_MESSAGES,
    [messagesMap, sessionId],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (content: string) => {
    await sendMessage(sessionId, content);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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

      {/* Input */}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
