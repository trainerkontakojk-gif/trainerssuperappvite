import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Telefun schema contract", () => {
  it("declares every telefun_history column written by the API", () => {
    const migrationsDir = join(process.cwd(), "../../supabase/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
      .join("\n");

    for (const column of [
      "recording_path",
      "agent_recording_path",
      "session_metrics",
      "voice_dashboard_metrics",
      "disruption_results",
      "persona_config",
      "realistic_mode_enabled",
      "score",
      "feedback",
    ]) {
      expect(sql.toLowerCase()).toContain(column);
    }
  });
});
