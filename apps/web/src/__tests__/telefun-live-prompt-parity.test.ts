import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const liveSessionSource = readFileSync(
  join(__dirname, "../routes/telefun/services/liveSession.ts"),
  "utf8",
);

describe("Telefun live prompt parity wiring", () => {
  it("builds the live prompt from the finalized session config", () => {
    expect(liveSessionSource).toContain(
      'buildTelefunLiveSystemInstruction,',
    );
    expect(liveSessionSource).toContain("buildTelefunLiveSystemInstruction({");
    expect(liveSessionSource).toContain("identity: resolvedIdentity");
    expect(liveSessionSource).toContain(
      "this.config.activeScenario ?? this.config.scenarios[0]",
    );
    expect(liveSessionSource).toContain(
      "this.config.activeConsumerType ?? this.config.consumerTypes[0]",
    );
    expect(liveSessionSource).toContain(
      "this.config.responsePacingMode",
    );
    expect(liveSessionSource).toContain(
      "this.config.simulationChallengeTypes",
    );
  });

  it("injects the prompt into both the configure payload and the setup message", () => {
    const promptBuild = liveSessionSource.indexOf(
      "buildTelefunLiveSystemInstruction({",
    );
    const configureBuild = liveSessionSource.indexOf(
      "buildTelefunSessionConfigure({",
    );
    const setupBuild = liveSessionSource.indexOf(
      "buildTelefunLiveSetupMessage({",
    );

    expect(promptBuild).toBeGreaterThanOrEqual(0);
    expect(configureBuild).toBeGreaterThan(promptBuild);
    expect(setupBuild).toBeGreaterThan(configureBuild);
    expect(liveSessionSource).toContain("instructions: systemInstructionText");
    expect(liveSessionSource).toContain(
      "systemInstruction: systemInstructionText",
    );
  });
});
