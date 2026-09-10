import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  simulationSubjectSnapshotSchema,
  type PdktMailboxBatch,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import { env } from "../../lib/env";

const RETRY_TOKEN_VERSION = 1 as const;
const RETRY_TOKEN_TTL_MS = 30 * 60 * 1000;

type RetryEnvelope = {
  version: typeof RETRY_TOKEN_VERSION;
  actorId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  batch: PdktMailboxBatch;
  simulationSubjectSnapshot: SimulationSubjectSnapshot;
};

export type PdktMailboxRetryDraft = {
  token: string;
  batch: PdktMailboxBatch;
  simulationSubjectSnapshot: SimulationSubjectSnapshot;
};

export class PdktMailboxRetryError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409,
    public readonly code: "VALIDATION_ERROR" | "FORBIDDEN" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PdktMailboxRetryError";
  }
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY)
    .update(payload)
    .digest("base64url");
}

function hasValidSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertSubjectMatchesBatch(
  batch: PdktMailboxBatch,
  snapshot: SimulationSubjectSnapshot,
): void {
  const selection = batch.simulationSubject ?? { type: "self" as const };
  if (snapshot.type === "participant") {
    if (
      selection.type !== "participant" ||
      selection.participantId !== snapshot.participantId
    ) {
      throw new PdktMailboxRetryError(
        400,
        "VALIDATION_ERROR",
        "Draft retry memiliki target simulasi yang tidak valid.",
      );
    }
    return;
  }

  if (snapshot.type === "self" && selection.type !== "self") {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry memiliki target simulasi yang tidak valid.",
    );
  }
  if (snapshot.type === "unknown") {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak memiliki target simulasi yang valid.",
    );
  }
}

function parseDraft(envelope: unknown, actorId: string): PdktMailboxRetryDraft {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak valid atau sudah kedaluwarsa.",
    );
  }

  const value = envelope as Partial<RetryEnvelope>;
  if (value.version !== RETRY_TOKEN_VERSION) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Versi draft retry tidak didukung.",
    );
  }
  if (value.actorId !== actorId) {
    throw new PdktMailboxRetryError(
      403,
      "FORBIDDEN",
      "Draft retry bukan milik akun ini.",
    );
  }
  if (
    typeof value.expiresAt !== "number" ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= Date.now()
  ) {
    throw new PdktMailboxRetryError(
      409,
      "CONFLICT",
      "Draft retry sudah kedaluwarsa. Buat sesi baru untuk mencoba lagi.",
    );
  }

  const parsedSnapshot = simulationSubjectSnapshotSchema.safeParse(
    value.simulationSubjectSnapshot,
  );
  const batch = value.batch;
  if (
    !batch ||
    typeof batch !== "object" ||
    Array.isArray(batch) ||
    !parsedSnapshot.success
  ) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Isi draft retry tidak valid.",
    );
  }

  // The envelope is signed by this backend. Keep the generated payload intact
  // (including optional fields/defaults) instead of normalizing it a second
  // time during retry verification.
  assertSubjectMatchesBatch(batch as PdktMailboxBatch, parsedSnapshot.data);
  return {
    token: "",
    batch: batch as PdktMailboxBatch,
    simulationSubjectSnapshot: parsedSnapshot.data,
  };
}

export function createPdktMailboxRetryDraft(params: {
  actorId: string;
  batch: PdktMailboxBatch;
  simulationSubjectSnapshot: SimulationSubjectSnapshot;
  now?: number;
}): PdktMailboxRetryDraft {
  if (!params.actorId.trim()) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Aktor draft retry tidak valid.",
    );
  }

  const parsedSnapshot = simulationSubjectSnapshotSchema.safeParse(
    params.simulationSubjectSnapshot,
  );
  if (!parsedSnapshot.success) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Isi draft retry tidak valid.",
    );
  }
  assertSubjectMatchesBatch(params.batch, parsedSnapshot.data);

  const issuedAt = params.now ?? Date.now();
  const envelope: RetryEnvelope = {
    version: RETRY_TOKEN_VERSION,
    actorId: params.actorId,
    issuedAt,
    expiresAt: issuedAt + RETRY_TOKEN_TTL_MS,
    nonce: randomUUID(),
    batch: params.batch,
    simulationSubjectSnapshot: parsedSnapshot.data,
  };
  const encodedPayload = encode(JSON.stringify(envelope));
  const token = `${encodedPayload}.${sign(encodedPayload)}`;

  return {
    token,
    batch: params.batch,
    simulationSubjectSnapshot: parsedSnapshot.data,
  };
}

export function verifyPdktMailboxRetryToken(
  token: string,
  actorId: string,
): PdktMailboxRetryDraft {
  if (typeof token !== "string" || token.length === 0) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak valid atau sudah kedaluwarsa.",
    );
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak valid atau sudah kedaluwarsa.",
    );
  }
  const encodedPayload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!hasValidSignature(encodedPayload, signature)) {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak valid atau sudah kedaluwarsa.",
    );
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(decode(encodedPayload));
  } catch {
    throw new PdktMailboxRetryError(
      400,
      "VALIDATION_ERROR",
      "Draft retry tidak valid atau sudah kedaluwarsa.",
    );
  }

  return parseDraft(envelope, actorId);
}

// Generated attachments can be larger than prompt text. Keep a bounded but
// practical request ceiling for the opaque retry payload.
export const PDKT_MAILBOX_RETRY_TOKEN_MAX_LENGTH = 5_000_000;
