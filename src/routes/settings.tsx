import { useEffect, useState, useRef } from "react";
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
import type { Theme, FontSize, AccentColor, DefaultWorkMode, PostMergeAction } from "@/types";
import { ACCENT_COLOR_OPTIONS } from "@/constants/theme";
import { Separator } from "@/components/ui/separator";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TbCodeDots } from "react-icons/tb";
import { ArrowLeft2, Refresh, Setting2 } from "iconsax-reactjs";
import { LuFolderOpen } from "react-icons/lu";
import { DragArea } from "@/components/ui/drag-area";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

type SettingsTab = "ui" | "json";
type SettingSection =
  | "general"
  | "general-project-path"
  | "general-work-mode"
  | "general-post-merge"
  | "appearance"
  | "appearance-theme"
  | "appearance-font-size"
  | "appearance-accent-color"
  | "providers";

interface SectionItem {
  id: SettingSection;
  label: string;
  children?: SectionItem[];
}

const SECTION_ITEMS: SectionItem[] = [
  {
    id: "general",
    label: "General",
    children: [
      { id: "general-project-path", label: "Default Project Path" },
      { id: "general-work-mode", label: "Preferred Work Mode" },
      { id: "general-post-merge", label: "Post-Merge Action" },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    children: [
      { id: "appearance-theme", label: "Theme" },
      { id: "appearance-font-size", label: "Font Size" },
      { id: "appearance-accent-color", label: "Accent Color" },
    ],
  },
  {
    id: "providers",
    label: "AI Providers",
  },
];

function RouteComponent() {
  const { providers, isDetecting, detectProviders } = useSelectorProviderStore([
    "providers",
    "isDetecting",
    "detectProviders",
  ]);
  const { loadSettings: loadProviderSettings } =
    useSelectorProviderSettingsStore(["loadSettings"]);
  const {
    theme,
    fontSize,
    accentColor,
    defaultProjectPath,
    defaultWorkMode,
    postMergeAction,
    loadSettings,
    setTheme,
    setFontSize,
    setAccentColor,
    setDefaultProjectPath,
    setDefaultWorkMode,
    setPostMergeAction,
  } = useSelectorSettingsStore([
    "theme",
    "fontSize",
    "accentColor",
    "defaultProjectPath",
    "defaultWorkMode",
    "postMergeAction",
    "loadSettings",
    "setTheme",
    "setFontSize",
    "setAccentColor",
    "setDefaultProjectPath",
    "setDefaultWorkMode",
    "setPostMergeAction",
  ]);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("ui");
  const [activeSection, setActiveSection] = useState<SettingSection>("general");

  // Store refs in a Map for dynamic access
  const sectionRefs = useRef<Map<SettingSection, HTMLDivElement>>(new Map());

  // Load settings on mount
  useEffect(() => {
    loadProviderSettings();
    loadSettings();
  }, [loadProviderSettings, loadSettings]);

  // Scroll to section when clicked
  const scrollToSection = (section: SettingSection) => {
    const element = sectionRefs.current.get(section);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setActiveSection(section);
    }
  };

  // Observe sections to update active section on scroll
  useEffect(() => {
    if (activeTab !== "ui") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute(
              "data-section"
            ) as SettingSection;
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
  }, [activeTab]);

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
      <DragArea />
      <div className="flex-1 overflow-hidden flex justify-center">
        {/* Main Content Container */}
        <div className="flex gap-8 w-full max-w-7xl">
          {/* Left Sidebar - only show in UI mode */}
          {activeTab === "ui" && (
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
                  <div key={section.id}>
                    <button
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
                    {section.children && (
                      <div className="ml-3 mt-0.5 space-y-0.5">
                        {section.children.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => scrollToSection(child.id)}
                            className={cn(
                              "w-full text-left px-3 py-1 text-[0.8rem] rounded-md transition-colors cursor-pointer",
                              activeSection === child.id
                                ? "text-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-8 sm:w-2xl md:w-3xl py-12 mx-auto">
              <div className="flex items-center justify-between">
                {activeTab === "json" && (
                  <Button
                    variant="ghost"
                    onClick={() => router.history.back()}
                    className="[&_svg]:size-5 -ml-3 pl-2 text-base"
                  >
                    <ArrowLeft2 />
                    Back
                  </Button>
                )}

                {/* Tab Navigation */}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as SettingsTab)}
                  className={cn(activeTab === "ui" && "ml-auto")}
                >
                  <TabsList>
                    <TabsTrigger value="ui" className="cursor-pointer">
                      <Setting2 className="size-4 mr-2" />
                      UI Settings
                    </TabsTrigger>
                    <TabsTrigger value="json" className="cursor-pointer">
                      <TbCodeDots className="size-5 mr-2" />
                      settings.json
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tab Content */}
              {activeTab === "json" ? (
                <GlobalSettingsEditor />
              ) : (
                <>
                  {/* General Section */}
                  <div
                    ref={(el) => {
                      if (el) sectionRefs.current.set("general", el);
                    }}
                    data-section="general"
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">General</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure general application settings
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Default Project Path */}
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set("general-project-path", el);
                        }}
                        data-section="general-project-path"
                        className="flex items-center justify-between"
                      >
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
                            <LuFolderOpen className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Default Work Mode */}
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set("general-work-mode", el);
                        }}
                        data-section="general-work-mode"
                        className="flex items-center justify-between"
                      >
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

                      {/* Post-Merge Action */}
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set("general-post-merge", el);
                        }}
                        data-section="general-post-merge"
                        className="flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">
                            Post-Merge Action
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            What to do with session after successful merge
                          </p>
                        </div>
                        <Select
                          value={postMergeAction}
                          onValueChange={(value) =>
                            setPostMergeAction(value as PostMergeAction)
                          }
                        >
                          <SelectTrigger className="w-45">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ask">Always Ask</SelectItem>
                            <SelectItem value="keep">Keep Session</SelectItem>
                            <SelectItem value="cleanup">Clean Up Session</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Appearance Section */}
                  <div
                    ref={(el) => {
                      if (el) sectionRefs.current.set("appearance", el);
                    }}
                    data-section="appearance"
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">Appearance</h3>
                      <p className="text-sm text-muted-foreground">
                        Customize the look and feel of the application
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Theme Setting */}
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set("appearance-theme", el);
                        }}
                        data-section="appearance-theme"
                        className="flex items-center justify-between"
                      >
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
                            <SelectItem value="system">
                              Follow System
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Font Size Setting */}
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set("appearance-font-size", el);
                        }}
                        data-section="appearance-font-size"
                        className="flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">
                            Font Size
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Adjust the interface font size
                          </p>
                        </div>
                        <Select
                          value={fontSize}
                          onValueChange={(value) =>
                            setFontSize(value as FontSize)
                          }
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
                      <div
                        ref={(el) => {
                          if (el)
                            sectionRefs.current.set(
                              "appearance-accent-color",
                              el
                            );
                        }}
                        data-section="appearance-accent-color"
                        className="flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">
                            Accent Color
                          </Label>
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
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
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
                  <div
                    ref={(el) => {
                      if (el) sectionRefs.current.set("providers", el);
                    }}
                    data-section="providers"
                  >
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
                        className="[&_svg]:size-3"
                        onClick={detectProviders}
                        disabled={isDetecting}
                      >
                        <Refresh
                          className={cn(isDetecting && "animate-spin")}
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
                        No AI CLI tools detected. Install Claude Code or Kimi
                        Code to get started:
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
        </div>
      </div>
    </>
  );
}
