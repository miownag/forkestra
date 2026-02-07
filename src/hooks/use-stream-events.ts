import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSelectorSessionStore } from "@/stores";
import type { StreamChunk, InteractionPrompt } from "@/types";

export function useStreamEvents() {
  const { handleStreamChunk, setInteractionPrompt } = useSelectorSessionStore([
    "handleStreamChunk",
    "setInteractionPrompt",
  ]);

  useEffect(() => {
    console.log("[useStreamEvents] Setting up listeners");
    let isActive = true;
    let unlistenStreamFn: (() => void) | null = null;
    let unlistenPromptFn: (() => void) | null = null;

    const setupListeners = async () => {
      console.log("[useStreamEvents] Starting listener setup...");
      
      // Listen for stream chunks
      console.log("[useStreamEvents] Setting up stream-chunk listener...");
      const unlistenStream = await listen<StreamChunk>("stream-chunk", (event) => {
        console.log("[useStreamEvents] Received stream-chunk:", event);
        if (isActive) {
          handleStreamChunk(event.payload);
        }
      });
      console.log("[useStreamEvents] stream-chunk listener setup complete");

      // Listen for interaction prompts
      console.log("[useStreamEvents] Setting up interaction-prompt listener...");
      const unlistenPrompt = await listen<InteractionPrompt>("interaction-prompt", (event) => {
        console.log("[useStreamEvents] Received interaction-prompt:", event);
        console.log("[useStreamEvents] Session ID:", event.payload.session_id);
        console.log("[useStreamEvents] Prompt type:", event.payload.prompt_type);
        console.log("[useStreamEvents] Message:", event.payload.message);
        if (isActive) {
          console.log("[useStreamEvents] Calling setInteractionPrompt");
          setInteractionPrompt(event.payload.session_id, {
            sessionId: event.payload.session_id,
            type: event.payload.prompt_type as "confirm" | "input",
            message: event.payload.message,
          });
          console.log("[useStreamEvents] setInteractionPrompt called");
        }
      });
      console.log("[useStreamEvents] interaction-prompt listener setup complete");

      if (isActive) {
        unlistenStreamFn = unlistenStream;
        unlistenPromptFn = unlistenPrompt;
        console.log("[useStreamEvents] All listeners setup complete");
      } else {
        unlistenStream();
        unlistenPrompt();
      }
    };

    setupListeners();

    return () => {
      console.log("[useStreamEvents] Cleaning up listeners");
      isActive = false;
      if (unlistenStreamFn) {
        unlistenStreamFn();
      }
      if (unlistenPromptFn) {
        unlistenPromptFn();
      }
    };
  }, [handleStreamChunk, setInteractionPrompt]);
}
