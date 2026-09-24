type WithoutExpectedAnswer<T> = T extends object
  ? Omit<T, "expectedAnswer">
  : T;

type SimulationConfig<T> = T extends { scenarios: Array<infer Scenario> }
  ? Omit<T, "scenarios"> & {
      scenarios: Array<WithoutExpectedAnswer<Scenario>>;
    }
  : T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep evaluation-only scenario references out of simulation-facing views. */
export function toPdktSimulationScenario<T>(
  scenario: T,
): WithoutExpectedAnswer<T> {
  if (!isRecord(scenario)) return scenario as WithoutExpectedAnswer<T>;
  const { expectedAnswer: _expectedAnswer, ...simulationScenario } = scenario;
  return simulationScenario as WithoutExpectedAnswer<T>;
}

/** Keep evaluation-only references private when stored config snapshots are read by the UI. */
export function toPdktSimulationConfig<T>(config: T): SimulationConfig<T> {
  if (!isRecord(config) || !Array.isArray(config.scenarios)) {
    return config as SimulationConfig<T>;
  }

  return {
    ...config,
    scenarios: config.scenarios.map(toPdktSimulationScenario),
  } as SimulationConfig<T>;
}
