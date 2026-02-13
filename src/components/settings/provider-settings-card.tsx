import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProviderSettingsStore } from "@/stores";
import type { ProviderInfo, ProviderSettings } from "@/types";
import { isClaudeSettings } from "@/types";
import { LuFolderOpen } from "react-icons/lu";
import { VscCheck, VscClose } from "react-icons/vsc";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import PROVIDER_ICONS_MAP from "@/constants/icons";
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
          <ProviderIcon.Combine
            size={20}
            className="flex items-center gap-1 mb-1"
            type="color"
          />
          <p
            className="text-xs text-muted-foreground truncate max-w-75"
            title={provider.cli_path || ""}
          >
            {provider.cli_path || `${provider.cli_command} (not found)`}
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
        {/* Custom CLI Path */}
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

        {/* Enable/Disable Provider */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Enable Provider</Label>
            <p className="text-xs text-muted-foreground">
              Show this provider in session creation
            </p>
          </div>
          <Switch
            checked={localSettings.enabled}
            onCheckedChange={(checked) => {
              setLocalSettings({
                ...localSettings,
                enabled: checked,
              });
              setIsDirty(true);
            }}
          />
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
