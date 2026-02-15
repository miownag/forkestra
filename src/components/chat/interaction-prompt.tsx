import { Button } from "@/components/ui/button";
import { useSelectorSessionStore } from "@/stores";
import { cn } from "@/lib/utils";
import { Keyboard, Check, X, ShieldCheck, Terminal, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface InteractionPromptProps {
  sessionId: string;
}

export function InteractionPromptPanel({ sessionId }: InteractionPromptProps) {
  const { interactionPrompts, sendInteractionResponse } =
    useSelectorSessionStore(["interactionPrompts", "sendInteractionResponse"]);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = interactionPrompts[sessionId];

  useEffect(() => {
    if (prompt && inputRef.current) {
      inputRef.current.focus();
    }
  }, [prompt]);

  if (!prompt) {
    return null;
  }

  const handleConfirm = async () => {
    await sendInteractionResponse(sessionId, "");
  };

  const handleDecline = async () => {
    await sendInteractionResponse(sessionId, "n");
  };

  const handleOptionSelect = async (optionId: string) => {
    await sendInteractionResponse(sessionId, optionId);
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      sendInteractionResponse(sessionId, inputValue);
      setInputValue("");
    }
  };

  const isPermission =
    prompt.type === "permission" && prompt.options && prompt.options.length > 0;
  const isConfirm = prompt.type === "confirm";
  const isInput = !isPermission && !isConfirm;

  return (
    <div className="border-t border-border/50 bg-gradient-to-b from-background/80 to-muted/30 backdrop-blur-sm px-4 py-4">
      <div className="max-w-(--breakpoint-md) mx-auto">
        {/* Header with icon and message */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 ring-1 ring-cyan-500/30">
            <Terminal className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-medium text-foreground/90 leading-relaxed">
              {prompt.message}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1.5">
              <span className="inline-block w-1 h-1 rounded-full bg-cyan-500/60"></span>
              Awaiting input
            </p>
          </div>
        </div>

        {/* Action area */}
        <div className="flex flex-wrap items-center gap-2">
          {isPermission ? (
            <>
              {prompt.options!.map((option) => {
                const isReject =
                  option.kind === "rejectonce" ||
                  option.kind === "rejectalways";
                const isAlwaysAllow = option.kind === "allowalways";
                const isAllow = !isReject && !isAlwaysAllow;

                return (
                  <Button
                    key={option.optionId}
                    size="sm"
                    variant={isReject ? "outline" : "default"}
                    onClick={() => handleOptionSelect(option.optionId)}
                    className={cn(
                      "h-8 px-3 gap-1.5 text-xs font-medium transition-all duration-200",
                      isAllow &&
                        "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-sm shadow-cyan-500/20",
                      isAlwaysAllow &&
                        "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 shadow-sm shadow-emerald-500/20",
                      isReject &&
                        "border-destructive/30 text-destructive/80 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                    )}
                  >
                    {isReject ? (
                      <X className="h-3.5 w-3.5" />
                    ) : isAlwaysAllow ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {option.name}
                  </Button>
                );
              })}
            </>
          ) : isConfirm ? (
            <>
              <Button
                size="sm"
                onClick={handleConfirm}
                className="h-8 px-4 gap-1.5 text-xs font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-sm shadow-cyan-500/20 transition-all duration-200"
              >
                <Check className="h-3.5 w-3.5" />
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDecline}
                className="h-8 px-4 gap-1.5 text-xs font-medium border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                <X className="h-3.5 w-3.5" />
                Decline
              </Button>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type response..."
                  className={cn(
                    "w-full h-9 px-3 pr-10 text-sm rounded-lg border bg-background/80",
                    "border-border/60 text-foreground placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50",
                    "transition-all duration-200"
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSend();
                    }
                  }}
                />
                <Keyboard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              </div>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="h-9 px-4 gap-1.5 text-xs font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white border-0 shadow-sm shadow-cyan-500/20 transition-all duration-200"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
