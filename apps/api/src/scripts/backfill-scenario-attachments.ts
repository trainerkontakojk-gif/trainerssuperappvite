/**
 * One-off: moves KETIK/PDKT scenario attachments saved as base64 into Storage.
 * Run after migration 20261019120000_scenario_attachments_storage.sql:
 *   pnpm --filter @trainers/api backfill:scenario-attachments
 * Safe to run again; a second run changes nothing.
 */
import { env } from "../lib/env";
import { backfillScenarioAttachments } from "../lib/scenario-attachments";

const project = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
console.log(
  `Memindahkan lampiran skenario di project ${project} ke Storage...`,
);
const result = await backfillScenarioAttachments({ log: console.log });
console.log(
  `Selesai: ${result.rowsUpdated} baris diperbarui, ${result.filesUploaded} berkas diunggah, ${result.filesDownloaded} berkas dibaca dari database.`,
);
