import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPdktMailboxRetryDraft,
  verifyPdktMailboxRetryToken,
} from "../services/pdkt/mailbox-retry";
import { env } from "../lib/env";

const PARTICIPANT_ID = "123e4567-e89b-12d3-a456-426614174000";
const SNAPSHOT = {
  type: "participant" as const,
  participantId: PARTICIPANT_ID,
  displayName: "Andi",
  batchName: "Batch 12",
  team: "Tim Alpha",
};
const BATCH = {
  client_request_id: "retry-security-001",
  simulationSubject: {
    type: "participant" as const,
    participantId: PARTICIPANT_ID,
  },
  inbound_email: {
    id: "mail-1",
    from: "andi@example.com",
    to: "trainer@example.com",
    subject: "Simulasi",
    body: "Isi email simulasi",
    timestamp: "2026-09-10T00:00:00.000Z",
    isAgent: false,
  },
} as any;

function makeDraft(now?: number) {
  return createPdktMailboxRetryDraft({
    actorId: "actor-a",
    batch: BATCH,
    simulationSubjectSnapshot: SNAPSHOT,
    now,
  });
}

describe("PDKT mailbox retry token security", () => {
  it.each(["ciphertext", "authentication tag"] as const)(
    "rejects an encrypted retry token when its %s is modified",
    (segment) => {
      const draft = makeDraft();
      const parts = draft.token.split(".");
      const index = segment === "ciphertext" ? 2 : 3;
      const firstCharacter = parts[index]?.[0];
      parts[index] = `${firstCharacter === "A" ? "B" : "A"}${parts[index]?.slice(1)}`;

      expect(() =>
        verifyPdktMailboxRetryToken(parts.join("."), "actor-a"),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          code: "VALIDATION_ERROR",
        }),
      );
    },
  );

  it("rejects an authenticated token when another actor presents it", () => {
    const draft = makeDraft();

    expect(() => verifyPdktMailboxRetryToken(draft.token, "actor-b")).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "FORBIDDEN",
      }),
    );
  });

  it("encrypts retry data without losing the evaluation reference", () => {
    const expectedAnswer = "Sampaikan nomor laporan kepada konsumen.";
    const scenario = {
      id: "expected-answer",
      category: "Umum",
      title: "Status laporan",
      description: "Konsumen menanyakan status laporan.",
      expectedAnswer,
      isActive: true,
    };
    const draft = createPdktMailboxRetryDraft({
      actorId: "actor-a",
      batch: {
        ...BATCH,
        scenario_snapshot: scenario,
        config_snapshot: { scenarios: [scenario] },
      },
      simulationSubjectSnapshot: SNAPSHOT,
    });

    expect(draft.token).toMatch(/^v2\./);
    expect(draft.token).not.toContain(expectedAnswer);
    const [, , ciphertext] = draft.token.split(".");
    expect(() =>
      JSON.parse(Buffer.from(ciphertext, "base64url").toString()),
    ).toThrow();

    const verified = verifyPdktMailboxRetryToken(draft.token, "actor-a");
    expect(verified.batch.scenario_snapshot.expectedAnswer).toBe(expectedAnswer);
    expect(verified.batch.config_snapshot.scenarios[0].expectedAnswer).toBe(
      expectedAnswer,
    );
  });

  it("continues to accept unexpired legacy signed retry tokens", () => {
    const now = Date.now();
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        actorId: "actor-a",
        issuedAt: now,
        expiresAt: now + 60_000,
        nonce: "legacy-retry",
        batch: BATCH,
        simulationSubjectSnapshot: SNAPSHOT,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY)
      .update(payload)
      .digest("base64url");

    const verified = verifyPdktMailboxRetryToken(
      `${payload}.${signature}`,
      "actor-a",
    );
    expect(verified.batch).toEqual(BATCH);
  });

  it("rejects an encrypted token after its expiry", () => {
    const expiredAt = Date.now() - 31 * 60 * 1000;
    const draft = makeDraft(expiredAt);

    expect(() => verifyPdktMailboxRetryToken(draft.token, "actor-a")).toThrowError(
      expect.objectContaining({
        status: 409,
        code: "CONFLICT",
      }),
    );
  });
});
