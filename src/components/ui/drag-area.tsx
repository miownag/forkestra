import { cn } from "@/lib/utils";
import { useSelectorSettingsStore } from "@/stores";
import { Button } from "./button";
import { SidebarRight } from "iconsax-reactjs";
import { GlobalCommands } from "../global-cmds";
import { ThemeToggleButton } from "../layout/title-bar-controls";

export function DragArea() {
  const { sidebarCollapsed, isFullscreen, toggleSidebar } =
    useSelectorSettingsStore([
      "sidebarCollapsed",
      "isFullscreen",
      "toggleSidebar",
    ]);
  return (
    <div
      data-tauri-drag-region
      className={cn(
        "shrink-0 h-11 z-50 flex items-center pr-4 justify-between w-full bg-muted/20",
        !isFullscreen && (sidebarCollapsed ? "pl-10" : "pl-2"),
      )}
    >
      <div className="flex items-center gap-2">
        {sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl"
            onClick={toggleSidebar}
          >
            <SidebarRight />
          </Button>
        )}
        <GlobalCommands className="mr-1" />
      </div>
      <ThemeToggleButton />
    </div>
  );
}
