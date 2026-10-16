import type { PdktHistoryConfig } from "@trainers/types";

type WithoutExpectedAnswer<T> = T extends object
  ? Omit<T, "expectedAnswer" | "ojkRequestInBody">
  : T;

type SimulationConfig<T> = T extends { scenarios: Array<infer Scenario> }
  ? Omit<T, "scenarios"> & { scenarios: Array<WithoutExpectedAnswer<Scenario>> }
  : T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep evaluation-only scenario references out of simulation-facing views. */
export function toPdktSimulationScenario<T>(
  scenario: T,
): WithoutExpectedAnswer<T> {
  if (!isRecord(scenario)) return scenario as WithoutExpectedAnswer<T>;
  const {
    expectedAnswer: _expectedAnswer,
    ojkRequestInBody: _ojkRequestInBody,
    ...simulationScenario
  } = scenario;
  return simulationScenario as WithoutExpectedAnswer<T>;
}

type SimulationEmail<T> = T extends object
  ? Omit<T, "recipientContext" | "attachmentDiagnostics">
  : T;

/**
 * Keep the reply direction a test: consumer emails shown in the simulation
 * carry no recipient address or recipient context. Agent replies keep `to`,
 * which is the consumer the participant answered.
 */
export function toPdktSimulationEmail<T>(email: T): SimulationEmail<T> {
  if (!isRecord(email)) return email as SimulationEmail<T>;
  const {
    recipientContext: _recipientContext,
    attachmentDiagnostics: _attachmentDiagnostics,
    ...simulationEmail
  } = email;
  if (simulationEmail.isAgent === true) {
    return simulationEmail as SimulationEmail<T>;
  }
  return { ...simulationEmail, to: "" } as SimulationEmail<T>;
}

/** Keep evaluation-only references private when stored config snapshots are read by the UI. */
export function toPdktSimulationConfig<T>(config: T): SimulationConfig<T> {
  if (!isRecord(config) || !Array.isArray(config.scenarios))
    return config as SimulationConfig<T>;
  return {
    ...config,
    scenarios: config.scenarios.map(toPdktSimulationScenario),
  } as SimulationConfig<T>;
}

/** A trainee replay has no need for the evaluator's scenario/persona settings. */
export function toPdktHistoryConfig(config: unknown): PdktHistoryConfig | null {
  if (!isRecord(config)) return null;
  const projected: PdktHistoryConfig = {
    scenarios: Array.isArray(config.scenarios)
      ? config.scenarios.flatMap((scenario) =>
          isRecord(scenario) && typeof scenario.id === "string"
            ? [{ id: scenario.id }]
            : [],
        )
      : [],
  };
  const identity = config.identity;
  if (
    isRecord(identity) &&
    typeof identity.name === "string" &&
    typeof identity.email === "string" &&
    typeof identity.city === "string" &&
    typeof identity.bodyName === "string"
  ) {
    projected.identity = {
      name: identity.name,
      email: identity.email,
      city: identity.city,
      bodyName: identity.bodyName,
    };
  }
  if (
    config.writingStyleMode === "realistic" ||
    config.writingStyleMode === "training"
  )
    projected.writingStyleMode = config.writingStyleMode;
  return projected;
}
