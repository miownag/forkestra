import { useEffect } from "react";
import { Outlet, createRootRoute, useNavigate } from "@tanstack/react-router";
import {
  useSelectorProviderStore,
  useSelectorSessionStore,
  useSelectorSettingsStore,
} from "@/stores";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/side-bar";
import { listen } from "@tauri-apps/api/event";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { fetchSessions } = useSelectorSessionStore(["fetchSessions"]);
  const { detectProviders } = useSelectorProviderStore(["detectProviders"]);
  const {
    resolvedTheme,
    fontSize,
    accentColor,
    loadSettings,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useSelectorSettingsStore([
    "resolvedTheme",
    "fontSize",
    "accentColor",
    "loadSettings",
    "sidebarCollapsed",
    "setSidebarCollapsed",
  ]);
  const navigate = useNavigate();

  useEffect(() => {
    detectProviders();
    fetchSessions();
  }, [detectProviders, fetchSessions]);

  // Load settings from file on app start
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
    <TooltipProvider>
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => setSidebarCollapsed(!open)}
        className="h-screen w-screen bg-background"
      >
        <AppSidebar />
        <main className="flex-1 flex flex-col h-full min-w-0">
          <Outlet />
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
