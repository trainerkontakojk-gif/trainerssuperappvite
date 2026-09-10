import { describe, expect, it } from "vitest";
import {
  createPdktMailboxRetryDraft,
  verifyPdktMailboxRetryToken,
} from "../services/pdkt/mailbox-retry";

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
  it("rejects a token whose signed payload or signature was modified", () => {
    const draft = makeDraft();
    const last = draft.token.at(-1);
    const tampered = `${draft.token.slice(0, -1)}${last === "A" ? "B" : "A"}`;

    expect(() => verifyPdktMailboxRetryToken(tampered, "actor-a")).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
      }),
    );
  });

  it("rejects a validly signed token when another actor presents it", () => {
    const draft = makeDraft();

    expect(() => verifyPdktMailboxRetryToken(draft.token, "actor-b")).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "FORBIDDEN",
      }),
    );
  });

  it("rejects a correctly signed token after its expiry", () => {
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
