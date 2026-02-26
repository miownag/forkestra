import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { McpServerConfig } from "@/types";
import { Edit2, Trash } from "iconsax-reactjs";

interface McpServerCardProps {
  server: McpServerConfig;
  onToggle: (id: string, enabled: boolean) => void;
  onToggleGloballyAvailable?: (id: string, globallyAvailable: boolean) => void;
  onEdit?: (server: McpServerConfig) => void;
  onDelete?: (id: string) => void;
}

function getTransportLabel(type: string) {
  switch (type) {
    case "stdio":
      return "Stdio";
    case "http":
      return "HTTP";
    case "sse":
      return "SSE";
    default:
      return type;
  }
}

function getSourceLabel(source: McpServerConfig["source"]) {
  switch (source.type) {
    case "user":
      return "User Global";
    case "user_project":
      return "User Project";
    case "claude_global":
      return "Claude Global";
    case "claude_project":
      return "Claude Project";
    case "kimi_global":
      return "Kimi Global";
    case "kimi_project":
      return "Kimi Project";
    case "codex_global":
      return "Codex Global";
    case "codex_project":
      return "Codex Project";
    case "gemini_global":
      return "Gemini Global";
    case "gemini_project":
      return "Gemini Project";
    default:
      return "Unknown";
  }
}

function getTransportPreview(transport: McpServerConfig["transport"]) {
  switch (transport.type) {
    case "stdio":
      return [transport.command, ...transport.args].join(" ");
    case "http":
    case "sse":
      return transport.url;
  }
}

export function McpServerCard({
  server,
  onToggle,
  onToggleGloballyAvailable,
  onEdit,
  onDelete,
}: McpServerCardProps) {
  const isUserDefined = server.source.type === "user" || server.source.type === "user_project";
  const preview = getTransportPreview(server.transport);
  const envCount =
    server.transport.type === "stdio"
      ? Object.keys(server.transport.env).length
      : 0;
  const headerCount =
    server.transport.type !== "stdio"
      ? Object.keys(server.transport.headers).length
      : 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        "backdrop-blur-sm bg-card/80",
        !server.enabled && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <Switch
          checked={server.enabled}
          onCheckedChange={(checked) => onToggle(server.id, checked)}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{server.name}</span>
            <span className="shrink-0 text-[0.65rem] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
              {getTransportLabel(server.transport.type)}
            </span>
            {!isUserDefined && (
              <span className="shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
                {getSourceLabel(server.source)}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
            {preview}
          </p>

          {(envCount > 0 || headerCount > 0) && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {envCount > 0 && `${envCount} env var${envCount > 1 ? "s" : ""}`}
              {headerCount > 0 &&
                `${headerCount} header${headerCount > 1 ? "s" : ""}`}
            </p>
          )}

          {onToggleGloballyAvailable && (
            <div className="flex items-center gap-2 mt-2">
              <Switch
                checked={server.globally_available}
                onCheckedChange={(checked) =>
                  onToggleGloballyAvailable(server.id, checked)
                }
                className="scale-75 origin-left"
              />
              <span className="text-xs text-muted-foreground">
                Globally Available
              </span>
            </div>
          )}
        </div>

        {isUserDefined && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 [&_svg]:size-4"
                onClick={() => onEdit(server)}
              >
                <Edit2 />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 [&_svg]:size-4 text-destructive hover:text-destructive"
                onClick={() => onDelete(server.id)}
              >
                <Trash />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
