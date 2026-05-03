import type {
  ChatMessage as ChatMessageType,
  MessagePart,
  ToolCallInfo,
  PlanEntry,
  ImageContent,
  ToolCallContentItem,
} from "@/types";
import { Markdown } from "@/components/prompt-kit/markdown";
import { Loader } from "@/components/prompt-kit/loader";
import { Tool } from "@/components/prompt-kit/tool";
import { LuCircleCheckBig, LuLoader, LuCircle } from "react-icons/lu";
import { useState, useCallback } from "react";
import { DiffViewer } from "./diff-viewer";
import { cn } from "@/lib/utils";
import { Copy, CopySuccess, TaskSquare } from "iconsax-reactjs";
import { CUSTOM_COMPONENTS_FOR_MARKDOWN } from "@/constants";

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (copied) return;
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [content, copied],
  );

  return (
    <div
      onClick={handleCopy}
      className={cn(
        "text-muted-foreground p-1 rounded-md opacity-0 group-hover/text:opacity-100 cursor-pointer",
        !copied && "hover:bg-muted",
      )}
      title="Copy content"
    >
      {copied ? (
        <CopySuccess className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  return (
    <div className="group/text relative">
      <div className="absolute right-0 top-0">
        <CopyButton content={content} />
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground text-foreground">
        <Markdown components={CUSTOM_COMPONENTS_FOR_MARKDOWN}>
          {content}
        </Markdown>
      </div>
    </div>
  );
}

function ImageBlock({ content }: { content: ImageContent }) {
  const imageUrl = `data:${content.mimeType};base64,${content.data}`;

  return (
    <div className="my-2">
      <img
        src={imageUrl}
        alt="AI generated content"
        className="max-w-full rounded-md border border-border"
      />
      {content.uri && (
        <div className="text-xs text-muted-foreground mt-1">
          Source: {content.uri}
        </div>
      )}
    </div>
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

function PlanBlock({ entries }: { entries: PlanEntry[] }) {
  const completedCount = entries.filter((e) => e.status === "completed").length;
  const totalCount = entries.length;

  return (
    <div className="my-3 rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <TaskSquare className="size-4 text-foreground" />
        <span className="text-sm font-medium text-foreground">Plan</span>
        <span className="text-xs text-muted-foreground">
          ({completedCount}/{totalCount})
        </span>
      </div>
      <div className="p-3 space-y-2">
        {entries.map((entry, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 rounded-md border border-border bg-background p-2.5"
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
                    getPriorityColor(entry.priority),
                  )}
                >
                  {entry.priority}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs capitalize text-muted-foreground">
                  {entry.status.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Custom content renderer for Tool component that supports rich content (diff, images, etc.)
 */
function renderToolContent(
  content: ToolCallContentItem[] | null,
  toolCallId: string,
) {
  if (!content || content.length === 0) return null;

  return (
    <div className="space-y-3">
      {content.map((item, idx) => {
        switch (item.type) {
          case "content":
            return (
              <div key={`${toolCallId}-content-${idx}`}>
                {item.content.type === "text" ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
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
                    className="text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 hover:underline text-sm"
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
                key={`${toolCallId}-diff-${idx}`}
                path={item.path}
                oldText={item.oldText}
                newText={item.newText}
              />
            );

          case "terminal":
            return (
              <div
                key={`${toolCallId}-terminal-${idx}`}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="text-xs text-muted-foreground">
                  Terminal output: {item.terminalId}
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function ToolCallBlock({ tc }: { tc: ToolCallInfo }) {
  return <Tool toolCall={tc} renderContent={renderToolContent} />;
}

interface StepsProps {
  message: ChatMessageType;
}

export function Steps({ message }: StepsProps) {
  const parts = message.parts;
  const planEntries = message.plan_entries;

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
        return <Loader variant="dots" className="ml-1 text-foreground mt-2" />;
      }
      return null;
    }

    return (
      <div>
        {planEntries && planEntries.length > 0 && (
          <PlanBlock entries={planEntries} />
        )}
        {fallbackParts.map((part, i) => {
          if (part.type === "text") {
            return (
              <TextBlock key={`fallback-text-${i}`} content={part.content} />
            );
          } else if (part.type === "image") {
            return (
              <ImageBlock key={`fallback-image-${i}`} content={part.content} />
            );
          } else if (part.type === "tool_call") {
            return (
              <ToolCallBlock
                key={`tool-${part.tool_call.tool_call_id}`}
                tc={part.tool_call}
              />
            );
          } else {
            return null;
          }
        })}
      </div>
    );
  }

  return (
    <div>
      {planEntries && planEntries.length > 0 && (
        <PlanBlock entries={planEntries} />
      )}
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <TextBlock key={`text-${i}`} content={part.content} />;
        } else if (part.type === "image") {
          return <ImageBlock key={`image-${i}`} content={part.content} />;
        } else if (part.type === "tool_call") {
          return (
            <ToolCallBlock
              key={`tool-${part.tool_call.tool_call_id}`}
              tc={part.tool_call}
            />
          );
        } else {
          return null;
        }
      })}
      {message.is_streaming &&
        !message.tool_calls?.some((tc) => tc.status === "running") && (
          <Loader variant="dots" className="ml-1 text-foreground mt-2" />
        )}
    </div>
  );
}
