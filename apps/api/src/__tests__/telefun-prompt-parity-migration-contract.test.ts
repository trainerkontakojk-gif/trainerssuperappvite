import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTelefunSessionInsertPayload,
  telefunSessionCreatePayloadSchema,
} from "../routes/telefun/sessions";

const migrationName =
  "20260810100000_telefun_openai_webrtc_prompt_parity.sql";

function readMigration(): string {
  return readFileSync(
    join(process.cwd(), "../../supabase/migrations", migrationName),
    "utf8",
  );
}

const base = {
  scenario_title: "Tagihan kartu kredit",
  consumer_name: "Hendra Wijaya",
};

describe("Telefun WebRTC prompt parity contract", () => {
  it("accepts and persists a nonblank bounded prompt", () => {
    const instructions = "Sampaikan keluhan tentang tagihan kartu kredit.";
    const parsed = telefunSessionCreatePayloadSchema.safeParse({
      ...base,
      live_prompt_instructions: instructions,
    });

    expect(parsed.success).toBe(true);
    expect(
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: parsed.success ? parsed.data : { ...base },
      }),
    ).toMatchObject({ live_prompt_instructions: instructions });
  });

  it("keeps legacy requests backward compatible with a NULL snapshot", () => {
    expect(telefunSessionCreatePayloadSchema.safeParse(base).success).toBe(true);
    expect(
      buildTelefunSessionInsertPayload({ userId: "user-1", body: base }),
    ).toMatchObject({ live_prompt_instructions: null });
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        live_prompt_instructions: null,
      }).success,
    ).toBe(true);
  });

  it("retires OpenAI WebRTC before prompt snapshot validation", () => {
    const webRtcBase = {
      ...base,
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
    };

    // Parsing stays permissive so the route can return the stable public
    // TELEFUN_OPENAI_DISABLED shape before persistence.
    expect(
      telefunSessionCreatePayloadSchema.safeParse(webRtcBase).success,
    ).toBe(true);
    expect(() =>
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: webRtcBase,
      }),
    ).toThrow("OpenAI Realtime tidak tersedia untuk Telefun");
  });

  it.each(["", "   ", "\n\t"]) (
    "rejects a blank prompt %j",
    (live_prompt_instructions) => {
      expect(
        telefunSessionCreatePayloadSchema.safeParse({
          ...base,
          live_prompt_instructions,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a prompt over the canonical 16,000 character cap", () => {
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        live_prompt_instructions: "x".repeat(16_001),
      }).success,
    ).toBe(false);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        live_prompt_instructions: "x".repeat(16_000),
      }).success,
    ).toBe(true);
  });

  it("uses an additive nullable column and an idempotent bounded constraint", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS live_prompt_instructions TEXT NULL DEFAULT NULL",
    );
    expect(sql).toContain("telefun_history_live_prompt_instructions_check");
    expect(sql).toMatch(
      /live_prompt_instructions\s+IS NULL\s+OR\s+char_length\(btrim\(live_prompt_instructions\)\) BETWEEN 1 AND 16000/i,
    );
    expect(sql).toContain("pg_constraint");
    expect(sql).not.toContain("GRANT");
  });
});
