import type {
  ChatMessage as ChatMessageType,
  MessagePart,
  ToolCallInfo,
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
  LuCheck,
  LuCircleCheckBig,
  LuLoader,
  LuCircle,
  LuMessageSquareText,
  LuCopy,
} from "react-icons/lu";
import { useState, useCallback } from "react";
import { Tool } from "@/components/prompt-kit/tool";

function getToolIcon(status: string) {
  switch (status) {
    case "running":
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
    case "completed":
      return <LuCircleCheckBig className="size-4 text-green-500" />;
    case "error":
      return <LuCircle className="size-4 text-red-500" />;
    default:
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
  }
}

function getToolTitle(tc: ToolCallInfo) {
  if (tc.title) return tc.title;
  if (tc.tool_name) return tc.tool_name;
  return "Tool Call";
}

function TextStep({ content, isLast }: { content: string; isLast: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [content],
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
            className="text-muted-foreground hover:text-foreground cursor-pointer opacity-0 group-hover:opacity-100"
            title="Copy content"
          >
            {copied ? (
              <LuCheck className="size-3.5 text-green-500" />
            ) : (
              <LuCopy className="size-3.5" />
            )}
          </div>
        </div>
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground text-foreground">
            <Markdown>{content}</Markdown>
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

    if (fallbackParts.length === 0) {
      if (message.is_streaming) {
        return <Loader variant="dots" className="ml-1 text-foreground" />;
      }
      return null;
    }

    return (
      <ChainOfThought>
        {fallbackParts.map((part, i) =>
          part.type === "text" ? (
            <TextStep
              key={`fallback-text-${i}`}
              content={part.content}
              isLast={i === fallbackParts.length - 1}
            />
          ) : (
            renderToolStep(part.tool_call, i === fallbackParts.length - 1)
          ),
        )}
      </ChainOfThought>
    );
  }

  return (
    <>
      <ChainOfThought>
        {parts.map((part, i) =>
          part.type === "text" ? (
            <TextStep
              key={`text-${i}`}
              content={part.content}
              isLast={i === parts.length - 1}
            />
          ) : (
            renderToolStep(part.tool_call, i === parts.length - 1)
          ),
        )}
      </ChainOfThought>
      {message.is_streaming &&
        !message.tool_calls?.some((tc) => tc.status === "running") && (
          <Loader variant="dots" className="ml-1 text-foreground" />
        )}
    </>
  );
}
