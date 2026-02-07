import { Button } from "@/components/ui/button";
import { useSelectorSessionStore } from "@/stores";
import { cn } from "@/lib/utils";
import { Keyboard, Check, X } from "lucide-react";

interface InteractionPromptProps {
  sessionId: string;
}

export function InteractionPromptPanel({ sessionId }: InteractionPromptProps) {
  const { interactionPrompts, sendInteractionResponse } =
    useSelectorSessionStore(["interactionPrompts", "sendInteractionResponse"]);

  const prompt = interactionPrompts[sessionId];

  console.log("[InteractionPromptPanel] sessionId:", sessionId);
  console.log(
    "[InteractionPromptPanel] interactionPrompts:",
    interactionPrompts,
  );
  console.log("[InteractionPromptPanel] prompt:", prompt);

  if (!prompt) {
    console.log("[InteractionPromptPanel] No prompt, returning null");
    return null;
  }

  const handleConfirm = async () => {
    // Send empty string (Enter key) for confirmation
    await sendInteractionResponse(sessionId, "");
  };

  const handleDecline = async () => {
    // Send 'n' for decline
    await sendInteractionResponse(sessionId, "n");
  };

  return (
    <div className="border-t bg-muted/50 p-4">
      <div className="max-w-(--breakpoint-md) mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-600">
            <Keyboard className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{prompt.message}</p>
            <p className="text-xs text-muted-foreground">
              Claude CLI is waiting for your response
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {prompt.type === "confirm" ? (
            <>
              <Button size="sm" onClick={handleConfirm} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Confirm (Enter)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDecline}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Decline (n)
              </Button>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <input
                type="text"
                placeholder="Type your response..."
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm rounded-md border bg-background",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendInteractionResponse(sessionId, e.currentTarget.value);
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  const input = document.querySelector(
                    'input[placeholder="Type your response..."]',
                  ) as HTMLInputElement;
                  if (input) {
                    sendInteractionResponse(sessionId, input.value);
                  }
                }}
              >
                Send
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
