import type {
  ChatMessage as ChatMessageType,
  MessagePart,
  ToolCallInfo,
  PlanEntry,
  ImageContent,
} from "@/types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";
import { Markdown } from "@/components/prompt-kit/markdown";
import { Loader } from "@/components/prompt-kit/loader";
import {
  LuCircleCheckBig,
  LuLoader,
  LuCircle,
  LuCircleSlash,
  LuMessageSquareText,
  LuListTodo,
  LuImage,
} from "react-icons/lu";
import { useState, useCallback } from "react";
import { Components } from "react-markdown";
import { CodeBlockWithHeader } from "./code-block";
import { cn } from "@/lib/utils";
import { Copy, CopySuccess } from "iconsax-reactjs";

function getToolIcon(status: string) {
  switch (status) {
    case "running":
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
    case "completed":
      return <LuCircleCheckBig className="size-4 text-green-500" />;
    case "error":
      return <LuCircle className="size-4 text-red-500" />;
    case "interrupted":
      return <LuCircleSlash className="size-4 text-yellow-500" />;
    default:
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
  }
}

function getToolTitle(tc: ToolCallInfo) {
  if (tc.title) return tc.title;
  if (tc.tool_name) return tc.tool_name;
  return "Tool Call";
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "plaintext";
}

const customComponents: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-muted rounded-sm px-1 font-mono text-sm",
            className
          )}
          {...props}
        >
          {children}
        </span>
      );
    }
    const language = extractLanguage(className);

    return (
      <CodeBlockWithHeader language={language}>
        {children as string}
      </CodeBlockWithHeader>
    );
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
};

