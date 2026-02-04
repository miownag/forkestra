import * as React from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useProviderStore, useSessionStore } from "@/stores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/side-bar";
import { PiSidebarSimple } from "react-icons/pi";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const detectProviders = useProviderStore((s) => s.detectProviders);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  React.useEffect(() => {
    detectProviders();
    fetchSessions();
  }, [detectProviders, fetchSessions]);

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-background">
        {/* Drag region for window movement (macOS traffic lights area) */}
        <div data-tauri-drag-region className="h-10 z-50 bg-background py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground ml-24 mt-0.5"
            onClick={toggleSidebar}
          >
            <PiSidebarSimple />
          </Button>
        </div>
        <div className="flex-1 flex">
          <Sidebar collapsed={sidebarCollapsed} />
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
