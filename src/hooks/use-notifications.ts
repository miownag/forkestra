import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import useSound from "use-sound";
import { useWindowFocus } from "./use-window-focus";
import { useSessionStore } from "@/stores/session-storage";
import { useSettingsStore } from "@/stores/settings-store";
import notificationSound from "@/assets/sounds/notification.mp3";

export function useNotifications() {
  const windowFocused = useWindowFocus();
  const [playSound] = useSound(notificationSound);

  // Use refs to avoid re-subscribing on every render
  const windowFocusedRef = useRef(windowFocused);
  windowFocusedRef.current = windowFocused;

  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;

  useEffect(() => {
    // Request notification permission on mount
    isPermissionGranted().then((granted) => {
      if (!granted) {
        requestPermission();
      }
    });
  }, []);

  // Subscribe to streaming session changes (agent complete)
  useEffect(() => {
    let prevStreaming = new Set(useSessionStore.getState().streamingSessions);

    const unsubStreaming = useSessionStore.subscribe((state) => {
      const current = state.streamingSessions;
      const activeSessionId = state.activeSessionId;
      const sessions = state.sessions;
      const soundEnabled = useSettingsStore.getState().soundEnabled;

      // Find sessions that were streaming but are no longer
      for (const sessionId of prevStreaming) {
        if (!current.has(sessionId)) {
          // Session finished streaming
          if (activeSessionId === sessionId && windowFocusedRef.current) {
            // User is looking at this session — skip notification
            continue;
          }

          const session = sessions.find((s) => s.id === sessionId);
          const name = session?.name ?? "Session";

          dispatchNotification({
            title: `${name} has finished`,
            body: "Agent has completed the response",
            sessionId,
            windowFocused: windowFocusedRef.current,
            soundEnabled,
            playSound: playSoundRef.current,
          });
        }
      }

      prevStreaming = new Set(current);
    });

    return unsubStreaming;
  }, []);

  // Subscribe to interaction prompt changes
  useEffect(() => {
    let prevPrompts: Record<string, unknown> = {
      ...useSessionStore.getState().interactionPrompts,
    };

    const unsubPrompts = useSessionStore.subscribe((state) => {
      const current = state.interactionPrompts;
      const activeSessionId = state.activeSessionId;
      const sessions = state.sessions;
      const soundEnabled = useSettingsStore.getState().soundEnabled;

      for (const [sessionId, prompt] of Object.entries(current)) {
        if (!prompt) continue;
        // Only notify for *new* prompts (wasn't there before, or was null)
        if (prevPrompts[sessionId] != null) continue;

        if (activeSessionId === sessionId && windowFocusedRef.current) {
          continue;
        }

        const session = sessions.find((s) => s.id === sessionId);
        const name = session?.name ?? "Session";
        const body =
          prompt.message.length > 100
            ? prompt.message.slice(0, 100) + "..."
            : prompt.message;

        dispatchNotification({
          title: `${name} needs your input`,
          body,
          sessionId,
          windowFocused: windowFocusedRef.current,
          soundEnabled,
          playSound: playSoundRef.current,
        });
      }

      prevPrompts = { ...current };
    });

    return unsubPrompts;
  }, []);
}

function dispatchNotification(opts: {
  title: string;
  body: string;
  sessionId: string;
  windowFocused: boolean;
  soundEnabled: boolean;
  playSound: () => void;
}) {
  const { title, body, sessionId, windowFocused, soundEnabled, playSound } =
    opts;

  if (windowFocused) {
    // In-app toast
    toast(title, {
      description: body,
      action: {
        label: "View",
        onClick: () => {
          const store = useSessionStore.getState();
          store.openTab(sessionId);
          store.setActiveSession(sessionId);
        },
      },
    });
  } else {
    // System notification
    try {
      sendNotification({ title, body });
    } catch {
      // Fallback: show toast anyway
      toast(title, { description: body });
    }
  }

  if (soundEnabled) {
    playSound();
  }
}
