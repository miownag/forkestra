import { Button } from "@/components/ui/button";
import { SidebarRight } from "iconsax-reactjs";
import { Sun1, Moon } from "iconsax-reactjs";
import { useSelectorSettingsStore } from "@/stores";
import { cn } from "@/lib/utils";

export function SidebarToggleButton({ className }: { className?: string }) {
  const { toggleSidebar } = useSelectorSettingsStore(["toggleSidebar"]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4.5 rounded-xl",
        className
      )}
      onClick={toggleSidebar}
    >
      <SidebarRight />
    </Button>
  );
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useSelectorSettingsStore([
    "resolvedTheme",
    "setTheme",
  ]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-full cursor-default",
        className
      )}
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      {resolvedTheme === "light" ? <Sun1 /> : <Moon />}
    </Button>
  );
}
