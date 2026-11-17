export type ScenarioEditorLifecycle = {
  generation: number;
  pendingReads: number;
};

export type ScenarioEditorEvent =
  | { type: "reset" }
  | { type: "read-start" | "read-finish"; generation: number };

export function scenarioEditorReducer(
  state: ScenarioEditorLifecycle,
  event: ScenarioEditorEvent,
): ScenarioEditorLifecycle {
  switch (event.type) {
    case "reset":
      return { generation: state.generation + 1, pendingReads: 0 };
    case "read-start":
      if (state.generation !== event.generation) return state;
      return { ...state, pendingReads: state.pendingReads + 1 };
    case "read-finish":
      if (state.generation !== event.generation) return state;
      return { ...state, pendingReads: Math.max(0, state.pendingReads - 1) };
  }
}
