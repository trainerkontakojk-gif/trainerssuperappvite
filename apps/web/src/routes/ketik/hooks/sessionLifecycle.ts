import type { KetikServerSession } from "@trainers/types";

export type SessionState =
  | { status: "home" | "picking" | "starting" | "review" }
  | { status: "resuming" | "resume-failed"; sessionId: string }
  | { status: "chat" | "finishing"; session: KetikServerSession };
export type SessionEvent =
  | { type: "reset" }
  | { type: "route"; sessionId?: string; chat: boolean }
  | { type: "pick" }
  | { type: "cancel-pick" }
  | { type: "start" }
  | { type: "started"; session: KetikServerSession }
  | { type: "start-failed" }
  | { type: "resumed"; session: KetikServerSession }
  | { type: "resume-failed" }
  | { type: "retry-resume" }
  | { type: "finish" }
  | { type: "finish-failed" }
  | { type: "finished"; hasHistory: boolean };

export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case "reset":
      return { status: "home" };
    case "route":
      if (!event.sessionId) return { status: "home" };
      if (!event.chat) return { status: "review" };
      if (
        (state.status === "chat" || state.status === "finishing") &&
        state.session.id === event.sessionId
      )
        return state;
      return { status: "resuming", sessionId: event.sessionId };
    case "pick":
      return state.status === "home" ? { status: "picking" } : state;
    case "cancel-pick":
      return state.status === "picking" ? { status: "home" } : state;
    case "start":
      return state.status === "home" || state.status === "picking"
        ? { status: "starting" }
        : state;
    case "started":
      return state.status === "starting"
        ? { status: "chat", session: event.session }
        : state;
    case "start-failed":
      return state.status === "starting" ? { status: "home" } : state;
    case "resumed":
      return state.status === "resuming" && state.sessionId === event.session.id
        ? { status: "chat", session: event.session }
        : state;
    case "resume-failed":
      return state.status === "resuming"
        ? { ...state, status: "resume-failed" }
        : state;
    case "retry-resume":
      return state.status === "resume-failed"
        ? { ...state, status: "resuming" }
        : state;
    case "finish":
      return state.status === "chat"
        ? { ...state, status: "finishing" }
        : state;
    case "finish-failed":
      return state.status === "finishing"
        ? { ...state, status: "chat" }
        : state;
    case "finished":
      return state.status === "finishing" || state.status === "resuming"
        ? { status: event.hasHistory ? "review" : "home" }
        : state;
  }
}
