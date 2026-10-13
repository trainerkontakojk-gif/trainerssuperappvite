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

type SimulationEmail<T> = T extends object ? Omit<T, "recipientContext"> : T;

/**
 * Keep the reply direction a test: consumer emails shown in the simulation
 * carry no recipient address or recipient context. Agent replies keep `to`,
 * which is the consumer the participant answered.
 */
export function toPdktSimulationEmail<T>(email: T): SimulationEmail<T> {
  if (!isRecord(email)) return email as SimulationEmail<T>;
  const { recipientContext: _recipientContext, ...simulationEmail } = email;
  if (simulationEmail.isAgent === true) {
    return simulationEmail as SimulationEmail<T>;
  }
  return { ...simulationEmail, to: "" } as SimulationEmail<T>;
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
