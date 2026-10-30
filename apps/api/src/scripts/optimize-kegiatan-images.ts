/**
 * One-off: re-encodes Kegiatan images uploaded before WebP optimization.
 *   pnpm --filter @trainers/api optimize:kegiatan-images
 * Safe to run again; a second run changes nothing.
 */
import { env } from "../lib/env";
import { backfillTrainerActivityImages } from "../lib/trainer-activity-media";

const project = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
console.log(`Mengoptimalkan gambar Kegiatan di project ${project}...`);
const result = await backfillTrainerActivityImages({ log: console.log });
console.log(
  `Selesai: ${result.imagesOptimized} gambar dioptimalkan, ${result.rowsUpdated} baris diperbarui.`,
);
