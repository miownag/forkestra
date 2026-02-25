import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

let focused = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return focused;
}

function setFocused(value: boolean) {
  if (focused !== value) {
    focused = value;
    listeners.forEach((l) => l());
  }
}

// Initialize focus listener at module load
getCurrentWindow()
  .onFocusChanged(({ payload }) => {
    setFocused(payload);
  })
  .catch(() => {
    // Fallback to browser events
    window.addEventListener("focus", () => setFocused(true));
    window.addEventListener("blur", () => setFocused(false));
  });

export function useWindowFocus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Non-reactive getter for use outside React components */
export function getWindowFocused(): boolean {
  return focused;
}
