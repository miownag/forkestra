import { useEffect, useState } from "react";
import { Outlet, createRootRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  useProviderStore,
  useSelectorSettingsStore,
  useSessionStore,
} from "@/stores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/side-bar";
import { PiSidebarSimple } from "react-icons/pi";
import { CgSun, CgMoon } from "react-icons/cg";
import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const detectProviders = useProviderStore((s) => s.detectProviders);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const { resolvedTheme, setTheme, isFullscreen } = useSelectorSettingsStore([
    "resolvedTheme",
    "setTheme",
    "isFullscreen",
  ]);
  const navigate = useNavigate();

  useEffect(() => {
    detectProviders();
    fetchSessions();
  }, [detectProviders, fetchSessions]);

  // Listen for menu:preferences event from backend
  useEffect(() => {
    const unlisten = listen("menu:preferences", () => {
      navigate({ to: "/settings" });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate]);

  // Inject theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-background">
        {/* Drag region for window movement (macOS traffic lights area) */}
        <div
          data-tauri-drag-region
          className={cn(
            "shrink-0 h-11 z-50 bg-background flex items-center pr-4 justify-between",
            isFullscreen ? "pl-4" : "pl-24",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-6"
            onClick={toggleSidebar}
          >
            <PiSidebarSimple />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5 rounded-full cursor-default",
            )}
            onClick={() =>
              setTheme(resolvedTheme === "light" ? "dark" : "light")
            }
          >
            {resolvedTheme === "light" ? <CgSun /> : <CgMoon />}
          </Button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={sidebarCollapsed} />
          <main className="flex-1 overflow-y-auto relative">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
