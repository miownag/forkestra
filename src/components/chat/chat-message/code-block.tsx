import {
  CodeBlock,
  CodeBlockCode,
  CodeBlockGroup,
} from "@/components/prompt-kit/code-block";
import { Button } from "@/components/ui/button";
import { BiCollapseVertical, BiExpandVertical } from "react-icons/bi";
import { useState } from "react";
import { useSelectorSettingsStore } from "@/stores";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "@/components/chat/chat-message/mermaid-diagram";
import { Copy, CopySuccess } from "iconsax-reactjs";

export function CodeBlockWithHeader({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = () => {
    if (copied) return;
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-3xl">
      <CodeBlock>
        <CodeBlockGroup className="border-border border-b px-4 py-1.5">
          <button
            className={cn(
              "flex items-center text-muted-foreground text-sm gap-1.5",
              "hover:bg-muted/50 rounded-sm px-1.5 py-0.5 cursor-pointer"
            )}
            onClick={() => setCollapsed((pre) => !pre)}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <BiExpandVertical /> : <BiCollapseVertical />}
            {language}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground",
              copied && "cursor-default hover:bg-transparent"
            )}
            onClick={handleCopy}
          >
            {copied ? <CopySuccess className="text-green-500" /> : <Copy />}
          </Button>
        </CodeBlockGroup>
        {!collapsed &&
          (language === "mermaid" ? (
            <MermaidDiagram code={children as string} />
          ) : (
            <CodeBlockCode
              code={children}
              language="javascript"
              theme={resolvedTheme === "dark" ? "one-dark-pro" : "one-light"}
              className="[&_pre]:bg-background!"
            />
          ))}
      </CodeBlock>
    </div>
  );
}
