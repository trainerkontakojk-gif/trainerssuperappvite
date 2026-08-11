import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingSource = readFileSync(
  join(__dirname, "../routes/telefun/index.tsx"),
  "utf8",
);

const startCallOnceSource = landingSource.slice(
  landingSource.indexOf("  const startCallOnce = async () =>"),
  landingSource.indexOf(
    "  const startCall = async () =>",
    landingSource.indexOf("  const startCallOnce = async () =>"),
  ),
);

describe("Telefun WebRTC prompt parity wiring", () => {
  it("builds the live prompt from the finalized session config", () => {
    expect(landingSource).toContain(
      'import { buildTelefunLiveSystemInstruction } from "./services/promptBuilder";',
    );
    expect(startCallOnceSource).toContain(
      "buildTelefunLiveSystemInstruction({",
    );
    expect(startCallOnceSource).toContain(
      "identity: sessionConfig.resolvedIdentity!",
    );
    expect(startCallOnceSource).toContain(
      "scenario: sessionConfig.activeScenario!",
    );
    expect(startCallOnceSource).toContain(
      "consumerType: sessionConfig.activeConsumerType!",
    );
    expect(startCallOnceSource).toContain(
      "responsePacingMode: sessionConfig.responsePacingMode",
    );
    expect(startCallOnceSource).toContain(
      "simulationChallengeTypes: sessionConfig.simulationChallengeTypes",
    );
  });

  it("sends the snapshot only for the WebRTC create-session payload", () => {
    const promptBuild = startCallOnceSource.indexOf(
      "buildTelefunLiveSystemInstruction({",
    );
    const createSession = startCallOnceSource.indexOf("createTelefunSession({");
    const promptProperty = startCallOnceSource.indexOf(
      "live_prompt_instructions:",
      createSession,
    );

    expect(promptBuild).toBeGreaterThanOrEqual(0);
    expect(createSession).toBeGreaterThan(promptBuild);
    expect(promptProperty).toBeGreaterThan(createSession);
    expect(startCallOnceSource).toContain("if (requestsWebRtc)");
  });
});
