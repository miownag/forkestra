import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { VscAccount, VscRobot, VscCopy, VscCheck } from "react-icons/vsc";
import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnsiRenderer } from "@/components/ui/ansi-renderer";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? (
          <VscAccount className="h-4 w-4" />
        ) : (
          <VscRobot className="h-4 w-4" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <div
          className={cn(
            "max-w-none",
            !isUser && "prose prose-sm dark:prose-invert",
          )}
        >
          {isUser ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  const code = String(children).replace(/\n$/, "");

                  if (isInline) {
                    return (
                      <code
                        className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-mono",
                          "bg-primary-foreground/20",
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  return (
                    <div className="relative group my-3">
                      <div
                        className={cn(
                          "flex items-center justify-between px-3 py-1.5 rounded-t-md text-xs",
                          "bg-primary-foreground/10",
                        )}
                      >
                        <span className="font-mono opacity-70">
                          {match?.[1] || "code"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(code)}
                        >
                          {copiedCode === code ? (
                            <VscCheck className="h-3 w-3" />
                          ) : (
                            <VscCopy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <pre
                        className={cn(
                          "p-3 rounded-b-md overflow-x-auto text-xs",
                          "bg-primary-foreground/10",
                        )}
                      >
                        <code className="font-mono">{code}</code>
                      </pre>
                    </div>
                  );
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                  return <ul className="list-disc pl-4 mb-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal pl-4 mb-2">{children}</ol>;
                },
                li({ children }) {
                  return <li className="mb-1">{children}</li>;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "underline underline-offset-2",
                        "text-primary-foreground/90 hover:text-primary-foreground",
                      )}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <div className="text-foreground">
              <AnsiRenderer content={message.content} />
            </div>
          )}
        </div>

        {/* Streaming indicator */}
        {message.is_streaming && (
          <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}
