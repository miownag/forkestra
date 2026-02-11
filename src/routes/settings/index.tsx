import { useEffect, useState } from "react";
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
import { GlobalSettingsEditor } from "@/components/settings/global-settings-editor";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { VscRefresh, VscArrowLeft, VscFolder } from "react-icons/vsc";
import type { Theme, FontSize, AccentColor, DefaultWorkMode } from "@/types";
import { ACCENT_COLOR_OPTIONS } from "@/constants/theme";
import { Separator } from "@/components/ui/separator";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { cn } from "@/lib/utils";
import {
  SidebarToggleButton,
  ThemeToggleButton,
} from "@/components/layout/title-bar-controls";
import { IoBuildOutline } from "react-icons/io5";
import { TbCodeDots } from "react-icons/tb";



export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

type SettingsTab = "ui" | "json";

function RouteComponent() {
  const { providers, isDetecting, detectProviders } = useSelectorProviderStore([
    "providers",
    "isDetecting",
    "detectProviders",
  ]);
  const { loadSettings: loadProviderSettings } = useSelectorProviderSettingsStore(["loadSettings"]);
  const {
    theme,
    fontSize,
    accentColor,
    defaultProjectPath,
    defaultWorkMode,
    sidebarCollapsed,
    isFullscreen,
    loadSettings,
    setTheme,
    setFontSize,
    setAccentColor,
    setDefaultProjectPath,
    setDefaultWorkMode,
  } = useSelectorSettingsStore([
    "theme",
    "fontSize",
    "accentColor",
    "defaultProjectPath",
    "defaultWorkMode",
    "sidebarCollapsed",
    "isFullscreen",
    "loadSettings",
    "setTheme",
    "setFontSize",
    "setAccentColor",
    "setDefaultProjectPath",
    "setDefaultWorkMode",
  ]);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("ui");

  // Load settings on mount
  useEffect(() => {
    loadProviderSettings();
    loadSettings();
  }, [loadProviderSettings, loadSettings]);

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
    <>
      <div
        data-tauri-drag-region
        className={cn(
          "shrink-0 h-13 z-50 flex items-center pr-4 justify-between w-full bg-muted/20",
          isFullscreen ? "pl-4" : "pl-2",
        )}
      >
        {sidebarCollapsed ? <SidebarToggleButton /> : <div />}
        <ThemeToggleButton />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-8 sm:w-2xl md:w-3xl mx-auto py-12">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.history.back()}>
              <VscArrowLeft />
              Back
            </Button>

            {/* Tab Navigation */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                variant={activeTab === "ui" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("ui")}
              >
                <IoBuildOutline />
                UI Settings
              </Button>
              <Button
                variant={activeTab === "json" ? "default" : "ghost"}
                size="sm"
                className="[&_svg]:size-5"
                onClick={() => setActiveTab("json")}
              >
                <TbCodeDots />
                settings.json
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "json" ? (
            <GlobalSettingsEditor />
          ) : (
            <>
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
                        onChange={(e) =>
                          setDefaultProjectPath(e.target.value || null)
                        }
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

                  {/* Default Work Mode */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Preferred Work Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Default mode when creating new sessions
                      </p>
                    </div>
                    <Select
                      value={defaultWorkMode}
                      onValueChange={(value) =>
                        setDefaultWorkMode(value as DefaultWorkMode)
                      }
                    >
                      <SelectTrigger className="w-45">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="worktree">Worktree</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>
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

                  {/* Accent Color Setting */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Accent Color</Label>
                      <p className="text-xs text-muted-foreground">
                        Choose your preferred accent color theme
                      </p>
                    </div>
                    <Select
                      value={accentColor}
                      onValueChange={(value) =>
                        setAccentColor(value as AccentColor)
                      }
                    >
                      <SelectTrigger className="w-45">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCENT_COLOR_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full border border-border"
                                style={{
                                  backgroundColor: option.color,
                                  borderColor:
                                    option.value === "default"
                                      ? "hsl(0, 0%, 89.8%)"
                                      : option.color,
                                }}
                              />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
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
                      refresh={detectProviders}
                    />
                  ))}
                </div>

                {providers.every((p) => !p.installed) && (
                  <p className="text-xs text-muted-foreground mt-4 p-3 bg-yellow-500/10 rounded-lg">
                    No AI CLI tools detected. Install Claude Code or Kimi Code to
                    get started:
                    <br />
                    <code className="text-xs mt-1 block">
                      npm install -g @anthropic-ai/claude-code
                    </code>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
