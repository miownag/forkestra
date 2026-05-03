import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  LuCircleCheckBig,
  LuLoader,
  LuFileText,
  LuPencil,
  LuTrash,
  LuSearch,
  LuTerminal,
} from "react-icons/lu";
import { CloseSquare, Forbidden } from "iconsax-reactjs";
import { useState, useEffect } from "react";
import type {
  ToolCallInfo,
  ToolCallContentItem,
  ToolKind,
} from "@/types";

export type ToolProps = {
  toolCall: ToolCallInfo;
  defaultOpen?: boolean;
  className?: string;
  renderContent?: (
    content: ToolCallContentItem[] | null,
    toolCallId: string
  ) => React.ReactNode;
};

function getStatusIcon(status: string, kind?: ToolKind) {
  switch (status) {
    case "running":
      return <LuLoader className="size-4 animate-spin text-blue-500" />;
    case "completed":
      return <LuCircleCheckBig className="size-4 text-green-500" />;
    case "error":
      return <CloseSquare className="size-4 text-red-500" />;
    case "interrupted":
      return <Forbidden className="size-4 text-yellow-500" />;
  }

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

function getStatusBadge(status: string) {
  const baseClasses = "px-1.5 py-0.5 rounded-full text-xs font-medium";
  switch (status) {
    case "running":
      return (
        <span
          className={cn(
            baseClasses,
            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          )}
        >
          Running
        </span>
      );
    case "completed":
      return (
        <span
          className={cn(
            baseClasses,
            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          Completed
        </span>
      );
    case "error":
      return (
        <span
          className={cn(
            baseClasses,
            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}
        >
          Error
        </span>
      );
    case "interrupted":
      return (
        <span
          className={cn(
            baseClasses,
            "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          )}
        >
          Interrupted
        </span>
      );
    default:
      return null;
  }
}

function getToolTitle(tc: ToolCallInfo) {
  if (tc.title) return tc.title;
  if (tc.tool_name) return tc.tool_name;
  return "Tool Call";
}

function DefaultContentRenderer(
  content: ToolCallContentItem[] | null,
  toolCallId: string
) {
  if (!content || content.length === 0) return null;

  return (
    <div className="space-y-2">
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
                    className="text-blue-500 hover:underline text-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.content.name}
                  </a>
                ) : null}
              </div>
            );

          case "terminal":
            return (
              <div
                key={`${toolCallId}-terminal-${idx}`}
                className="text-xs text-muted-foreground"
              >
                Terminal: {item.terminalId}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

const Tool = ({
  toolCall,
  defaultOpen,
  className,
  renderContent,
}: ToolProps) => {
  const hasDiffContent = toolCall.content?.some(
    (item) => item.type === "diff"
  );
  const [isOpen, setIsOpen] = useState(defaultOpen ?? !!hasDiffContent);
  const hasContent = toolCall.content || toolCall.raw_input;

  useEffect(() => {
    if (hasDiffContent) {
      setIsOpen(true);
    }
  }, [hasDiffContent]);

  const contentRenderer = renderContent ?? DefaultContentRenderer;

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border border-border",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 min-w-0">
            {getStatusIcon(toolCall.status, toolCall.kind)}
            <span className="text-sm truncate">{getToolTitle(toolCall)}</span>
            {getStatusBadge(toolCall.status)}
          </div>
          {hasContent && (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground shrink-0 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasContent && (
          <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
            <div className="border-t border-border bg-muted/10 p-3 space-y-3">
              {/* Input section */}
              {toolCall.raw_input && !hasDiffContent && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Input
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed text-muted-foreground max-h-40 overflow-auto">
                    {JSON.stringify(toolCall.raw_input, null, 2)}
                  </pre>
                </div>
              )}

              {/* Output / Content section */}
              {toolCall.content && (
                <div>
                  {!hasDiffContent && (
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">
                      Output
                    </div>
                  )}
                  <div
                    className={
                      hasDiffContent
                        ? ""
                        : "rounded-md border border-border bg-background p-2.5 max-h-60 overflow-auto"
                    }
                  >
                    {contentRenderer(toolCall.content, toolCall.tool_call_id)}
                  </div>
                </div>
              )}

              {/* Locations */}
              {toolCall.locations && toolCall.locations.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Affected Files
                  </div>
                  <div className="space-y-0.5">
                    {toolCall.locations.map((loc, i) => (
                      <div
                        key={i}
                        className="text-xs text-foreground font-mono"
                      >
                        {loc.path}
                        {loc.line ? `:${loc.line}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
};

export { Tool };
