import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "@/stores";
import type { StreamChunk } from "@/types";

export function useStreamEvents() {
  const handleStreamChunk = useSessionStore((s) => s.handleStreamChunk);

  useEffect(() => {
    const unlisten = listen<StreamChunk>("stream-chunk", (event) => {
      handleStreamChunk(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleStreamChunk]);
}
