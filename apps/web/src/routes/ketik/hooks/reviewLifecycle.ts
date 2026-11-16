import type {
  KetikReviewDetail,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";

export type KetikReviewFailure = "review" | "result";
type ReviewPhase =
  | {
      phase: "idle" | "reviewing" | "loading-result";
      failure: null;
      review: null;
    }
  | { phase: "ready"; failure: null; review: KetikSessionReview }
  | { phase: "failed"; failure: KetikReviewFailure; review: null };
export type KetikReviewState = ReviewPhase & {
  typos: KetikTypoFinding[];
  resultSource: "current" | "previous-after-failure";
  queueStatus: "queued" | "processing" | null;
  polling: "ok" | "failed";
  rerunsLeft: number | null | undefined;
  rerunRefusal: string | null;
};
export type KetikReviewPhase = KetikReviewState["phase"];
export const INITIAL_REVIEW = {
  phase: "idle",
  failure: null,
  review: null,
  typos: [],
  resultSource: "current",
  queueStatus: null,
  polling: "ok",
  rerunsLeft: undefined,
  rerunRefusal: null,
} satisfies KetikReviewState;
type ReviewEvent =
  | {
      type: "reset";
      status?: "completed" | "processing" | "failed" | "pending";
    }
  | { type: "submit" }
  | { type: "load-result" }
  | { type: "result"; detail: KetikReviewDetail; previousKept: boolean }
  | { type: "failed"; failure: KetikReviewFailure }
  | { type: "poll-ok"; rerunsLeft: number | null | undefined }
  | { type: "poll-failed" }
  | { type: "queued"; status: "queued" | "processing" }
  | { type: "enqueue-ack"; status: "queued" | "processing" }
  | { type: "idle" }
  | { type: "rerun-refused"; message: string };

export function reviewReducer(
  state: KetikReviewState,
  event: ReviewEvent,
): KetikReviewState {
  switch (event.type) {
    case "reset":
      if (event.status === "failed")
        return { ...INITIAL_REVIEW, phase: "failed", failure: "review" };
      return {
        ...INITIAL_REVIEW,
        phase: event.status === "processing" ? "reviewing" : "idle",
      };
    case "submit":
      if (state.phase === "reviewing" || state.phase === "loading-result")
        return state;
      return {
        ...INITIAL_REVIEW,
        phase: "reviewing",
        rerunsLeft: state.rerunsLeft,
      };
    case "load-result":
      return {
        ...state,
        phase: "loading-result",
        failure: null,
        review: null,
        queueStatus: null,
      };
    case "result":
      return {
        ...state,
        phase: "ready",
        failure: null,
        review: event.detail.review,
        typos: event.detail.typos ?? [],
        queueStatus: null,
        resultSource: event.previousKept ? "previous-after-failure" : "current",
      };
    case "failed":
      return {
        ...state,
        phase: "failed",
        failure: event.failure,
        review: null,
        typos: [],
        queueStatus: null,
        resultSource: "current",
      };
    case "poll-ok":
      return { ...state, polling: "ok", rerunsLeft: event.rerunsLeft };
    case "poll-failed":
      return { ...state, polling: "failed" };
    case "queued":
      return {
        ...state,
        phase: "reviewing",
        failure: null,
        review: null,
        queueStatus: event.status,
      };
    case "enqueue-ack":
      // A delayed enqueue acknowledgement must not overwrite a published result.
      return state.phase === "reviewing"
        ? { ...state, queueStatus: event.status }
        : state;
    case "idle":
      return { ...INITIAL_REVIEW, rerunsLeft: state.rerunsLeft };
    case "rerun-refused":
      return { ...state, rerunsLeft: 0, rerunRefusal: event.message };
  }
}
