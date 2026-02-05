import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSelectorProviderStore,
  useSelectorProviderSettingsStore,
} from "@/stores";
import useSelectorSettingsStore from "@/stores/settings-store";
import { ProviderSettingsCard } from "@/components/settings/provider-settings-card";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { VscRefresh, VscArrowLeft, VscFolder } from "react-icons/vsc";
import type { Theme, FontSize } from "@/types";
import { Separator } from "@/components/ui/separator";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  const { providers, isDetecting, detectProviders } = useSelectorProviderStore([
    "providers",
    "isDetecting",
    "detectProviders",
  ]);
  const { loadSettings } = useSelectorProviderSettingsStore(["loadSettings"]);
  const {
    theme,
    fontSize,
    defaultProjectPath,
    setTheme,
    setFontSize,
    setDefaultProjectPath,
  } = useSelectorSettingsStore([
    "theme",
    "fontSize",
    "defaultProjectPath",
    "setTheme",
    "setFontSize",
    "setDefaultProjectPath",
  ]);
  const router = useRouter();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSelectDefaultPath = async () => {
    try {
      const home = await homeDir();
      const selected = await openDialog({
        defaultPath: defaultProjectPath || home,
        directory: true,
        multiple: false,
        title: "Select Default Project Directory",
      });
      if (selected) {
        setDefaultProjectPath(selected as string);
      }
    } catch (err) {
      console.error("Failed to open folder dialog:", err);
    }
  };

  return (
    <div className="space-y-8 sm:w-2xl md:w-3xl mx-auto py-12">
      <Button variant="ghost" onClick={() => router.history.back()}>
        <VscArrowLeft />
        Back
      </Button>

      {/* General Section */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">General</h3>
          <p className="text-sm text-muted-foreground">
            Configure general application settings
          </p>
        </div>

        <div className="space-y-4">
          {/* Default Project Path */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                Default Project Path
              </Label>
              <p className="text-xs text-muted-foreground">
                Default directory when selecting a project folder
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={defaultProjectPath || ""}
                onChange={(e) => setDefaultProjectPath(e.target.value || null)}
                placeholder="System user directory"
                className="w-60 text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSelectDefaultPath}
              >
                <VscFolder className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Appearance Section */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Appearance</h3>
          <p className="text-sm text-muted-foreground">
            Customize the look and feel of the application
          </p>
        </div>

        <div className="space-y-4">
          {/* Theme Setting */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground">
                Select your preferred color theme
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <SelectTrigger className="w-45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">Follow System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Size Setting */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Font Size</Label>
              <p className="text-xs text-muted-foreground">
                Adjust the interface font size
              </p>
            </div>
            <Select
              value={fontSize}
              onValueChange={(value) => setFontSize(value as FontSize)}
            >
              <SelectTrigger className="w-45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="base">Base (Default)</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Providers Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">AI Providers</h3>
            <p className="text-sm text-muted-foreground">
              Configure your AI coding assistants
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={detectProviders}
            disabled={isDetecting}
          >
            <VscRefresh
              className={`h-4 w-4 mr-2 ${isDetecting ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="space-y-4">
          {providers.map((provider) => (
            <ProviderSettingsCard
              key={provider.provider_type}
              provider={provider}
            />
          ))}
        </div>

        {providers.every((p) => !p.installed) && (
          <p className="text-xs text-muted-foreground mt-4 p-3 bg-yellow-500/10 rounded-lg">
            No AI CLI tools detected. Install Claude Code or Kimi Code to get
            started:
            <br />
            <code className="text-xs mt-1 block">
              npm install -g @anthropic-ai/claude-code
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
