import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { McpServerConfig, McpTransport } from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash, AddCircle, Warning2 } from "iconsax-reactjs";
import { cn } from "@/lib/utils";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useSelectorSettingsStore } from "@/stores";

type TransportType = "stdio" | "http" | "sse";
type DialogTab = "form" | "json";

interface McpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServerConfig | null;
  onSave: (name: string, transport: McpTransport) => Promise<void>;
}

interface KVPair {
  key: string;
  value: string;
}

function toKVPairs(record: Record<string, string>): KVPair[] {
  const pairs = Object.entries(record).map(([key, value]) => ({ key, value }));
  return pairs.length > 0 ? pairs : [];
}

function fromKVPairs(pairs: KVPair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim()) {
      result[key.trim()] = value;
    }
  }
  return result;
}

// Build a Cursor-style JSON object from form state
function buildJsonFromForm(
  name: string,
  transportType: TransportType,
  command: string,
  args: string,
  url: string,
  envPairs: KVPair[],
  headerPairs: KVPair[]
): string {
  const serverObj: Record<string, unknown> = {};
  if (transportType === "stdio") {
    serverObj.command = command;
    const argsList = args
      .trim()
      .split(/\s+/)
      .filter((a) => a);
    if (argsList.length > 0) serverObj.args = argsList;
    const env = fromKVPairs(envPairs);
    if (Object.keys(env).length > 0) serverObj.env = env;
  } else {
    serverObj.type = transportType;
    serverObj.url = url;
    const headers = fromKVPairs(headerPairs);
    if (Object.keys(headers).length > 0) serverObj.headers = headers;
  }
  const wrapper: Record<string, unknown> = {};
  wrapper[name || "my-mcp-server"] = serverObj;
  return JSON.stringify(wrapper, null, 2);
}

// Parse Cursor-style JSON back to form fields
function parseJsonToForm(jsonStr: string): {
  name: string;
  transport: McpTransport;
} | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;
    const keys = Object.keys(parsed);
    if (keys.length !== 1) return null;
    const name = keys[0];
    const obj = parsed[name];
    if (typeof obj !== "object" || obj === null) return null;

    // Determine transport type
    if (obj.command || (!obj.type && !obj.url)) {
      // Stdio
      return {
        name,
        transport: {
          type: "stdio",
          command: obj.command || "",
          args: Array.isArray(obj.args) ? obj.args : [],
          env: typeof obj.env === "object" && obj.env !== null ? obj.env : {},
        },
      };
    } else {
      const type = obj.type === "sse" ? "sse" : "http";
      return {
        name,
        transport: {
          type,
          url: obj.url || "",
          headers:
            typeof obj.headers === "object" && obj.headers !== null
              ? obj.headers
              : {},
        },
      };
    }
  } catch {
    return null;
  }
}

