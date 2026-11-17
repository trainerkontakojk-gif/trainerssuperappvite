import type { ChatMessage, KetikServerSession } from "@trainers/types";
import { KETIK_SESSION_ERRORS } from "@trainers/types";

// Orthogonal regions: appends deliberately remain possible during a response.
export type ResponseStatus =
  | "idle"
  | "recovering"
  | "requesting"
  | "revealing"
  | "blocked"
  | "recovery-failed"
  | "legacy-retrying";
export interface ChatState {
  append:
    { status: "idle" | "saving" } | { status: "blocked"; message: string };
  response: ResponseStatus;
  legacy: KetikServerSession["pendingTurn"];
  phase: "active" | "expired" | "closed";
  messages: ChatMessage[];
  queuedCount: number;
  error: { kind: "append" | "response"; message: string } | null;
}
export type ChatEvent =
  | { type: "present"; messages: ChatMessage[]; queuedCount: number }
  | { type: "session"; closed: boolean }
  | { type: "expire" }
  | { type: "append-start" }
  | { type: "append-saved" }
  | { type: "append-finish" }
  | { type: "append-failed"; message: string }
  | { type: "append-retry" }
  | { type: "response-start" }
  | { type: "response-published" }
  | { type: "response-finish" }
  | { type: "legacy-recovered"; turn: KetikServerSession["pendingTurn"] }
  | { type: "legacy-finished" }
  | { type: "response-failed" }
  | { type: "recovery-failed" }
  | { type: "response-retry" }
  | { type: "legacy-retry" }
  | { type: "send-refused"; message: string };

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "present":
      return {
        ...state,
        messages: event.messages,
        queuedCount: event.queuedCount,
      };
    case "session":
      return event.closed ? { ...state, phase: "closed" } : state;
    case "expire":
      return state.phase === "active" ? { ...state, phase: "expired" } : state;
    case "append-start":
      return state.append.status === "idle" && state.legacy === null
        ? {
            ...state,
            append: { status: "saving" },
            error: state.error?.kind === "append" ? null : state.error,
          }
        : state;
    case "append-saved":
      return {
        ...state,
        response: state.response === "blocked" ? "idle" : state.response,
        error:
          state.response === "blocked" && state.error?.kind === "response"
            ? null
            : state.error,
      };
    case "append-finish":
      return state.append.status === "saving"
        ? { ...state, append: { status: "idle" } }
        : state;
    case "append-failed":
      return {
        ...state,
        append: { status: "blocked", message: event.message },
      };
    case "append-retry":
      return {
        ...state,
        append: { status: "idle" },
        error: state.error?.kind === "append" ? null : state.error,
      };
    case "response-start":
      return state.response === "idle"
        ? {
            ...state,
            response: "requesting",
            error: state.error?.kind === "response" ? null : state.error,
          }
        : state;
    case "response-published":
      return state.response === "requesting"
        ? { ...state, response: "revealing" }
        : state;
    case "response-finish":
      return [
        "requesting",
        "revealing",
        "recovering",
        "legacy-retrying",
      ].includes(state.response)
        ? { ...state, response: "idle" }
        : state;
    case "legacy-recovered":
      return state.response === "recovering"
        ? { ...state, legacy: event.turn, response: "idle" }
        : state;
    case "legacy-finished":
      return state.response === "legacy-retrying"
        ? { ...state, legacy: null, response: "idle" }
        : state;
    case "response-failed":
      return {
        ...state,
        response: "blocked",
        error: {
          kind: "response",
          message: KETIK_SESSION_ERRORS.SESSION_AI_FAILED,
        },
      };
    case "recovery-failed":
      return {
        ...state,
        response: "recovery-failed",
        error: {
          kind: "response",
          message: "Status balasan belum bisa dimuat. Coba lagi.",
        },
      };
    case "response-retry":
      return {
        ...state,
        response: state.response === "recovery-failed" ? "recovering" : "idle",
        error: null,
      };
    case "legacy-retry":
      return state.legacy?.status === "failed"
        ? { ...state, response: "legacy-retrying", error: null }
        : state;
    case "send-refused":
      return { ...state, error: { kind: "append", message: event.message } };
  }
}
