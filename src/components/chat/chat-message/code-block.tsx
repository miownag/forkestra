import {
  CodeBlock,
  CodeBlockCode,
  CodeBlockGroup,
} from "@/components/prompt-kit/code-block";
import { Button } from "@/components/ui/button";
import { BiCollapseVertical, BiExpandVertical } from "react-icons/bi";
import { useState } from "react";
import {
  useSelectorSettingsStore,
  useSelectorSessionStore,
  useSelectorTerminalStore,
} from "@/stores";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "@/components/chat/chat-message/mermaid-diagram";
import { Copy, CopySuccess, Code1 } from "iconsax-reactjs";

const BASH_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

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
  const { activeSessionId, sessions } = useSelectorSessionStore([
    "activeSessionId",
    "sessions",
  ]);
  const { createTerminal, sendInput, openPanel } = useSelectorTerminalStore([
    "createTerminal",
    "sendInput",
    "openPanel",
  ]);

  const isBash = BASH_LANGUAGES.has(language);

  const handleCopy = () => {
    if (copied) return;
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunInTerminal = async () => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;

    const cwd = session.worktree_path || session.project_path;
    const terminalId = await createTerminal(activeSessionId, cwd);
    openPanel(activeSessionId);
    // Send the command with a newline to execute it
    await sendInput(terminalId, children.trim() + "\n");
  };

  return (
    <div className="w-full max-w-3xl">
      <CodeBlock>
        <CodeBlockGroup className="border-border border-b px-4 py-1.5 bg-muted/50">
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
          <div className="flex items-center">
            {isBash && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={handleRunInTerminal}
                title="Run in Terminal"
              >
                <Code1 />
              </Button>
            )}
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
          </div>
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
