import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase";

/**
 * KETIK/PDKT scenario attachments (images, PDKT PDFs) live in Storage, not as
 * base64 inside JSON: a data URL is uploaded once and replaced by its public
 * URL before it is saved. Objects are named by the SHA-256 of their bytes, so
 * a file is stored once and its URL never changes. See migration
 * 20261019120000_scenario_attachments_storage.sql.
 */
export const SCENARIO_ATTACHMENT_BUCKET = "scenario-attachments";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
};
const DATA_URL =
  /^data:(image\/(?:png|jpe?g|gif|webp|avif|bmp)|application\/pdf);base64,([a-z\d+/=\s]+)$/i;

export class ScenarioAttachmentUploadError extends Error {
  constructor(cause: unknown) {
    super("Lampiran skenario gagal diunggah. Silakan coba lagi.", { cause });
    this.name = "ScenarioAttachmentUploadError";
  }
}

async function upload(client: SupabaseClient, dataUrl: string) {
  const match = DATA_URL.exec(dataUrl.trim());
  if (!match) return null;
  const mime =
    match[1].toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const path = `${createHash("sha256").update(bytes).digest("hex")}.${EXTENSIONS[mime]}`;
  const bucket = client.storage.from(SCENARIO_ATTACHMENT_BUCKET);
  const { error } = await bucket.upload(path, bytes, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: false,
  });
  // The name is the content hash: an existing object is this same file.
  if (error && !/exists|duplicate/i.test(error.message))
    throw new ScenarioAttachmentUploadError(error);
  return bucket.getPublicUrl(path).data.publicUrl;
}

function collect(value: unknown, found: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith("data:") && DATA_URL.test(value.trim()))
      found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collect(item, found);
  }
}

function replace<T>(value: T, urls: Map<string, string>): T {
  if (typeof value === "string") return (urls.get(value) ?? value) as T;
  if (Array.isArray(value))
    return value.map((item) => replace(item, urls)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replace(item, urls)]),
    ) as T;
  return value;
}

/** Returns `value` with every supported attachment data URL swapped for its Storage URL. */
export async function externalizeScenarioAttachments<T>(
  value: T,
  client: SupabaseClient = createAdminClient(),
): Promise<T> {
  const found = new Set<string>();
  collect(value, found);
  if (found.size === 0) return value;
  const urls = new Map<string, string>();
  await Promise.all(
    [...found].map(async (dataUrl) => {
      const url = await upload(client, dataUrl);
      if (url) urls.set(dataUrl, url);
    }),
  );
  return replace(value, urls);
}

const BACKFILL_TABLES = [
  "user_settings",
  "ketik_configuration_assignments",
  "ketik_sessions",
  "pdkt_history",
  "pdkt_mailbox_items",
] as const;

export type ScenarioAttachmentBackfillResult = {
  rowsUpdated: number;
  filesDownloaded: number;
  filesUploaded: number;
};

/**
 * Moves attachments saved before Storage into it. Pages through each table in
 * the database; a file is downloaded once (keyed by the md5 of its JSON
 * literal) and the swap happens inside the database, so concurrent writes to
 * other fields of a row are kept. Safe to run again.
 */
export async function backfillScenarioAttachments({
  client = createAdminClient(),
  pageSize = 25,
  log = () => {},
}: {
  client?: SupabaseClient;
  pageSize?: number;
  log?: (line: string) => void;
} = {}): Promise<ScenarioAttachmentBackfillResult> {
  const urls = new Map<string, string>();
  const result: ScenarioAttachmentBackfillResult = {
    rowsUpdated: 0,
    filesDownloaded: 0,
    filesUploaded: 0,
  };
  const rpc = async <T>(name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`, { cause: error });
    return data as T;
  };

  for (const table of BACKFILL_TABLES) {
    let after: string | null = null;
    let tableRows = 0;
    for (;;) {
      const page: { next: string | null; keys: string[]; digests: string[] } =
        await rpc("scenario_attachment_backfill_scan", {
          p_table: table,
          p_after: after,
          p_limit: pageSize,
        });
      if (!page.next) break;
      after = page.next;
      if (page.keys.length === 0) continue;

      const unknown = page.digests.filter((digest) => !urls.has(digest));
      if (unknown.length > 0) {
        const literals = await rpc<string[]>(
          "scenario_attachment_backfill_fetch",
          { p_table: table, p_keys: page.keys, p_digests: unknown },
        );
        result.filesDownloaded += literals.length;
        for (const literal of literals) {
          const digest = createHash("md5").update(literal).digest("hex");
          const url = await upload(client, JSON.parse(literal) as string);
          if (!url) continue;
          urls.set(digest, url);
          result.filesUploaded++;
        }
      }
      const digests = page.digests.filter((digest) => urls.has(digest));
      if (digests.length === 0) continue;
      const updated = await rpc<number>("scenario_attachment_backfill_apply", {
        p_table: table,
        p_keys: page.keys,
        p_digests: digests,
        p_urls: digests.map((digest) => urls.get(digest)!),
      });
      tableRows += updated;
    }
    result.rowsUpdated += tableRows;
    log(`${table}: ${tableRows} baris diperbarui`);
  }
  return result;
}
