import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VscTerminal } from "react-icons/vsc";
import { TbBrandSafari } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useSelectorTerminalStore } from "@/stores/terminal-store";

interface ActionToolbarProps {
  sessionId: string;
  sessionCwd: string;
}

export function ActionToolbar({ sessionId, sessionCwd }: ActionToolbarProps) {
  const { isPanelOpen, togglePanel, getOrCreateTerminalForSession } =
    useSelectorTerminalStore([
      "isPanelOpen",
      "togglePanel",
      "getOrCreateTerminalForSession",
    ]);

  const handleTerminalClick = async () => {
    if (!isPanelOpen) {
      // Ensure at least one terminal exists before opening
      await getOrCreateTerminalForSession(sessionId, sessionCwd);
    } else {
      togglePanel();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-8 h-8 shrink-0 [&_svg]:size-4 rounded-md",
              isPanelOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={handleTerminalClick}
          >
            <VscTerminal />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>terminal</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-md hover:text-foreground"
            onClick={() => {
              // TODO: Implement browser/webview
              console.log("Browser clicked");
            }}
          >
            <TbBrandSafari />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>webview</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
