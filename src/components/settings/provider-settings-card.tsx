import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProviderSettingsStore } from "@/stores";
import type {
  ProviderInfo,
  ProviderSettings,
  ClaudeProviderSettings,
} from "@/types";
import { isClaudeSettings } from "@/types";
import { VscFolder, VscCheck, VscClose } from "react-icons/vsc";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import PROVIDER_ICONS_MAP from "@/constants/icons";

interface ProviderSettingsCardProps {
  provider: ProviderInfo;
}

export function ProviderSettingsCard({ provider }: ProviderSettingsCardProps) {
  const storeSettings = useProviderSettingsStore(
    (s) => s.settings[provider.provider_type],
  );
  const updateProviderSettings = useProviderSettingsStore(
    (s) => s.updateProviderSettings,
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
    setIsDirty(false);
  };

  const handleClearPath = () => {
    setLocalSettings({
      ...localSettings,
      custom_cli_path: null,
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
              <VscFolder className="h-4 w-4" />
            </Button>
            {localSettings.custom_cli_path && (
              <Button variant="ghost" size="icon" onClick={handleClearPath}>
                <VscClose className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Claude-specific: Disable Login Prompt */}
        {isClaudeSettings(localSettings) && (
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
        )}

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
