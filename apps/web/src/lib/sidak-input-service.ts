import type { QAIndicator } from "@trainers/types";
import { resolveServiceTypeFromTeam } from "./scoring";

export function resolveInitialInputService(
  tim?: string | null,
): QAIndicator["service_type"] | "" {
  if ((tim ?? "").trim().toLowerCase() === "mix") return "";
  return resolveServiceTypeFromTeam(tim) as QAIndicator["service_type"];
}

/**
 * Parameter lama dari versi aturan yang belum punya parameter master
 * (`legacy_indicator_id` kosong) tampil di Input Audit tetapi belum bisa
 * dicatat: `qa_temuan.indicator_id` wajib ID master. Parameter baru selalu
 * dibuat dengan master oleh backend.
 */
export const UNLINKED_INDICATOR_NOTE =
  "Parameter bertanda “Belum terhubung” belum terhubung ke parameter master, jadi temuannya belum bisa dicatat. Hubungi admin untuk menautkannya.";

export function unlinkedIndicatorError(name: string): string {
  return `Parameter "${name}" belum terhubung ke parameter master, jadi temuannya belum bisa dicatat. Hubungi admin untuk menautkannya.`;
}
