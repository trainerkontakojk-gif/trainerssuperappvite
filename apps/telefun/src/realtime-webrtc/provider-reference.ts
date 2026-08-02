import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const SAFE_CALL_ID = /^rtc_[A-Za-z0-9_-]{1,128}$/;

function keyFromSecret(secret: string): Buffer {
  const normalized = secret.trim();
  if (!normalized) throw new Error("provider reference key is unavailable");
  return createHash("sha256").update(normalized, "utf8").digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function encryptProviderCallReference(
  callId: string,
  secret: string,
): string {
  if (!SAFE_CALL_ID.test(callId))
    throw new Error("provider reference is invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(callId, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    encode(iv),
    encode(cipher.getAuthTag()),
    encode(ciphertext),
  ].join(":");
}

export function decryptProviderCallReference(
  encrypted: string,
  secret: string,
): string | null {
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    const iv = decode(parts[1]!);
    const tag = decode(parts[2]!);
    const ciphertext = decode(parts[3]!);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0)
      return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
    decipher.setAuthTag(tag);
    const callId = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return SAFE_CALL_ID.test(callId) ? callId : null;
  } catch {
    return null;
  }
}
