import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DragArea } from "@/components/ui/drag-area";
import { McpServerCard } from "@/components/mcp/mcp-server-card";
import { McpServerDialog } from "@/components/mcp/mcp-server-dialog";
import { useSelectorMcpStore } from "@/stores";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ArrowLeft2, Refresh, Add } from "iconsax-reactjs";
import type { McpServerConfig, McpTransport } from "@/types";

export const Route = createFileRoute("/mcps")({
  component: RouteComponent,
});

type McpSection = "discovered" | "user-defined";

interface SectionItem {
  id: McpSection;
  label: string;
}

const SECTION_ITEMS: SectionItem[] = [
  { id: "discovered", label: "Discovered" },
  { id: "user-defined", label: "User Defined" },
];

function RouteComponent() {
  const {
    servers,
    isLoading,
    isScanning,
    fetchServers,
    scanServers,
    addServer,
    updateServer,
    deleteServer,
    toggleServer,
  } = useSelectorMcpStore([
    "servers",
    "isLoading",
    "isScanning",
    "fetchServers",
    "scanServers",
    "addServer",
    "updateServer",
    "deleteServer",
    "toggleServer",
  ]);

  const router = useRouter();
  const [activeSection, setActiveSection] = useState<McpSection>("discovered");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(
    null
  );

  const sectionRefs = useRef<Map<McpSection, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute(
              "data-section"
            ) as McpSection;
            if (section) {
              setActiveSection(section);
            }
          }
        });
      },
      { threshold: 0.3, rootMargin: "-20% 0px -60% 0px" }
    );

    sectionRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      sectionRefs.current.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, [servers]);

  const scrollToSection = (section: McpSection) => {
    const element = sectionRefs.current.get(section);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(section);
    }
  };

  const discoveredServers = servers.filter((s) => s.source.type !== "user");
  const userServers = servers.filter((s) => s.source.type === "user");

  // Group discovered servers by source
  const groupedDiscovered = discoveredServers.reduce<
    Record<string, McpServerConfig[]>
  >((groups, server) => {
    let key: string;
    if (server.source.type === "claude_global") {
      key = "Claude Global";
    } else if (server.source.type === "claude_project") {
      key = `Claude Project: ${server.source.project_path}`;
    } else {
      key = "Other";
    }
    (groups[key] ??= []).push(server);
    return groups;
  }, {});

  const handleEdit = useCallback((server: McpServerConfig) => {
    setEditingServer(server);
    setDialogOpen(true);
  }, []);

  const handleAdd = useCallback(() => {
    setEditingServer(null);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (name: string, transport: McpTransport) => {
      if (editingServer) {
        await updateServer({ ...editingServer, name, transport });
      } else {
        await addServer(name, transport);
      }
    },
    [editingServer, updateServer, addServer]
  );

  return (
    <>
      <DragArea />
      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="flex gap-8 w-full max-w-7xl">
          {/* Left Sidebar */}
          <div className="w-56 shrink-0 py-12 sticky top-0 h-[calc(100vh-3.25rem)] overflow-y-auto">
            <Button
              variant="ghost"
              onClick={() => router.history.back()}
              className="[&_svg]:size-5 w-full justify-start pl-2 mb-6 text-base"
            >
              <ArrowLeft2 />
              Back
            </Button>

            <nav className="space-y-1">
              {SECTION_ITEMS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-[0.85rem] rounded-md transition-colors cursor-pointer",
                    activeSection === section.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-8 sm:w-2xl md:w-3xl py-12">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">MCP Servers</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Manage Model Context Protocol servers for your sessions
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="[&_svg]:size-3"
                  onClick={scanServers}
                  disabled={isScanning}
                >
                  <Refresh className={cn(isScanning && "animate-spin")} />
                  Scan
                </Button>
              </div>

              {/* Discovered Section */}
              <div
                ref={(el) => {
                  if (el) sectionRefs.current.set("discovered", el);
                }}
                data-section="discovered"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">Discovered</h3>
                  <p className="text-sm text-muted-foreground">
                    MCP servers found in your Claude Code configuration
                  </p>
                </div>

                {isLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    Loading...
                  </div>
                ) : discoveredServers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                    No MCP servers discovered. Click "Scan" to search your
                    configuration files.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedDiscovered).map(
                      ([groupLabel, groupServers]) => (
                        <div key={groupLabel}>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            {groupLabel}
                          </p>
                          <div className="space-y-2">
                            {groupServers.map((server) => (
                              <McpServerCard
                                key={server.id}
                                server={server}
                                onToggle={toggleServer}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* User Defined Section */}
              <div
                ref={(el) => {
                  if (el) sectionRefs.current.set("user-defined", el);
                }}
                data-section="user-defined"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">User Defined</h3>
                    <p className="text-sm text-muted-foreground">
                      Custom MCP servers you've configured
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="[&_svg]:size-4"
                    onClick={handleAdd}
                  >
                    <Add />
                    Add Server
                  </Button>
                </div>

                {userServers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                    No user-defined MCP servers yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userServers.map((server) => (
                      <McpServerCard
                        key={server.id}
                        server={server}
                        onToggle={toggleServer}
                        onEdit={handleEdit}
                        onDelete={deleteServer}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <McpServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        server={editingServer}
        onSave={handleSave}
      />
    </>
  );
}
