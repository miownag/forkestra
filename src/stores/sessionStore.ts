import { create } from "zustand";
import { useShallow } from 'zustand/react/shallow';
import { devtools, persist } from "zustand/middleware";
import { pick } from 'es-toolkit';
import { invoke } from "@tauri-apps/api/core";
import type {
  Session,
  CreateSessionRequest,
  ChatMessage,
  StreamChunk,
} from "@/types";

interface SessionState {
  // State
  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (request: CreateSessionRequest) => Promise<Session>;
  setActiveSession: (sessionId: string | null) => void;
  sendMessage: (sessionId: string, message: string) => Promise<void>;
  terminateSession: (
    sessionId: string,
    cleanupWorktree: boolean
  ) => Promise<void>;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  handleStreamChunk: (chunk: StreamChunk) => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        sessions: [],
        activeSessionId: null,
        messages: {},
        isLoading: false,
        error: null,

        // Actions
        fetchSessions: async () => {
          set({ isLoading: true, error: null });
          try {
            const sessions = await invoke<Session[]>("list_sessions");
            set({ sessions, isLoading: false });
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        createSession: async (request) => {
          set({ isLoading: true, error: null });
          try {
            const session = await invoke<Session>("create_session", {
              request,
            });
            set((state) => ({
              sessions: [...state.sessions, session],
              activeSessionId: session.id,
              messages: { ...state.messages, [session.id]: [] },
              isLoading: false,
            }));
            return session;
          } catch (error) {
            set({ error: String(error), isLoading: false });
            throw error;
          }
        },

        setActiveSession: (sessionId) => {
          set({ activeSessionId: sessionId });
        },

        sendMessage: async (sessionId, message) => {
          try {
            // Add user message to local state
            const userMessage: ChatMessage = {
              id: crypto.randomUUID(),
              session_id: sessionId,
              role: "user",
              content: message,
              content_type: "text",
              timestamp: new Date().toISOString(),
              is_streaming: false,
            };
            get().addMessage(sessionId, userMessage);

            // Send to backend
            await invoke("send_message", { sessionId, message });
          } catch (error) {
            set({ error: String(error) });
          }
        },

        terminateSession: async (sessionId, cleanupWorktree) => {
          set({ isLoading: true, error: null });
          try {
            await invoke("terminate_session", { sessionId, cleanupWorktree });
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? { ...s, status: "terminated" as const }
                  : s
              ),
              activeSessionId:
                state.activeSessionId === sessionId
                  ? null
                  : state.activeSessionId,
              isLoading: false,
            }));
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        addMessage: (sessionId, message) => {
          set((state) => ({
            messages: {
              ...state.messages,
              [sessionId]: [...(state.messages[sessionId] || []), message],
            },
          }));
        },

        handleStreamChunk: (chunk) => {
          set((state) => {
            const sessionMessages = state.messages[chunk.session_id] || [];
            const existingMessageIndex = sessionMessages.findIndex(
              (m) => m.id === chunk.message_id
            );

            if (chunk.is_complete) {
              // Mark message as complete
              if (existingMessageIndex >= 0) {
                const updatedMessages = [...sessionMessages];
                updatedMessages[existingMessageIndex] = {
                  ...updatedMessages[existingMessageIndex],
                  is_streaming: false,
                };
                return {
                  messages: {
                    ...state.messages,
                    [chunk.session_id]: updatedMessages,
                  },
                };
              }
              return state;
            }

            if (existingMessageIndex >= 0) {
              // Update existing streaming message
              const updatedMessages = [...sessionMessages];
              updatedMessages[existingMessageIndex] = {
                ...updatedMessages[existingMessageIndex],
                content:
                  updatedMessages[existingMessageIndex].content + chunk.content,
              };
              return {
                messages: {
                  ...state.messages,
                  [chunk.session_id]: updatedMessages,
                },
              };
            } else {
              // Create new streaming message
              const newMessage: ChatMessage = {
                id: chunk.message_id,
                session_id: chunk.session_id,
                role: "assistant",
                content: chunk.content,
                content_type: "text",
                timestamp: new Date().toISOString(),
                is_streaming: true,
              };
              return {
                messages: {
                  ...state.messages,
                  [chunk.session_id]: [...sessionMessages, newMessage],
                },
              };
            }
          });
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: "forkestra-sessions",
        partialize: (state) => ({
          activeSessionId: state.activeSessionId,
        }),
      }
    ),
    { name: "SessionStore" }
  )
);

const useSelectorSessionStore = <T extends (keyof (SessionState))[]>(
  keys: T,
): Pick<SessionState, T[number]> =>
  useSessionStore(useShallow((state) => pick(state, keys)));

export default useSelectorSessionStore;