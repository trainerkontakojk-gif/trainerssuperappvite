import type { KetikAssignmentSnapshot, ManagedUser } from "@trainers/types";
import type { ketikApi } from "../ketikApi";

type Source = Awaited<ReturnType<typeof ketikApi.getAssignmentSource>>;
type AssignmentContext = {
  source: Source;
  users: ManagedUser[];
  recipient: string;
};
export type AssignmentState =
  | {
      status: "loading" | "load-failed";
      source: null;
      users: ManagedUser[];
      recipient: string;
      snapshot: null;
      error: string | null;
    }
  | (AssignmentContext &
      (
        | { status: "choosing" | "checking"; snapshot: null; error: null }
        | {
            status: "ready" | "saving" | "success";
            snapshot: KetikAssignmentSnapshot;
            error: null;
          }
        | {
            status: "recipient-failed" | "save-failed";
            snapshot: null;
            error: string;
          }
      ));
export const INITIAL_ASSIGNMENT: AssignmentState = {
  status: "loading",
  source: null,
  users: [],
  recipient: "",
  snapshot: null,
  error: null,
};
export type AssignmentEvent =
  | { type: "reload" }
  | { type: "loaded"; source: Source; users: ManagedUser[] }
  | { type: "load-failed" }
  | { type: "select"; recipient: string }
  | { type: "checked"; recipient: string; snapshot: KetikAssignmentSnapshot }
  | { type: "check-failed"; recipient: string }
  | { type: "save" }
  | { type: "saved"; recipient: string; snapshot: KetikAssignmentSnapshot }
  | { type: "save-failed"; recipient: string; error: string };

export function assignmentReducer(
  state: AssignmentState,
  event: AssignmentEvent,
): AssignmentState {
  switch (event.type) {
    case "reload":
      return state.status === "saving"
        ? state
        : { ...INITIAL_ASSIGNMENT, recipient: state.recipient };
    case "loaded": {
      if (state.status !== "loading") return state;
      const recipient = event.users.some((user) => user.id === state.recipient)
        ? state.recipient
        : "";
      return {
        status: recipient ? "checking" : "choosing",
        source: event.source,
        users: event.users,
        recipient,
        snapshot: null,
        error: null,
      };
    }
    case "load-failed":
      return state.status === "loading"
        ? {
            ...state,
            status: "load-failed",
            error: "Data penugasan belum bisa dimuat. Coba muat ulang.",
          }
        : state;
    case "select":
      if (
        !state.source ||
        state.status === "saving" ||
        state.recipient === event.recipient ||
        !state.users.some((user) => user.id === event.recipient)
      )
        return state;
      return {
        ...state,
        source: state.source,
        status: "checking",
        recipient: event.recipient,
        snapshot: null,
        error: null,
      };
    case "checked":
      return state.status === "checking" && state.recipient === event.recipient
        ? { ...state, status: "ready", snapshot: event.snapshot }
        : state;
    case "check-failed":
      return state.status === "checking" && state.recipient === event.recipient
        ? {
            ...state,
            status: "recipient-failed",
            snapshot: null,
            error:
              "Penugasan penerima belum bisa dimuat atau berada di luar akses Anda.",
          }
        : state;
    case "save":
      return state.status === "ready" ? { ...state, status: "saving" } : state;
    case "saved":
      return state.status === "saving" && state.recipient === event.recipient
        ? { ...state, status: "success", snapshot: event.snapshot }
        : state;
    case "save-failed":
      return state.status === "saving" && state.recipient === event.recipient
        ? {
            ...state,
            status: "save-failed",
            snapshot: null,
            error: event.error,
          }
        : state;
  }
}
