import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { devtools, persist } from "zustand/middleware";
import { pick } from "es-toolkit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type TerminalPosition = "right" | "bottom";
export type TerminalStatus = "idle" | "running" | "error";

export interface TerminalInstance {
  id: string;
  sessionId: string;
  name: string;
  cwd: string;
  status: TerminalStatus;
  createdAt: number;
}

export interface TerminalOutput {
  terminalId: string;
  data: string;
}

interface TerminalState {
  // State
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  isPanelOpen: boolean;
  position: TerminalPosition;
  panelSize: number; // width when right, height when bottom
  outputs: Record<string, string>;

  // Actions
  createTerminal: (sessionId: string, cwd: string, name?: string) => Promise<string>;
  closeTerminal: (terminalId: string) => Promise<void>;
  setActiveTerminal: (terminalId: string | null) => void;
  sendInput: (terminalId: string, input: string) => Promise<void>;
  resizeTerminal: (terminalId: string, cols: number, rows: number) => Promise<void>;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setPosition: (position: TerminalPosition) => void;
  setPanelSize: (size: number) => void;
  appendOutput: (terminalId: string, data: string) => void;
  clearOutput: (terminalId: string) => void;
  getOrCreateTerminalForSession: (sessionId: string, cwd: string) => Promise<string>;
}

const DEFAULT_PANEL_SIZE = {
  right: 400,
  bottom: 300,
};

const MAX_OUTPUT_LENGTH = 100000; // Maximum characters to keep in memory

export const useTerminalStore = create<TerminalState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        terminals: [],
        activeTerminalId: null,
        isPanelOpen: false,
        position: "bottom",
        panelSize: DEFAULT_PANEL_SIZE.bottom,
        outputs: {},

        // Actions
        createTerminal: async (sessionId: string, cwd: string, name?: string) => {
          const terminalName = name || `Terminal ${get().terminals.filter(t => t.sessionId === sessionId).length + 1}`;

          try {
            const terminalId = await invoke<string>("create_terminal", {
              request: {
                session_id: sessionId,
                cwd,
                name: terminalName,
              },
            });

            const newTerminal: TerminalInstance = {
              id: terminalId,
              sessionId,
              name: terminalName,
              cwd,
              status: "idle",
              createdAt: Date.now(),
            };

            set((state) => ({
              terminals: [...state.terminals, newTerminal],
              activeTerminalId: terminalId,
              isPanelOpen: true,
              outputs: { ...state.outputs, [terminalId]: "" },
            }));

            return terminalId;
          } catch (error) {
            console.error("Failed to create terminal:", error);
            throw error;
          }
        },

        closeTerminal: async (terminalId: string) => {
          try {
            await invoke("close_terminal", { terminalId });
          } catch (error) {
            console.error("Failed to close terminal:", error);
          }

          set((state) => {
            const newTerminals = state.terminals.filter((t) => t.id !== terminalId);
            const newOutputs = { ...state.outputs };
            delete newOutputs[terminalId];

            // If we're closing the active terminal, switch to another one
            let newActiveId = state.activeTerminalId;
            if (state.activeTerminalId === terminalId) {
              newActiveId = newTerminals.length > 0 ? newTerminals[newTerminals.length - 1].id : null;
            }

            // If no terminals left, close the panel
            const newIsPanelOpen = newTerminals.length > 0 ? state.isPanelOpen : false;

            return {
              terminals: newTerminals,
              activeTerminalId: newActiveId,
              isPanelOpen: newIsPanelOpen,
              outputs: newOutputs,
            };
          });
        },

        setActiveTerminal: (terminalId: string | null) => {
          set({ activeTerminalId: terminalId });
        },

        sendInput: async (terminalId: string, input: string) => {
          try {
            await invoke("send_terminal_input", {
              request: {
                terminal_id: terminalId,
                input,
              },
            });
          } catch (error) {
            console.error("Failed to send input:", error);
            throw error;
          }
        },

        resizeTerminal: async (terminalId: string, cols: number, rows: number) => {
          try {
            await invoke("resize_terminal", {
              request: {
                terminal_id: terminalId,
                cols,
                rows,
              },
            });
          } catch (error) {
            console.error("Failed to resize terminal:", error);
          }
        },

        togglePanel: () => {
          set((state) => ({ isPanelOpen: !state.isPanelOpen }));
        },

        openPanel: () => {
          set({ isPanelOpen: true });
        },

        closePanel: () => {
          set({ isPanelOpen: false });
        },

        setPosition: (position: TerminalPosition) => {
          set({
            position,
            panelSize: DEFAULT_PANEL_SIZE[position],
          });
        },

        setPanelSize: (size: number) => {
          set({ panelSize: size });
        },

        appendOutput: (terminalId: string, data: string) => {
          set((state) => {
            const currentOutput = state.outputs[terminalId] || "";
            let newOutput = currentOutput + data;

            // Trim if too long
            if (newOutput.length > MAX_OUTPUT_LENGTH) {
              newOutput = newOutput.slice(-MAX_OUTPUT_LENGTH);
            }

            return {
              outputs: { ...state.outputs, [terminalId]: newOutput },
            };
          });
        },

        clearOutput: (terminalId: string) => {
          set((state) => ({
            outputs: { ...state.outputs, [terminalId]: "" },
          }));
        },

        getOrCreateTerminalForSession: async (sessionId: string, cwd: string) => {
          const currentState = get();

          // Check if there's already a terminal for this session
          const existingTerminal = currentState.terminals.find(
            (t: TerminalInstance) => t.sessionId === sessionId && t.cwd === cwd
          );

          if (existingTerminal) {
            set({ activeTerminalId: existingTerminal.id, isPanelOpen: true });
            return existingTerminal.id;
          }

          // Create a new terminal
          return await get().createTerminal(sessionId, cwd);
        },
      }),
      {
        name: "forkestra-terminal-store",
        partialize: (state) => ({
          position: state.position,
          panelSize: state.panelSize,
        }),
      }
    ),
    { name: "TerminalStore" }
  )
);

// Selector hook for better performance
export function useSelectorTerminalStore<T extends (keyof TerminalState)[]>(
  keys: T
): Pick<TerminalState, T[number]> {
  return useTerminalStore(
    useShallow((state) => pick(state, keys) as Pick<TerminalState, T[number]>)
  );
}

// Hook to listen for terminal output events
export function useTerminalOutputListener(
  terminalId: string | null,
  onOutput: (data: string) => void
) {
  useEffect(() => {
    if (!terminalId) return;

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ terminalId: string; data: string }>(
        `terminal:output:${terminalId}`,
        (event) => {
          onOutput(event.payload.data);
        }
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [terminalId, onOutput]);
}

// Hook to listen for all terminal output events
export function useAllTerminalOutputListener(
  onOutput: (terminalId: string, data: string) => void
) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ terminalId: string; data: string }>(
        "terminal:output",
        (event) => {
          onOutput(event.payload.terminalId, event.payload.data);
        }
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [onOutput]);
}

// Import useEffect at the top
import { useEffect } from "react";
