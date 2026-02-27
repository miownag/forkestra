import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProviderSettingsStore } from "@/stores";
import type { ProviderInfo, ProviderSettings } from "@/types";
import { isClaudeSettings, isCodexSettings, isGeminiSettings, isKimiSettings, isOpenCodeSettings, isQoderSettings, isQwenCodeSettings } from "@/types";
import { LuFolderOpen } from "react-icons/lu";
import { VscCheck, VscClose } from "react-icons/vsc";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PROVIDER_ICONS_MAP, ProviderCombineIcon } from "@/constants/icons";
import { Trash } from "iconsax-reactjs";

interface ProviderSettingsCardProps {
  provider: ProviderInfo;
  refresh: () => Promise<void>;
}

export function ProviderSettingsCard({
  provider,
  refresh,
}: ProviderSettingsCardProps) {
  const storeSettings = useProviderSettingsStore(
    (s) => s.settings[provider.provider_type]
  );
  const updateProviderSettings = useProviderSettingsStore(
    (s) => s.updateProviderSettings
  );
  const isLoading = useProviderSettingsStore((s) => s.isLoading);

  const [localSettings, setLocalSettings] =
    useState<ProviderSettings>(storeSettings);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local settings when store changes
  useEffect(() => {
    setLocalSettings(storeSettings);
    setIsDirty(false);
  }, [storeSettings]);

  const handleSelectCliPath = async () => {
    const selected = await openDialog({
      title: "Select CLI Executable",
      multiple: false,
      directory: false,
    });
    if (selected) {
      setLocalSettings({
        ...localSettings,
        custom_cli_path: selected as string,
      });
      setIsDirty(true);
    }
  };

  const handleSave = async () => {
    await updateProviderSettings(localSettings);
    refresh();
    setIsDirty(false);
  };

  const handleClearPath = () => {
    setLocalSettings({
      ...localSettings,
      custom_cli_path: null,
    });
    setIsDirty(true);
  };

  const handleSelectConfigDir = async () => {
    const selected = await openDialog({
      title: "Select Config Directory",
      multiple: false,
      directory: true,
    });
    if (selected) {
      const envVars = localSettings.env_vars || {};
      setLocalSettings({
        ...localSettings,
        env_vars: {
          ...envVars,
          CLAUDE_CONFIG_DIR: selected as string,
        },
      });
      setIsDirty(true);
    }
  };

  const handleSelectShareDir = async () => {
    const selected = await openDialog({
      title: "Select Share Directory",
      multiple: false,
      directory: true,
    });
    if (selected) {
      const envVars = localSettings.env_vars || {};
      setLocalSettings({
        ...localSettings,
        env_vars: {
          ...envVars,
          KIMI_SHARE_DIR: selected as string,
        },
      });
      setIsDirty(true);
    }
  };

  const handleEnvVarChange = (key: string, value: string) => {
    const envVars = localSettings.env_vars || {};
    if (value.trim() === "") {
      // Remove the env var if value is empty
      const { [key]: _, ...rest } = envVars;
      setLocalSettings({
        ...localSettings,
        env_vars: rest,
      });
    } else {
      setLocalSettings({
        ...localSettings,
        env_vars: {
          ...envVars,
          [key]: value,
        },
      });
    }
    setIsDirty(true);
  };

  const handleRemoveEnvVar = (key: string) => {
    const envVars = localSettings.env_vars || {};
    const { [key]: _, ...rest } = envVars;
    setLocalSettings({
      ...localSettings,
      env_vars: rest,
    });
    setIsDirty(true);
  };

  const handleAddCustomEnvVar = () => {
    const envVars = localSettings.env_vars || {};
    const newKey = `CUSTOM_VAR_${Object.keys(envVars).length + 1}`;
    setLocalSettings({
      ...localSettings,
      env_vars: {
        ...envVars,
        [newKey]: "",
      },
    });
    setIsDirty(true);
  };

  const ProviderIcon = PROVIDER_ICONS_MAP[provider.provider_type];

  return (
    <div className="p-4 rounded-lg border bg-card">
      {/* Provider Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <ProviderCombineIcon
            icon={ProviderIcon}
            size={20}
            className="flex items-center gap-1 mb-1"
            type="color"
          />
          <p
            className="text-xs text-muted-foreground truncate max-w-75"
            title={provider.cli_path || ""}
          >
            {provider.provider_type === "codex"
              ? "via npx @zed-industries/codex-acp"
              : provider.cli_path || `${provider.cli_command} (not found)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {provider.version && (
            <span className="text-xs text-muted-foreground">
              v{provider.version}
            </span>
          )}
          {provider.installed ? (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded">
              <VscCheck className="h-3 w-3" />
              Installed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              <VscClose className="h-3 w-3" />
              Not Installed
            </span>
          )}
        </div>
      </div>

      {/* Settings Form */}
      <div className="space-y-4">
        {/* Custom CLI Path (not for Codex) */}
        {!isCodexSettings(localSettings) && (
          <div>
            <Label className="text-sm">Custom CLI Path (Process Wrapper)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Override the default CLI executable path
            </p>
            <div className="flex gap-2">
              <Input
                value={localSettings.custom_cli_path || ""}
                onChange={(e) => {
                  setLocalSettings({
                    ...localSettings,
                    custom_cli_path: e.target.value || null,
                  });
                  setIsDirty(true);
                }}
                placeholder={provider.cli_path || provider.cli_command}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleSelectCliPath}>
                <LuFolderOpen />
              </Button>
              {localSettings.custom_cli_path && (
                <Button variant="ghost" size="icon" onClick={handleClearPath}>
                  <VscClose />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Codex-specific: Auth & Environment Variables */}
        {isCodexSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">OPENAI_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                OpenAI API authentication key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.OPENAI_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("OPENAI_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
            <div>
              <Label className="text-sm">CODEX_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Codex API authentication key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.CODEX_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("CODEX_API_KEY", e.target.value)
                }
                placeholder="Custom key"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">NO_BROWSER</Label>
                <p className="text-xs text-muted-foreground">
                  Disable browser login (for remote SSH environments)
                </p>
              </div>
              <Switch
                checked={!!localSettings.env_vars?.NO_BROWSER}
                onCheckedChange={(checked) => {
                  handleEnvVarChange("NO_BROWSER", checked ? "1" : "");
                }}
              />
            </div>
          </>
        )}

        {/* Kimi-specific: Auth & Environment Variables */}
        {isKimiSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">KIMI_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Kimi API key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.KIMI_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("KIMI_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
            <div>
              <Label className="text-sm">KIMI_BASE_URL</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Kimi API base URL
              </p>
              <Input
                value={localSettings.env_vars?.KIMI_BASE_URL || ""}
                onChange={(e) =>
                  handleEnvVarChange("KIMI_BASE_URL", e.target.value)
                }
                placeholder="https://api.moonshot.cn/v1"
              />
            </div>
            <div>
              <Label className="text-sm">OPENAI_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                OpenAI provider API key (optional)
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.OPENAI_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("OPENAI_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
            <div>
              <Label className="text-sm">OPENAI_BASE_URL</Label>
              <p className="text-xs text-muted-foreground mb-2">
                OpenAI provider base URL (optional)
              </p>
              <Input
                value={localSettings.env_vars?.OPENAI_BASE_URL || ""}
                onChange={(e) =>
                  handleEnvVarChange("OPENAI_BASE_URL", e.target.value)
                }
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <Label className="text-sm">KIMI_SHARE_DIR</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Custom share directory (defaults to ~/.kimi)
              </p>
              <div className="flex gap-2">
                <Input
                  value={localSettings.env_vars?.KIMI_SHARE_DIR || ""}
                  onChange={(e) =>
                    handleEnvVarChange("KIMI_SHARE_DIR", e.target.value)
                  }
                  placeholder="~/.kimi"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSelectShareDir}
                >
                  <LuFolderOpen />
                </Button>
                {localSettings.env_vars?.KIMI_SHARE_DIR && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveEnvVar("KIMI_SHARE_DIR")}
                  >
                    <VscClose />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">KIMI_CLI_NO_AUTO_UPDATE</Label>
                <p className="text-xs text-muted-foreground">
                  Disable auto-update check
                </p>
              </div>
              <Switch
                checked={!!localSettings.env_vars?.KIMI_CLI_NO_AUTO_UPDATE}
                onCheckedChange={(checked) => {
                  handleEnvVarChange(
                    "KIMI_CLI_NO_AUTO_UPDATE",
                    checked ? "1" : ""
                  );
                }}
              />
            </div>
          </>
        )}

        {/* Gemini-specific: Auth & Environment Variables */}
        {isGeminiSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">GEMINI_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Gemini API authentication key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.GEMINI_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("GEMINI_API_KEY", e.target.value)
                }
                placeholder="AIza..."
              />
            </div>
            <div>
              <Label className="text-sm">GOOGLE_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Google API key (optional, alternative to GEMINI_API_KEY)
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.GOOGLE_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("GOOGLE_API_KEY", e.target.value)
                }
                placeholder="AIza..."
              />
            </div>
            <div>
              <Label className="text-sm">GOOGLE_CLOUD_PROJECT</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Google Cloud project ID (optional, for Vertex AI)
              </p>
              <Input
                value={localSettings.env_vars?.GOOGLE_CLOUD_PROJECT || ""}
                onChange={(e) =>
                  handleEnvVarChange("GOOGLE_CLOUD_PROJECT", e.target.value)
                }
                placeholder="my-project-id"
              />
            </div>
            <div>
              <Label className="text-sm">GOOGLE_CLOUD_LOCATION</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Google Cloud location (optional, for Vertex AI)
              </p>
              <Input
                value={localSettings.env_vars?.GOOGLE_CLOUD_LOCATION || ""}
                onChange={(e) =>
                  handleEnvVarChange("GOOGLE_CLOUD_LOCATION", e.target.value)
                }
                placeholder="us-central1"
              />
            </div>
          </>
        )}

        {/* OpenCode-specific: Auth & Environment Variables */}
        {isOpenCodeSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">OPENCODE_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                OpenCode API authentication key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.OPENCODE_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("OPENCODE_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
          </>
        )}

        {/* Qoder-specific: Auth & Environment Variables */}
        {isQoderSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">QODER_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Qoder CLI API authentication key
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.QODER_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("QODER_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
          </>
        )}

        {/* QwenCode-specific: Auth & Environment Variables */}
        {isQwenCodeSettings(localSettings) && (
          <>
            <div>
              <Label className="text-sm">DASHSCOPE_API_KEY</Label>
              <p className="text-xs text-muted-foreground mb-2">
                DashScope API key for Qwen Code
              </p>
              <Input
                type="password"
                value={localSettings.env_vars?.DASHSCOPE_API_KEY || ""}
                onChange={(e) =>
                  handleEnvVarChange("DASHSCOPE_API_KEY", e.target.value)
                }
                placeholder="sk-..."
              />
            </div>
          </>
        )}

        {/* Claude-specific: Disable Login Prompt */}
        {/* {isClaudeSettings(localSettings) && (
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Disable Login Prompt</Label>
              <p className="text-xs text-muted-foreground">
                Skip authentication prompts when starting sessions
              </p>
            </div>
            <Switch
              checked={
                (localSettings as ClaudeProviderSettings).disable_login_prompt
              }
              onCheckedChange={(checked) => {
                setLocalSettings({
                  ...localSettings,
                  disable_login_prompt: checked,
                } as ClaudeProviderSettings);
                setIsDirty(true);
              }}
            />
          </div>
        )} */}

        {/* Claude-specific: Config Directory */}
        {isClaudeSettings(localSettings) && (
          <div>
            <Label className="text-sm">Config Directory</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Custom config directory (defaults to ~/.claude)
            </p>
            <div className="flex gap-2">
              <Input
                value={localSettings.env_vars?.CLAUDE_CONFIG_DIR || ""}
                onChange={(e) => {
                  handleEnvVarChange("CLAUDE_CONFIG_DIR", e.target.value);
                }}
                placeholder="~/.claude"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSelectConfigDir}
              >
                <LuFolderOpen />
              </Button>
              {localSettings.env_vars?.CLAUDE_CONFIG_DIR && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveEnvVar("CLAUDE_CONFIG_DIR")}
                >
                  <VscClose />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Environment Variables */}
        <div>
          <Label className="text-sm">Custom Environment Variables</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Additional environment variables to pass to the ACP
          </p>
          <div className="space-y-2">
            {Object.entries(localSettings.env_vars || {})
              .filter(([key]) => key !== "CLAUDE_CONFIG_DIR") // Don't show CLAUDE_CONFIG_DIR here
              .filter(([key]) =>
                !isCodexSettings(localSettings) ||
                !["OPENAI_API_KEY", "CODEX_API_KEY", "NO_BROWSER"].includes(key)
              ) // Don't show Codex-specific vars here
              .filter(([key]) =>
                !isKimiSettings(localSettings) ||
                ![
                  "KIMI_API_KEY",
                  "KIMI_BASE_URL",
                  "OPENAI_API_KEY",
                  "OPENAI_BASE_URL",
                  "KIMI_SHARE_DIR",
                  "KIMI_CLI_NO_AUTO_UPDATE",
                ].includes(key)
              ) // Don't show Kimi-specific vars here
              .filter(([key]) =>
                !isGeminiSettings(localSettings) ||
                ![
                  "GEMINI_API_KEY",
                  "GOOGLE_API_KEY",
                  "GOOGLE_CLOUD_PROJECT",
                  "GOOGLE_CLOUD_LOCATION",
                ].includes(key)
              ) // Don't show Gemini-specific vars here
              .filter(([key]) =>
                !isOpenCodeSettings(localSettings) ||
                !["OPENCODE_API_KEY"].includes(key)
              ) // Don't show OpenCode-specific vars here
              .filter(([key]) =>
                !isQoderSettings(localSettings) ||
                !["QODER_API_KEY"].includes(key)
              ) // Don't show Qoder-specific vars here
              .filter(([key]) =>
                !isQwenCodeSettings(localSettings) ||
                !["DASHSCOPE_API_KEY"].includes(key)
              ) // Don't show QwenCode-specific vars here
              .map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <Input
                    value={key}
                    onChange={(e) => {
                      const oldKey = key;
                      const newKey = e.target.value;
                      if (newKey !== oldKey) {
                        const envVars = { ...(localSettings.env_vars || {}) };
                        delete envVars[oldKey];
                        envVars[newKey] = value;
                        setLocalSettings({
                          ...localSettings,
                          env_vars: envVars,
                        });
                        setIsDirty(true);
                      }
                    }}
                    placeholder="Variable name"
                    className="flex-1"
                  />
                  <Input
                    value={value}
                    onChange={(e) => handleEnvVarChange(key, e.target.value)}
                    placeholder="Value"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveEnvVar(key)}
                  >
                    <Trash />
                  </Button>
                </div>
              ))}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddCustomEnvVar}
              className="w-full"
            >
              Add Environment Variable
            </Button>
          </div>
        </div>


      </div>

      {/* Save Button */}
      {isDirty && (
        <div className="mt-4 pt-4 border-t">
          <Button onClick={handleSave} className="w-full" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
