import type {
  KetikHistorySummaryItem,
  KetikSessionHistoryItem,
} from "@trainers/types";

export type DeleteTarget =
  { kind: "one"; session: KetikHistorySummaryItem } | { kind: "all" };
type ReplayState =
  | { status: "idle"; request: number }
  | { status: "loading" | "failed"; request: number; id: string }
  | {
      status: "ready";
      request: number;
      id: string;
      session: KetikSessionHistoryItem;
    };
type DeleteState =
  | { status: "idle" }
  | { status: "confirming" | "failed" | "closed"; target: DeleteTarget }
  | { status: "deleting"; target: DeleteTarget; request: number };
export interface HistoryActionState {
  replay: ReplayState;
  deletion: DeleteState;
}
export const INITIAL_HISTORY_ACTIONS: HistoryActionState = {
  replay: { status: "idle", request: 0 },
  deletion: { status: "idle" },
};
export type HistoryActionEvent =
  | { type: "reset" }
  | { type: "replay-load"; request: number; id: string }
  | { type: "replay-loaded"; request: number; session: KetikSessionHistoryItem }
  | { type: "replay-failed"; request: number }
  | { type: "replay-close" }
  | { type: "delete-ask"; target: DeleteTarget }
  | { type: "delete-cancel" }
  | { type: "delete-start"; request: number }
  | { type: "delete-done" | "delete-failed"; request: number };

export function historyActionReducer(
  state: HistoryActionState,
  event: HistoryActionEvent,
): HistoryActionState {
  switch (event.type) {
    case "reset":
      return INITIAL_HISTORY_ACTIONS;
    case "replay-load":
      return {
        ...state,
        replay: { status: "loading", id: event.id, request: event.request },
      };
    case "replay-loaded":
      return state.replay.status === "loading" &&
        state.replay.request === event.request
        ? {
            ...state,
            replay: {
              ...state.replay,
              status: "ready",
              session: event.session,
            },
          }
        : state;
    case "replay-failed":
      return state.replay.status === "loading" &&
        state.replay.request === event.request
        ? { ...state, replay: { ...state.replay, status: "failed" } }
        : state;
    case "replay-close":
      return {
        ...state,
        replay: { status: "idle", request: state.replay.request },
      };
    case "delete-ask":
      return state.deletion.status === "deleting"
        ? state
        : {
            ...state,
            deletion: { status: "confirming", target: event.target },
          };
    case "delete-cancel":
      return state.deletion.status === "confirming" ||
        state.deletion.status === "failed"
        ? {
            ...state,
            deletion: { status: "closed", target: state.deletion.target },
          }
        : state;
    case "delete-start":
      return state.deletion.status === "confirming" ||
        state.deletion.status === "failed"
        ? {
            ...state,
            deletion: {
              status: "deleting",
              target: state.deletion.target,
              request: event.request,
            },
          }
        : state;
    case "delete-done":
    case "delete-failed":
      return state.deletion.status === "deleting" &&
        state.deletion.request === event.request
        ? {
            ...state,
            deletion: {
              status: event.type === "delete-done" ? "closed" : "failed",
              target: state.deletion.target,
            },
          }
        : state;
  }
}

type ExportState =
  | { status: "idle" | "failed" }
  | { status: "exporting"; progress: number; request: number };
export type ExportEvent =
  | { type: "reset" }
  | { type: "start"; request: number }
  | { type: "progress"; request: number; count: number }
  | { type: "done" | "failed"; request: number };
export function historyExportReducer(
  state: ExportState,
  event: ExportEvent,
): ExportState {
  switch (event.type) {
    case "reset":
      return { status: "idle" };
    case "start":
      return state.status === "exporting"
        ? state
        : { status: "exporting", progress: 0, request: event.request };
    case "progress":
      return state.status === "exporting" && state.request === event.request
        ? { ...state, progress: event.count }
        : state;
    case "done":
    case "failed":
      return state.status === "exporting" && state.request === event.request
        ? { status: event.type === "done" ? "idle" : "failed" }
        : state;
  }
}
