import { useEffect, useState } from "react";
import { PiSidebarSimple } from "react-icons/pi";
import { Sidebar } from "./Sidebar";
import { useProviderStore, useSessionStore } from "@/stores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const detectProviders = useProviderStore((s) => s.detectProviders);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  useEffect(() => {
    detectProviders();
    fetchSessions();
  }, [detectProviders, fetchSessions]);

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-4 z-10 h-8 w-8"
              onClick={toggleSidebar}
            >
              <PiSidebarSimple />
            </Button>
          )}
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
