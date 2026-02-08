import { Button } from "@/components/ui/button";
import { VscTerminal } from "react-icons/vsc";
import { TbBrandSafari } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useSelectorTerminalStore } from "@/stores/terminal-store";

interface ActionToolbarProps {
  sessionId: string;
  sessionCwd: string;
}

export function ActionToolbar({ sessionId, sessionCwd }: ActionToolbarProps) {
  const { panelOpenSessions, togglePanel, getOrCreateTerminalForSession } =
    useSelectorTerminalStore([
      "panelOpenSessions",
      "togglePanel",
      "getOrCreateTerminalForSession",
    ]);

  const panelOpen = panelOpenSessions[sessionId] ?? false;

  const handleTerminalClick = async () => {
    if (!panelOpen) {
      // Ensure at least one terminal exists before opening
      await getOrCreateTerminalForSession(sessionId, sessionCwd);
    } else {
      togglePanel(sessionId);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "w-8 h-8 shrink-0 [&_svg]:size-4 rounded-md",
          panelOpen
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={handleTerminalClick}
        title="terminal"
      >
        <VscTerminal />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-md hover:text-foreground"
        onClick={() => {
          // TODO: Implement browser/webview
          console.log("Browser clicked");
        }}
        title="webview"
      >
        <TbBrandSafari />
      </Button>
    </div>
  );
}
