import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { TRAINER_ACTIVITY_MAX_IMAGE_BYTES } from "@trainers/types";
import { createAdminClient } from "./supabase";
import { env } from "./env";

export const TRAINER_ACTIVITY_MEDIA_BUCKET = "trainer-activity-media";
/** Cards render at most ~300 CSS px wide; 800 px covers them at 2x density. */
const STORED_IMAGE_MAX_WIDTH = 800;
const INVALID_IMAGE_MESSAGE =
  "Gambar tidak valid. Unggah PNG, JPEG, atau WebP.";
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
        : INVALID_IMAGE_MESSAGE,
    );
  }
  return bytes;
}

/** Orients, downsizes, and re-encodes as WebP; output carries no metadata. */
async function optimizeImage(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes)
      .autoOrient()
      .resize({ width: STORED_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new TrainerActivityMediaValidationError(INVALID_IMAGE_MESSAGE);
  }
}

async function storeOptimizedImage(client: SupabaseClient, bytes: Buffer) {
  const webp = await optimizeImage(bytes);
  const path = `${createHash("sha256").update(webp).digest("hex")}.webp`;
  const bucket = client.storage.from(TRAINER_ACTIVITY_MEDIA_BUCKET);
  const { error } = await bucket.upload(path, webp, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/exists|duplicate/i.test(error.message))
    throw new TrainerActivityMediaUploadError(error);
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Uses service role only for the Storage upload; table writes stay user-scoped. */
export async function uploadTrainerActivityImage(dataUrl: string) {
  return storeOptimizedImage(createAdminClient(), parseImageDataUrl(dataUrl));
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

export type TrainerActivityImageBackfillResult = {
  imagesOptimized: number;
  rowsUpdated: number;
};

/**
 * One-off: re-encodes stored images uploaded before optimization existed.
 * Old objects stay in the bucket so a row can be pointed back if needed.
 * Safe to run again; rows already on WebP are skipped, which also skips any
 * WebP original stored before optimization (production had none).
 */
export async function backfillTrainerActivityImages({
  client = createAdminClient(),
  log = () => {},
}: {
  client?: SupabaseClient;
  log?: (line: string) => void;
} = {}): Promise<TrainerActivityImageBackfillResult> {
  const { data, error } = await client
    .from("trainer_activities")
    .select("image_url")
    .not("image_url", "like", "%.webp");
  if (error) throw new Error(`trainer_activities: ${error.message}`);

  const prefix = `/storage/v1/object/public/${TRAINER_ACTIVITY_MEDIA_BUCKET}/`;
  const urls = [...new Set((data ?? []).map((row) => row.image_url))].filter(
    isTrainerActivityImageUrl,
  );
  const result: TrainerActivityImageBackfillResult = {
    imagesOptimized: 0,
    rowsUpdated: 0,
  };
  for (const url of urls) {
    const path = decodeURIComponent(new URL(url).pathname.slice(prefix.length));
    const download = await client.storage
      .from(TRAINER_ACTIVITY_MEDIA_BUCKET)
      .download(path);
    if (download.error) throw new Error(`${path}: ${download.error.message}`);
    const original = Buffer.from(await download.data.arrayBuffer());
    const optimizedUrl = await storeOptimizedImage(client, original);
    result.imagesOptimized++;

    const updated = await client
      .from("trainer_activities")
      .update({ image_url: optimizedUrl })
      .eq("image_url", url)
      .select("id");
    if (updated.error)
      throw new Error(`trainer_activities: ${updated.error.message}`);
    result.rowsUpdated += updated.data.length;
    log(
      `${path} → ${optimizedUrl.split("/").pop()} (${updated.data.length} baris)`,
    );
  }
  return result;
}
