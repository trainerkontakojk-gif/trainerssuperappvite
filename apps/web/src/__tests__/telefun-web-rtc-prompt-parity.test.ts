import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingSource = readFileSync(
  join(__dirname, "../routes/telefun/index.tsx"),
  "utf8",
);

const startCallSource = landingSource.slice(
  landingSource.indexOf("  const startCall = async () =>"),
  landingSource.indexOf("  const handleEndCall", landingSource.indexOf("  const startCall = async () =>")),
);

describe("Telefun WebRTC prompt parity wiring", () => {
  it("builds the live prompt from the finalized session config", () => {
    expect(landingSource).toContain(
      'import { buildTelefunLiveSystemInstruction } from "./services/promptBuilder";',
    );
    expect(startCallSource).toContain(
      "buildTelefunLiveSystemInstruction({",
    );
    expect(startCallSource).toContain("identity: sessionConfig.resolvedIdentity!");
    expect(startCallSource).toContain("scenario: sessionConfig.activeScenario!");
    expect(startCallSource).toContain(
      "consumerType: sessionConfig.activeConsumerType!",
    );
    expect(startCallSource).toContain(
      "responsePacingMode: sessionConfig.responsePacingMode",
    );
    expect(startCallSource).toContain(
      "simulationChallengeTypes: sessionConfig.simulationChallengeTypes",
    );
  });

  it("sends the snapshot only for the WebRTC create-session payload", () => {
    const promptBuild = startCallSource.indexOf(
      "buildTelefunLiveSystemInstruction({",
    );
    const createSession = startCallSource.indexOf("createTelefunSession({");
    const promptProperty = startCallSource.indexOf(
      "live_prompt_instructions:",
      createSession,
    );

    expect(promptBuild).toBeGreaterThanOrEqual(0);
    expect(createSession).toBeGreaterThan(promptBuild);
    expect(promptProperty).toBeGreaterThan(createSession);
    expect(startCallSource).toContain("if (requestsWebRtc)");
  });
});
