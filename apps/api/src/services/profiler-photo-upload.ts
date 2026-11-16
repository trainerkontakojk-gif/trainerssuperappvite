import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "../lib/supabase";
import { PROFILER_PHOTO_BUCKET } from "./profiler-photo-storage";

/** Matches the bucket limits in migration 20260604100000_restore_profiler_foto_bucket.sql. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_FORMATS: Record<string, { sharp: string; ext: string }> = {
  "image/jpeg": { sharp: "jpeg", ext: "jpg" },
  "image/png": { sharp: "png", ext: "png" },
  "image/webp": { sharp: "webp", ext: "webp" },
  "image/gif": { sharp: "gif", ext: "gif" },
};
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i;
const INVALID_PHOTO_MESSAGE =
  "Foto harus berupa gambar JPEG, PNG, WebP, atau GIF.";

export class ProfilerPhotoValidationError extends Error {
  constructor(message = INVALID_PHOTO_MESSAGE) {
    super(message);
    this.name = "ProfilerPhotoValidationError";
  }
}

export class ProfilerPhotoUploadError extends Error {
  constructor(cause: unknown) {
    super("Foto peserta gagal diunggah. Silakan coba lagi.", { cause });
    this.name = "ProfilerPhotoUploadError";
  }
}

async function parsePhotoDataUrl(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl);
  const mime = match?.[1].toLowerCase() ?? "";
  const format = PHOTO_FORMATS[mime];
  if (!match || !format) throw new ProfilerPhotoValidationError();

  const encoded = match[2];
  // Reject by encoded length first so an oversized body is never decoded.
  if (encoded.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4)
    throw new ProfilerPhotoValidationError("Ukuran foto maksimal 5 MB.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_PHOTO_BYTES)
    throw new ProfilerPhotoValidationError("Ukuran foto maksimal 5 MB.");
  if (
    encoded.length % 4 !== 0 ||
    bytes.length === 0 ||
    bytes.toString("base64") !== encoded
  )
    throw new ProfilerPhotoValidationError();

  // The declared type must match what the bytes actually are.
  const detected = await sharp(bytes)
    .metadata()
    .then(
      (meta) => meta.format,
      () => undefined,
    );
  if (detected !== format.sharp) throw new ProfilerPhotoValidationError();
  return { bytes, mime, ext: format.ext };
}

/**
 * Stores the photo unchanged at `<peserta id>/<timestamp>-<uuid>.<ext>` and
 * returns its public URL. The add form uploads before the peserta row exists,
 * so the id is a path namespace, not an existence check. Service role is used
 * only for this Storage write.
 */
export async function uploadProfilerPhoto(
  pesertaId: string,
  dataUrl: string,
): Promise<string> {
  const { bytes, mime, ext } = await parsePhotoDataUrl(dataUrl);
  const path = `${pesertaId}/${Date.now()}-${randomUUID()}.${ext}`;
  const bucket = createAdminClient().storage.from(PROFILER_PHOTO_BUCKET);
  const { error } = await bucket.upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new ProfilerPhotoUploadError(error);
  return bucket.getPublicUrl(path).data.publicUrl;
}
