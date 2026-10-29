import { createHash } from "node:crypto";
import { TRAINER_ACTIVITY_MAX_IMAGE_BYTES } from "@trainers/types";
import { createAdminClient } from "./supabase";
import { env } from "./env";

export const TRAINER_ACTIVITY_MEDIA_BUCKET = "trainer-activity-media";
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
const DATA_URL =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/i;

export class TrainerActivityMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainerActivityMediaValidationError";
  }
}

export class TrainerActivityMediaUploadError extends Error {
  constructor(cause: unknown) {
    super("Gambar kegiatan gagal diunggah. Silakan coba lagi.", { cause });
    this.name = "TrainerActivityMediaUploadError";
  }
}

function parseImageDataUrl(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl);
  if (!match)
    throw new TrainerActivityMediaValidationError(
      "Gambar harus PNG, JPEG, atau WebP dalam format data URL.",
    );

  const mime = match[1].toLowerCase() as keyof typeof EXTENSIONS;
  const encoded = match[2];
  const bytes = Buffer.from(encoded, "base64");
  if (
    encoded.length % 4 !== 0 ||
    bytes.length === 0 ||
    bytes.length > TRAINER_ACTIVITY_MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== encoded
  ) {
    throw new TrainerActivityMediaValidationError(
      bytes.length > TRAINER_ACTIVITY_MAX_IMAGE_BYTES
        ? "Ukuran gambar maksimal 5 MB."
        : "Gambar tidak valid. Unggah PNG, JPEG, atau WebP.",
    );
  }
  return { mime, bytes };
}

/** Uses service role only for the Storage upload; table writes stay user-scoped. */
export async function uploadTrainerActivityImage(dataUrl: string) {
  const { mime, bytes } = parseImageDataUrl(dataUrl);
  const path = `${createHash("sha256").update(bytes).digest("hex")}.${EXTENSIONS[mime]}`;
  const bucket = createAdminClient().storage.from(
    TRAINER_ACTIVITY_MEDIA_BUCKET,
  );
  const { error } = await bucket.upload(path, bytes, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/exists|duplicate/i.test(error.message))
    throw new TrainerActivityMediaUploadError(error);
  return bucket.getPublicUrl(path).data.publicUrl;
}

export function isTrainerActivityImageUrl(value: string): boolean {
  try {
    const candidate = new URL(value);
    const supabase = new URL(env.VITE_SUPABASE_URL);
    const prefix = `/storage/v1/object/public/${TRAINER_ACTIVITY_MEDIA_BUCKET}/`;
    return (
      candidate.origin === supabase.origin &&
      candidate.pathname.startsWith(prefix) &&
      candidate.pathname.length > prefix.length
    );
  } catch {
    return false;
  }
}
