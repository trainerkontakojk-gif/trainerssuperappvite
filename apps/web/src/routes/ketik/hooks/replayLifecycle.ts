export interface PlaybackState {
  status: "closed" | "paused" | "playing" | "ended";
  index: number;
  count: number;
}
type PlaybackEvent =
  | { type: "open"; count: number }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "tick" }
  | { type: "step"; direction: -1 | 1 }
  | { type: "reset" };

export function playbackReducer(
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackState {
  switch (event.type) {
    case "open":
      return {
        status: event.count <= 1 ? "ended" : "paused",
        index: 0,
        count: event.count,
      };
    case "close":
      return { ...state, status: "closed" };
    case "toggle":
      if (state.status === "paused") return { ...state, status: "playing" };
      return state.status === "playing"
        ? { ...state, status: "paused" }
        : state;
    case "tick": {
      if (state.status !== "playing") return state;
      const index = Math.min(state.count - 1, state.index + 1);
      return {
        ...state,
        index,
        status: index === state.count - 1 ? "ended" : "playing",
      };
    }
    case "step": {
      if (state.status === "closed" || !state.count) return state;
      const index = Math.max(
        0,
        Math.min(state.count - 1, state.index + event.direction),
      );
      return {
        ...state,
        index,
        status:
          index === state.count - 1
            ? "ended"
            : state.status === "playing"
              ? "playing"
              : "paused",
      };
    }
    case "reset":
      return state.status === "closed"
        ? state
        : { ...state, index: 0, status: state.count <= 1 ? "ended" : "paused" };
  }
}
