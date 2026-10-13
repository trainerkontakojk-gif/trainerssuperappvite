import type { PdktDimensionKey } from "@trainers/types";

/** Nama aspek penilaian PDKT yang tampil ke pengguna. */
export const PDKT_DIMENSION_LABELS: Record<PdktDimensionKey, string> = {
  recipientDirection: "Arah Penerima",
  normative: "Kualitas OJK",
  clarity: "Kejelasan",
  typo: "Typo",
  template: "Template",
};
