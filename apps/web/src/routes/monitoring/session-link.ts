import type { MonitoringSessionRow } from "@trainers/types";
import { notify } from "../../lib/toast";

/** Salin alamat halaman detail sesi; dipakai halaman sesi dan menu Riwayat. */
export async function copySessionLink(
  module: MonitoringSessionRow["module"],
  id: string,
): Promise<void> {
  const url = new URL(`/monitoring/sesi/${module}/${id}`, window.location.origin);
  try {
    await navigator.clipboard.writeText(url.href);
    notify.success("Tautan sesi disalin.");
  } catch {
    notify.error("Tautan belum bisa disalin. Salin alamat dari browser.");
  }
}