export function McpServerDialog({
  open,
  onOpenChange,
  server,
  onSave,
}: McpServerDialogProps) {
  const isEditing = !!server;
  const { resolvedTheme } = useSelectorSettingsStore(["resolvedTheme"]);

  const [activeTab, setActiveTab] = useState<DialogTab>("form");
  const [name, setName] = useState("");
  const [transportType, setTransportType] = useState<TransportType>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envPairs, setEnvPairs] = useState<KVPair[]>([]);
  const [headerPairs, setHeaderPairs] = useState<KVPair[]>([]);
  const [saving, setSaving] = useState(false);

  // JSON tab state
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab("form");
      setJsonError(null);
      if (server) {
        setName(server.name);
        setTransportType(server.transport.type);
        if (server.transport.type === "stdio") {
          setCommand(server.transport.command);
          setArgs(server.transport.args.join(" "));
          setEnvPairs(toKVPairs(server.transport.env));
          setHeaderPairs([]);
        } else {
          setUrl(server.transport.url);
          setHeaderPairs(toKVPairs(server.transport.headers));
          setCommand("");
          setArgs("");
          setEnvPairs([]);
        }
      } else {
        setName("");
        setTransportType("stdio");
        setCommand("");
        setArgs("");
        setUrl("");
        setEnvPairs([]);
        setHeaderPairs([]);
      }
    }
  }, [open, server]);

  // Sync form -> JSON when switching to JSON tab
  const handleTabChange = (tab: DialogTab) => {
    if (tab === "json" && activeTab === "form") {
      setJsonText(
        buildJsonFromForm(
          name,
          transportType,
          command,
          args,
          url,
          envPairs,
          headerPairs
        )
      );
      setJsonError(null);
    } else if (tab === "form" && activeTab === "json") {
      // Sync JSON -> form
      const parsed = parseJsonToForm(jsonText);
      if (parsed) {
        setName(parsed.name);
        setTransportType(parsed.transport.type);
        if (parsed.transport.type === "stdio") {
          setCommand(parsed.transport.command);
          setArgs(parsed.transport.args.join(" "));
          setEnvPairs(toKVPairs(parsed.transport.env));
          setHeaderPairs([]);
          setUrl("");
        } else {
          setUrl(parsed.transport.url);
          setHeaderPairs(toKVPairs(parsed.transport.headers));
          setCommand("");
          setArgs("");
          setEnvPairs([]);
        }
      }
    }
    setActiveTab(tab);
  };

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Object.keys(parsed).length !== 1
      ) {
        setJsonError("JSON must be an object with exactly one server entry");
        return;
      }
      setJsonError(null);
    } catch (err) {
      setJsonError((err as Error).message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalName: string;
      let transport: McpTransport;

      if (activeTab === "json") {
        const parsed = parseJsonToForm(jsonText);
        if (!parsed) {
          setJsonError("Invalid MCP server configuration");
          setSaving(false);
          return;
        }
        finalName = parsed.name;
        transport = parsed.transport;
      } else {
        finalName = name;
        if (transportType === "stdio") {
          transport = {
            type: "stdio",
            command,
            args: args
              .trim()
              .split(/\s+/)
              .filter((a) => a),
            env: fromKVPairs(envPairs),
          };
        } else {
          transport = {
            type: transportType,
            url,
            headers: fromKVPairs(headerPairs),
          };
        }
      }

      await onSave(finalName, transport);
      onOpenChange(false);
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const canSaveForm =
    name.trim() && (transportType === "stdio" ? command.trim() : url.trim());
  const canSaveJson = !jsonError && jsonText.trim();
  const canSave = activeTab === "form" ? canSaveForm : canSaveJson;

  // JSON placeholder for empty state
  const jsonPlaceholder = useMemo(
    () =>
      JSON.stringify(
        {
          "my-mcp-server": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
            env: {},
          },
        },
        null,
        2
      ),
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit MCP Server" : "Add MCP Server"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify the MCP server configuration."
              : "Configure a new MCP server to use with your sessions."}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => handleTabChange(v as DialogTab)}
          className="w-full"
        >
          <TabsList className="w-full">
            <TabsTrigger value="form" className="flex-1 cursor-pointer">
              Form
            </TabsTrigger>
            <TabsTrigger value="json" className="flex-1 cursor-pointer">
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form">
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-mcp-server"
                />
              </div>

              {/* Transport Type */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Transport</Label>
                <div className="flex gap-2">
                  {[
                    { value: "stdio", label: "Stdio" },
                    { value: "http", label: "HTTP" },
                    { value: "sse", label: "SSE" },
                  ].map((option) => {
                    const isSelected = transportType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setTransportType(option.value as TransportType)
                        }
                        className={cn(
                          "relative flex items-center justify-center h-9 rounded-full border transition-all duration-300 ease-out",
                          "backdrop-blur-xl bg-white/10 dark:bg-white/5",
                          "border-white/20 dark:border-white/10",
                          "shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
                          "hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                          "hover:bg-white/20 dark:hover:bg-white/10",
                          "hover:border-white/30 dark:hover:border-white/20",
                          isSelected
                            ? "flex-1 px-4 bg-primary/15 border-primary/30 shadow-[0_2px_12px_rgba(var(--primary),0.15)]"
                            : "flex-1 px-4 cursor-pointer"
                        )}
                      >
                        <span
                          className={cn(
                            "text-sm font-medium transition-colors duration-300",
                            isSelected ? "text-primary" : "text-foreground"
                          )}
                        >
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stdio fields */}
              {transportType === "stdio" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">Command</Label>
                    <Input
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npx"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">Arguments</Label>
                    <Input
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-filesystem /path"
                      className="font-mono text-sm"
                    />
                  </div>
                  <KVEditor
                    label="Environment Variables"
                    pairs={envPairs}
                    onChange={setEnvPairs}
                    keyPlaceholder="VAR_NAME"
                    valuePlaceholder="value"
                  />
                </>
              )}

              {/* HTTP/SSE fields */}
              {transportType !== "stdio" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="http://localhost:3000/mcp"
                      className="font-mono text-sm"
                    />
                  </div>
                  <KVEditor
                    label="Headers"
                    pairs={headerPairs}
                    onChange={setHeaderPairs}
                    keyPlaceholder="Header-Name"
                    valuePlaceholder="value"
                  />
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="json">
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">
                Paste a Cursor / Claude Code style MCP server config:
              </p>
              <div className="rounded-lg border overflow-hidden">
                <CodeMirror
                  value={jsonText || jsonPlaceholder}
                  extensions={[json()]}
                  onChange={handleJsonChange}
                  theme={resolvedTheme}
                  className="text-xs"
                  height="240px"
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightSpecialChars: true,
                    foldGutter: true,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    rectangularSelection: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    closeBracketsKeymap: true,
                    searchKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                  }}
                />
              </div>
              {jsonError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/50 bg-destructive/10">
                  <Warning2
                    variant="Bold"
                    className="h-4 w-4 text-destructive mt-0.5 shrink-0"
                  />
                  <p className="text-xs text-destructive/90">{jsonError}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Saving..." : isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KVEditor({
  label,
  pairs,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  label: string;
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const addRow = () => onChange([...pairs, { key: "", value: "" }]);
  const removeRow = (index: number) =>
    onChange(pairs.filter((_, i) => i !== index));
  const updateRow = (index: number, field: "key" | "value", value: string) => {
    const next = [...pairs];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 text-xs"
          onClick={addRow}
        >
          <AddCircle />
        </Button>
      </div>
      {pairs.length > 0 && (
        <div className="flex flex-col gap-2">
          {pairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={pair.key}
                onChange={(e) => updateRow(i, "key", e.target.value)}
                placeholder={keyPlaceholder}
                className="font-mono text-xs h-8 flex-1"
              />
              <Input
                value={pair.value}
                onChange={(e) => updateRow(i, "value", e.target.value)}
                placeholder={valuePlaceholder}
                className="font-mono text-xs h-8 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 [&_svg]:size-3.5 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(i)}
              >
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
