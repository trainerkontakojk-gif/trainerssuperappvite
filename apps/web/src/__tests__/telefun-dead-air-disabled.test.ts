import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(
  join(__dirname, "../routes/telefun/services/geminiService.ts"),
  "utf8",
);

describe("Telefun client dead-air detector", () => {
  it("does not keep client-side dead-air timer constants", () => {
    expect(serviceSource).not.toContain("DEAD_AIR_THRESHOLD_MS");
    expect(serviceSource).not.toContain("DEAD_AIR_COOLDOWN_MS");
    expect(serviceSource).not.toContain("deadAirSilenceMs");
    expect(serviceSource).not.toContain("deadAirLastPromptMs");
  });

  it("does not send automatic DEAD AIR prompts from client silence detection", () => {
    expect(serviceSource).not.toContain("sendDeadAirPrompt()");
    expect(serviceSource).not.toContain("[INSTRUKSI SISTEM - DEAD AIR]");
    expect(serviceSource).not.toContain("dead_air_prompt_sent");
  });
});
