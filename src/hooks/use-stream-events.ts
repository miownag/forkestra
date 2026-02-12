import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSelectorSessionStore } from "@/stores";
import { useSessionStore } from "@/stores/session-storage";
import type { StreamChunk, InteractionPrompt, SessionStatusEvent, AvailableCommandsEvent, PlanUpdateEvent } from "@/types";

/**
 * Flush all currently-streaming messages to the database.
 * Called on window unload/close so partial responses are not lost.
 */
function flushStreamingMessages() {
  const state = useSessionStore.getState();
  for (const sessionId of state.streamingSessions) {
    const sessionMessages = state.messages[sessionId] || [];
    for (const m of sessionMessages) {
      if (!m.is_streaming) continue;

      const toolCalls = m.tool_calls?.map((tc) =>
        tc.status === "running"
          ? { ...tc, status: "interrupted" }
          : tc,
      );

      const saved = {
        ...m,
        is_streaming: false,
        tool_calls: toolCalls,
        parts: undefined,
      };

      invoke("save_message", { message: saved }).catch((err) => {
        console.error("Failed to flush streaming message:", err);
      });
    }
  }
}

export function useStreamEvents() {
  const { handleStreamChunk, setInteractionPrompt, handleSessionStatusChanged, setAvailableCommands, setPlanEntries } = useSelectorSessionStore([
    "handleStreamChunk",
    "setInteractionPrompt",
    "handleSessionStatusChanged",
    "setAvailableCommands",
    "setPlanEntries",
  ]);

  useEffect(() => {
    console.log("[useStreamEvents] Setting up listeners");
    let isActive = true;
    let unlistenStreamFn: (() => void) | null = null;
    let unlistenPromptFn: (() => void) | null = null;
    let unlistenStatusFn: (() => void) | null = null;
    let unlistenCommandsFn: (() => void) | null = null;
    let unlistenPlanFn: (() => void) | null = null;

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
            type: event.payload.prompt_type as "confirm" | "input" | "permission",
            message: event.payload.message,
            requestId: event.payload.request_id,
            toolName: event.payload.tool_name,
            options: event.payload.options?.map((o) => ({
              kind: o.kind,
              name: o.name,
              optionId: o.option_id,
            })),
          });
          console.log("[useStreamEvents] setInteractionPrompt called");
        }
      });
      console.log("[useStreamEvents] interaction-prompt listener setup complete");

      // Listen for session status changes
      console.log("[useStreamEvents] Setting up session-status-changed listener...");
      const unlistenStatus = await listen<SessionStatusEvent>("session-status-changed", (event) => {
        console.log("[useStreamEvents] Received session-status-changed:", event.payload.session_id, event.payload.status);
        if (isActive) {
          handleSessionStatusChanged(event.payload);
        }
      });
      console.log("[useStreamEvents] session-status-changed listener setup complete");

      // Listen for available commands updates
      const unlistenCommands = await listen<AvailableCommandsEvent>("available-commands-update", (event) => {
        console.log("[useStreamEvents] Received available-commands-update:", event.payload.session_id, event.payload.available_commands.length, "commands");
        if (isActive) {
          setAvailableCommands(
            event.payload.session_id,
            event.payload.available_commands,
          );
        }
      });

      // Listen for plan updates
      const unlistenPlan = await listen<PlanUpdateEvent>("plan-update", (event) => {
        console.log("[useStreamEvents] Received plan-update:", event.payload.session_id, event.payload.entries.length, "entries");
        if (isActive) {
          setPlanEntries(
            event.payload.session_id,
            event.payload.message_id,
            event.payload.entries,
          );
        }
      });

      if (isActive) {
        unlistenStreamFn = unlistenStream;
        unlistenPromptFn = unlistenPrompt;
        unlistenStatusFn = unlistenStatus;
        unlistenCommandsFn = unlistenCommands;
        unlistenPlanFn = unlistenPlan;
        console.log("[useStreamEvents] All listeners setup complete");
      } else {
        unlistenStream();
        unlistenPrompt();
        unlistenStatus();
        unlistenCommands();
        unlistenPlan();
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
      if (unlistenStatusFn) {
        unlistenStatusFn();
      }
      if (unlistenCommandsFn) {
        unlistenCommandsFn();
      }
      if (unlistenPlanFn) {
        unlistenPlanFn();
      }
    };
  }, [handleStreamChunk, setInteractionPrompt, handleSessionStatusChanged, setAvailableCommands, setPlanEntries]);

  // Flush streaming messages to DB on window close / refresh
  useEffect(() => {
    window.addEventListener("beforeunload", flushStreamingMessages);
    return () => {
      window.removeEventListener("beforeunload", flushStreamingMessages);
    };
  }, []);
}
