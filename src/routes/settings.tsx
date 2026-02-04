import { Button } from "@/components/ui/button";
import { useProviderStore } from "@/stores";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { VscRefresh, VscCheck, VscClose, VscArrowLeft } from "react-icons/vsc";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  const providers = useProviderStore((s) => s.providers);
  const isDetecting = useProviderStore((s) => s.isDetecting);
  const detectProviders = useProviderStore((s) => s.detectProviders);
  const router = useRouter();

  return (
    <div className="space-y-6 sm:w-2xl md:w-3xl mx-auto py-12">
      <Button variant="ghost" onClick={() => router.history.back()}>
        <VscArrowLeft />
        Back
      </Button>
      {/* Providers Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">AI Providers</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => detectProviders()}
            disabled={isDetecting}
          >
            <VscRefresh
              className={`h-4 w-4 ${isDetecting ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="space-y-4">
          {providers.map((provider) => (
            <div
              key={provider.provider_type}
              className="max-w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3"
            >
              <div className="flex-1">
                <div className="font-medium text-sm mb-1">{provider.name}</div>
                <div
                  className="text-xs text-muted-foreground truncate max-w-64"
                  title={
                    provider.cli_path || `${provider.cli_command} (not found)`
                  }
                >
                  {provider.cli_path || `${provider.cli_command} (not found)`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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

      {/*  */}
    </div>
  );
}
