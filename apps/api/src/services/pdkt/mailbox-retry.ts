import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  simulationSubjectSnapshotSchema,
  type PdktMailboxBatch,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import { env } from "../../lib/env";

const LEGACY_RETRY_TOKEN_VERSION = 1 as const;
const RETRY_TOKEN_VERSION = 2 as const;
const RETRY_TOKEN_PREFIX = "v2";
const RETRY_TOKEN_AAD = Buffer.from("trainerssuperapp:pdkt-mailbox-retry:v2");
const RETRY_TOKEN_TTL_MS = 30 * 60 * 1000;

type RetryEnvelopeFields = {
  actorId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  batch: PdktMailboxBatch;
  simulationSubjectSnapshot: SimulationSubjectSnapshot;
};

type RetryEnvelope = RetryEnvelopeFields & {
  version: typeof RETRY_TOKEN_VERSION;
};

type LegacyRetryEnvelope = RetryEnvelopeFields & {
  version: typeof LEGACY_RETRY_TOKEN_VERSION;
};

type AnyRetryEnvelope = RetryEnvelope | LegacyRetryEnvelope;

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

function deriveEncryptionKey(): Buffer {
  return createHash("sha256")
    .update("trainerssuperapp:pdkt-mailbox-retry-encryption:v2\0")
    .update(env.SUPABASE_SERVICE_ROLE_KEY)
    .digest();
}

function decodeBase64Url(value: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Invalid base64url value.");
  }
  return decoded;
}

function encrypt(payload: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  cipher.setAAD(RETRY_TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    RETRY_TOKEN_PREFIX,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

function decrypt(token: string): string {
  const [prefix, encodedIv, encodedCiphertext, encodedTag, extra] =
    token.split(".");
  if (
    prefix !== RETRY_TOKEN_PREFIX ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedTag ||
    extra !== undefined
  ) {
    throw new Error("Invalid encrypted retry token.");
  }

  const iv = decodeBase64Url(encodedIv);
  const ciphertext = decodeBase64Url(encodedCiphertext);
  const tag = decodeBase64Url(encodedTag);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted retry token.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    iv,
  );
  decipher.setAAD(RETRY_TOKEN_AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
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

  const value = envelope as Partial<AnyRetryEnvelope>;
  if (
    value.version !== RETRY_TOKEN_VERSION &&
    value.version !== LEGACY_RETRY_TOKEN_VERSION
  ) {
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

  // The envelope is authenticated by this backend. Keep the generated payload
  // intact (including optional fields/defaults) instead of normalizing it a
  // second time during retry verification.
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
  const token = encrypt(JSON.stringify(envelope));

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

  let envelope: unknown;
  try {
    if (token.startsWith(`${RETRY_TOKEN_PREFIX}.`)) {
      envelope = JSON.parse(decrypt(token));
    } else {
      const separator = token.lastIndexOf(".");
      if (separator <= 0 || separator === token.length - 1) {
        throw new Error("Invalid legacy retry token.");
      }
      const encodedPayload = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      if (!hasValidSignature(encodedPayload, signature)) {
        throw new Error("Invalid legacy retry token.");
      }
      envelope = JSON.parse(decode(encodedPayload));
    }
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