function TextStep({ content, isLast }: { content: string; isLast: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (copied) return;
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [content]
  );

  return (
    <ChainOfThoughtStep defaultOpen className="group" isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuMessageSquareText className="size-4 text-foreground" />}
        swapIconOnHover={false}
        className="flex-1"
      >
        <div className="flex items-center gap-2 uppercase">
          <div>Response</div>
          <div
            onClick={handleCopy}
            className={cn(
              "text-muted-foreground p-1 rounded-md opacity-0",
              "group-hover:opacity-100",
              !copied && "hover:bg-muted"
            )}
            title="Copy content"
          >
            {copied ? (
              <CopySuccess className="size-4 text-green-500" />
            ) : (
              <Copy className="size-4" />
            )}
          </div>
        </div>
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground text-foreground">
            <Markdown components={customComponents}>{content}</Markdown>
          </div>
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function ImageStep({
  content,
  isLast,
}: {
  content: ImageContent;
  isLast: boolean;
}) {
  const imageUrl = `data:${content.mimeType};base64,${content.data}`;

  return (
    <ChainOfThoughtStep defaultOpen isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuImage className="size-4 text-foreground" />}
        swapIconOnHover={false}
      >
        Image
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <div className="space-y-2">
            <img
              src={imageUrl}
              alt="AI generated content"
              className="max-w-full rounded-md border border-border"
            />
            {content.uri && (
              <div className="text-xs text-muted-foreground">
                Source: {content.uri}
              </div>
            )}
          </div>
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function getPlanStatusIcon(status: PlanEntry["status"]) {
  switch (status) {
    case "completed":
      return <LuCircleCheckBig className="size-3.5 text-green-500" />;
    case "in_progress":
      return <LuLoader className="size-3.5 animate-spin text-blue-500" />;
    case "pending":
      return <LuCircle className="size-3.5 text-muted-foreground" />;
    default:
      return <LuCircle className="size-3.5 text-muted-foreground" />;
  }
}

function getPriorityColor(priority: PlanEntry["priority"]) {
  switch (priority) {
    case "high":
      return "text-red-500";
    case "medium":
      return "text-yellow-500";
    case "low":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

function PlanStep({
  entries,
  isLast,
}: {
  entries: PlanEntry[];
  isLast: boolean;
}) {
  const completedCount = entries.filter((e) => e.status === "completed").length;
  const totalCount = entries.length;

  return (
    <ChainOfThoughtStep defaultOpen={false} isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<LuListTodo className="size-4 text-foreground" />}
        swapIconOnHover={false}
      >
        <div className="flex items-center gap-2">
          <span className="uppercase">Plan</span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{totalCount})
          </span>
        </div>
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5"
              >
                <div className="mt-0.5">{getPlanStatusIcon(entry.status)}</div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm leading-relaxed text-foreground">
                    {entry.content}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-medium uppercase",
                        getPriorityColor(entry.priority)
                      )}
                    >
                      {entry.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {entry.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChainOfThoughtItem>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function renderToolStep(tc: ToolCallInfo, isLast: boolean) {
  const hasContent = tc.content || tc.raw_input;
  return (
    <ChainOfThoughtStep
      key={tc.tool_call_id}
      defaultOpen={tc.status === "error"}
      isLast={isLast}
    >
      <ChainOfThoughtTrigger
        leftIcon={getToolIcon(tc.status)}
        swapIconOnHover={false}
      >
        {getToolTitle(tc)}
      </ChainOfThoughtTrigger>
      {hasContent && (
        <ChainOfThoughtContent>
          <ChainOfThoughtItem className="gap-2">
            {tc.raw_input && (
              <div className="rounded-md border border-border bg-muted/50">
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Input
                  </span>
                </div>
                <pre className="whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {JSON.stringify(tc.raw_input, null, 2)}
                </pre>
              </div>
            )}
            {tc.content && (
              <div className="rounded-md border border-border bg-background">
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Output
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-foreground">
                  {tc.content}
                </pre>
              </div>
            )}
          </ChainOfThoughtItem>
        </ChainOfThoughtContent>
      )}
    </ChainOfThoughtStep>
  );
}

interface StepsProps {
  message: ChatMessageType;
}

export function Steps({ message }: StepsProps) {
  const parts = message.parts;
  const planEntries = message.plan_entries;

  console.log("message", message);

  // If no parts yet (legacy or loading), fall back to content + tool_calls
  if (!parts || parts.length === 0) {
    const fallbackParts: MessagePart[] = [];
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        fallbackParts.push({ type: "tool_call", tool_call: tc });
      }
    }
    if (message.content.trim()) {
      fallbackParts.push({ type: "text", content: message.content });
    }

    if (
      fallbackParts.length === 0 &&
      (!planEntries || planEntries.length === 0)
    ) {
      if (message.is_streaming) {
        return <Loader variant="dots" className="ml-1 text-foreground" />;
      }
      return null;
    }

    return (
      <ChainOfThought>
        {planEntries && planEntries.length > 0 && (
          <PlanStep entries={planEntries} isLast={fallbackParts.length === 0} />
        )}
        {fallbackParts.map((part, i) => {
          const isLast = i === fallbackParts.length - 1;
          if (part.type === "text") {
            return (
              <TextStep
                key={`fallback-text-${i}`}
                content={part.content}
                isLast={isLast}
              />
            );
          } else if (part.type === "image") {
            return (
              <ImageStep
                key={`fallback-image-${i}`}
                content={part.content}
                isLast={isLast}
              />
            );
          } else if (part.type === "tool_call") {
            return renderToolStep(part.tool_call, isLast);
          } else {
            return null;
          }
        })}
      </ChainOfThought>
    );
  }

  return (
    <>
      <ChainOfThought>
        {planEntries && planEntries.length > 0 && (
          <PlanStep entries={planEntries} isLast={parts.length === 0} />
        )}
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          if (part.type === "text") {
            return (
              <TextStep
                key={`text-${i}`}
                content={part.content}
                isLast={isLast}
              />
            );
          } else if (part.type === "image") {
            return (
              <ImageStep
                key={`image-${i}`}
                content={part.content}
                isLast={isLast}
              />
            );
          } else if (part.type === "tool_call") {
            return renderToolStep(part.tool_call, isLast);
          } else {
            return null;
          }
        })}
      </ChainOfThought>
      {message.is_streaming &&
        !message.tool_calls?.some((tc) => tc.status === "running") && (
          <Loader variant="dots" className="ml-1 text-foreground" />
        )}
    </>
  );
}
