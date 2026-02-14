import type {
  ChatMessage as ChatMessageType,
  MessagePart,
  ToolCallInfo,
  PlanEntry,
  ImageContent,
  ToolCallContentItem,
  ToolKind,
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
  LuFileText,
  LuPencil,
  LuTrash,
  LuSearch,
  LuTerminal,
} from "react-icons/lu";
import { useState, useCallback } from "react";
import { Components } from "react-markdown";
import { CodeBlockWithHeader } from "./code-block";
import { DiffViewer } from "./diff-viewer";
import { cn } from "@/lib/utils";
import {
  Copy,
  CopySuccess,
  MessageText,
  TaskSquare,
  Image,
  CloseSquare,
} from "iconsax-reactjs";

function getToolIcon(status: string, kind?: ToolKind) {
  // Status-based icons take precedence
  switch (status) {
    case "running":
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
    case "completed":
      return <LuCircleCheckBig className="size-4 text-green-500" />;
    case "error":
      return <CloseSquare className="size-4 text-red-500" />;
    case "interrupted":
      return <LuCircleSlash className="size-4 text-yellow-500" />;
  }

  // Fallback to kind-based icons
  switch (kind) {
    case "read":
      return <LuFileText className="size-4 text-blue-500" />;
    case "edit":
      return <LuPencil className="size-4 text-yellow-500" />;
    case "delete":
      return <LuTrash className="size-4 text-red-500" />;
    case "search":
      return <LuSearch className="size-4 text-purple-500" />;
    case "execute":
      return <LuTerminal className="size-4 text-green-500" />;
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
        leftIcon={<MessageText className="size-4 text-foreground" />}
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
        leftIcon={<Image className="size-4 text-foreground" />}
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
      return (
        <LuCircleCheckBig className="size-3.5 text-green-500 dark:text-green-400" />
      );
    case "in_progress":
      return (
        <LuLoader className="size-3.5 animate-spin text-blue-500 dark:text-blue-400" />
      );
    case "pending":
      return (
        <LuCircle className="size-3.5 text-muted-foreground dark:text-muted-foreground" />
      );
    default:
      return (
        <LuCircle className="size-3.5 text-muted-foreground dark:text-muted-foreground" />
      );
  }
}

function getPriorityColor(priority: PlanEntry["priority"]) {
  switch (priority) {
    case "high":
      return "text-red-500 dark:text-red-400";
    case "medium":
      return "text-yellow-500 dark:text-yellow-400";
    case "low":
      return "text-blue-500 dark:text-blue-400";
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
    <ChainOfThoughtStep isLast={isLast}>
      <ChainOfThoughtTrigger
        leftIcon={<TaskSquare className="size-4 text-foreground" />}
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

function renderToolCallContent(
  content: ToolCallContentItem[] | null,
  tcId: string
) {
  if (!content || content.length === 0) return null;

  return (
    <div className="space-y-3">
      {content.map((item, idx) => {
        switch (item.type) {
          case "content":
            return (
              <div key={`${tcId}-content-${idx}`}>
                {item.content.type === "text" ? (
                  <pre className="whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-foreground rounded-md border border-border bg-background">
                    {item.content.text}
                  </pre>
                ) : item.content.type === "image" ? (
                  <img
                    src={`data:${item.content.mimeType};base64,${item.content.data}`}
                    alt="Tool output"
                    className="max-w-full rounded-md border border-border"
                  />
                ) : item.content.type === "resource_link" ? (
                  <a
                    href={item.content.uri}
                    className="text-blue-500 hover:underline text-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.content.name}
                  </a>
                ) : null}
              </div>
            );

          case "diff":
            return (
              <DiffViewer
                key={`${tcId}-diff-${idx}`}
                path={item.path}
                oldText={item.oldText}
                newText={item.newText}
              />
            );

          case "terminal":
            return (
              <div
                key={`${tcId}-terminal-${idx}`}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="text-xs text-muted-foreground">
                  Terminal output: {item.terminalId}
                </div>
                {/* TODO: Integrate with terminal viewer when implemented */}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function renderToolStep(tc: ToolCallInfo, isLast: boolean) {
  const hasContent = tc.content || tc.raw_input;

  console.log("renderToolStep", tc);

  // Check if content contains diff type - if so, don't show raw_input
  const hasDiffContent = tc.content?.some((item) => item.type === "diff");

  return (
    <ChainOfThoughtStep
      key={tc.tool_call_id}
      defaultOpen={
        tc.status === "error" ||
        tc.content?.some((item) => item.type === "diff")
      }
      isLast={isLast}
    >
      <ChainOfThoughtTrigger
        leftIcon={getToolIcon(tc.status, tc.kind)}
        swapIconOnHover={false}
      >
        {getToolTitle(tc)}
      </ChainOfThoughtTrigger>
      {hasContent && (
        <ChainOfThoughtContent>
          <ChainOfThoughtItem className="gap-2">
            {/* Only show raw_input if there's no diff content */}
            {tc.raw_input && !hasDiffContent && (
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
              <div
                className={
                  hasDiffContent
                    ? ""
                    : "rounded-md border border-border bg-background mt-2"
                }
              >
                {!hasDiffContent && (
                  <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Output
                    </span>
                  </div>
                )}
                <div className={hasDiffContent ? "" : "p-3"}>
                  {renderToolCallContent(tc.content, tc.tool_call_id)}
                </div>
              </div>
            )}
            {tc.locations && tc.locations.length > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-2 mt-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Affected Files:
                </div>
                <div className="space-y-1">
                  {tc.locations.map((loc, i) => (
                    <div key={i} className="text-xs text-foreground font-mono">
                      {loc.path}
                      {loc.line ? `:${loc.line}` : ""}
                    </div>
                  ))}
                </div>
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
