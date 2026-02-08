import { Button } from "@/components/ui/button";
import { PiSidebar } from "react-icons/pi";
import { CgSun, CgMoon } from "react-icons/cg";
import { useSelectorSettingsStore } from "@/stores";
import { cn } from "@/lib/utils";

export function SidebarToggleButton({ className }: { className?: string }) {
  const { toggleSidebar } = useSelectorSettingsStore(["toggleSidebar"]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5",
        className,
      )}
      onClick={toggleSidebar}
    >
      <PiSidebar />
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
        className,
      )}
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      {resolvedTheme === "light" ? <CgSun /> : <CgMoon />}
    </Button>
  );
}
