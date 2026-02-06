import { useEffect, useState } from "react";
import { Outlet, createRootRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  useSelectorProviderStore,
  useSelectorSessionStore,
  useSelectorSettingsStore,
} from "@/stores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/side-bar";
import { PiSidebar } from "react-icons/pi";
import { CgSun, CgMoon } from "react-icons/cg";
import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { fetchSessions } = useSelectorSessionStore(["fetchSessions"]);
  const { detectProviders } = useSelectorProviderStore(["detectProviders"]);
  const { resolvedTheme, setTheme, isFullscreen, fontSize, accentColor } =
    useSelectorSettingsStore([
      "resolvedTheme",
      "setTheme",
      "isFullscreen",
      "fontSize",
      "accentColor",
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

  // Inject font size class to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("text-sm", "text-base", "text-lg");
    const fontSizeClass = {
      small: "text-sm",
      base: "text-base",
      large: "text-lg",
    }[fontSize];
    root.classList.add(fontSizeClass);
  }, [fontSize]);

  // Inject accent color to document root
  useEffect(() => {
    const root = document.documentElement;
    // Remove existing accent color attribute
    root.removeAttribute("data-accent-color");
    // Set new accent color if not default
    if (accentColor !== "default") {
      root.setAttribute("data-accent-color", accentColor);
    }
  }, [accentColor]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-background">
        <Sidebar
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
        />
        <main className="flex-1 flex flex-col h-full">
          <div
            data-tauri-drag-region
            className={cn(
              "shrink-0 h-13 z-50 flex items-center pr-4 justify-between w-full",
              isFullscreen ? "pl-4" : "pl-24",
            )}
          >
            {sidebarCollapsed ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-5"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                <PiSidebar />
              </Button>
            ) : (
              <div />
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-8 h-8 shrink-0 text-muted-foreground [&_svg]:size-4 rounded-full cursor-default",
              )}
              onClick={() =>
                setTheme(resolvedTheme === "light" ? "dark" : "light")
              }
            >
              {resolvedTheme === "light" ? <CgSun /> : <CgMoon />}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
