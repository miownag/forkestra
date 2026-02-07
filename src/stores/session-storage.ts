import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { devtools, persist } from "zustand/middleware";
import { pick } from "es-toolkit";
import { invoke } from "@tauri-apps/api/core";
import type {
  Session,
  CreateSessionRequest,
  ChatMessage,
  StreamChunk,
} from "@/types";

interface InteractionPrompt {
  sessionId: string;
  type: "confirm" | "input" | "permission";
  message: string;
  requestId?: string;
  toolName?: string;
}

interface SessionState {
  // State
  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;
  messagesLoaded: Record<string, boolean>;
  isLoading: boolean;
  streamingSessions: Set<string>;
  interactionPrompts: Record<string, InteractionPrompt | null>;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (request: CreateSessionRequest) => Promise<Session>;
  setActiveSession: (sessionId: string | null) => void;
  loadSessionMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, message: string) => Promise<void>;
  sendInteractionResponse: (
    sessionId: string,
    response: string,
  ) => Promise<void>;
  terminateSession: (
    sessionId: string,
    cleanupWorktree: boolean,
  ) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  handleStreamChunk: (chunk: StreamChunk) => void;
  setInteractionPrompt: (
    sessionId: string,
    prompt: InteractionPrompt | null,
  ) => void;
  clearError: () => void;
}

const DEFAULT_SESSION_NAME = "New Session";
const SESSION_NAME_MAX_LENGTH = 50;

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        sessions: [],
        activeSessionId: null,
        messages: {},
        messagesLoaded: {},
        isLoading: false,
        streamingSessions: new Set(),
        interactionPrompts: {},
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
              messagesLoaded: { ...state.messagesLoaded, [session.id]: true },
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
          // Lazy-load messages when a session is selected
          if (sessionId) {
            get().loadSessionMessages(sessionId);
          }
        },

        loadSessionMessages: async (sessionId) => {
          // Skip if already loaded
          if (get().messagesLoaded[sessionId]) return;

          try {
            const messages = await invoke<ChatMessage[]>(
              "get_session_messages",
              { sessionId },
            );
            set((state) => ({
              messages: { ...state.messages, [sessionId]: messages },
              messagesLoaded: { ...state.messagesLoaded, [sessionId]: true },
            }));
          } catch (error) {
            console.error("Failed to load session messages:", error);
          }
        },

        sendMessage: async (sessionId, message) => {
          try {
            // Check if this is the first message and session has default name
            const state = get();
            const session = state.sessions.find((s) => s.id === sessionId);
            const sessionMessages = state.messages[sessionId] || [];
            const isFirstMessage = sessionMessages.length === 0;
            const hasDefaultName = session?.name === DEFAULT_SESSION_NAME;

            // Add session to streaming sessions
            set((state) => ({
              streamingSessions: new Set(state.streamingSessions).add(
                sessionId,
              ),
            }));

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

            // Persist user message to database
            invoke("save_message", { message: userMessage }).catch((err) => {
              console.error("Failed to persist user message:", err);
            });

            // Auto-rename session if it's the first message and has default name
            if (isFirstMessage && hasDefaultName) {
              const newName = message.trim().slice(0, SESSION_NAME_MAX_LENGTH);
              if (newName) {
                // Fire and forget - don't block on rename
                get()
                  .renameSession(sessionId, newName)
                  .catch(() => {
                    // Ignore rename errors
                  });
              }
            }

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
            set((state) => {
              if (cleanupWorktree) {
                // Session fully deleted - remove from state entirely
                const { [sessionId]: _, ...remainingMessages } = state.messages;
                const { [sessionId]: __, ...remainingLoaded } =
                  state.messagesLoaded;
                return {
                  sessions: state.sessions.filter((s) => s.id !== sessionId),
                  messages: remainingMessages,
                  messagesLoaded: remainingLoaded,
                  activeSessionId:
                    state.activeSessionId === sessionId
                      ? null
                      : state.activeSessionId,
                  isLoading: false,
                };
              }
              // Session terminated but kept in history
              return {
                sessions: state.sessions.map((s) =>
                  s.id === sessionId
                    ? { ...s, status: "terminated" as const }
                    : s,
                ),
                activeSessionId:
                  state.activeSessionId === sessionId
                    ? null
                    : state.activeSessionId,
                isLoading: false,
              };
            });
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        renameSession: async (sessionId, newName) => {
          set({ isLoading: true, error: null });
          try {
            const session = await invoke<Session>("rename_session", {
              sessionId,
              newName,
            });
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId ? session : s,
              ),
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
              (m) => m.id === chunk.message_id,
            );

            if (chunk.is_complete) {
              // Mark message as complete
              if (existingMessageIndex >= 0) {
                const updatedMessages = [...sessionMessages];
                updatedMessages[existingMessageIndex] = {
                  ...updatedMessages[existingMessageIndex],
                  is_streaming: false,
                };

                // Persist completed assistant message to database
                const completedMessage = updatedMessages[existingMessageIndex];
                invoke("save_message", { message: completedMessage }).catch(
                  (err) => {
                    console.error(
                      "Failed to persist assistant message:",
                      err,
                    );
                  },
                );

                // Remove session from streaming sessions
                const newStreamingSessions = new Set(state.streamingSessions);
                newStreamingSessions.delete(chunk.session_id);
                return {
                  messages: {
                    ...state.messages,
                    [chunk.session_id]: updatedMessages,
                  },
                  streamingSessions: newStreamingSessions,
                };
              }
              // Remove session from streaming sessions even if message not found
              const newStreamingSessions = new Set(state.streamingSessions);
              newStreamingSessions.delete(chunk.session_id);
              return {
                ...state,
                streamingSessions: newStreamingSessions,
              };
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

        sendInteractionResponse: async (sessionId, response) => {
          try {
            await invoke("send_interaction_response", { sessionId, response });
            // Clear the interaction prompt after sending response
            set((state) => ({
              interactionPrompts: {
                ...state.interactionPrompts,
                [sessionId]: null,
              },
            }));
          } catch (error) {
            set({ error: String(error) });
          }
        },

        setInteractionPrompt: (sessionId, prompt) => {
          set((state) => ({
            interactionPrompts: {
              ...state.interactionPrompts,
              [sessionId]: prompt,
            },
          }));
        },
        clearError: () => set({ error: null }),
      }),
      {
        name: "forkestra-sessions",
        partialize: (state) => ({
          activeSessionId: state.activeSessionId,
        }),
      },
    ),
    { name: "SessionStore" },
  ),
);

const useSelectorSessionStore = <T extends (keyof SessionState)[]>(
  keys: T,
): Pick<SessionState, T[number]> =>
  useSessionStore(useShallow((state) => pick(state, keys)));

export default useSelectorSessionStore;
