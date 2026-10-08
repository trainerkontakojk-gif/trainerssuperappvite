import type { Category, RuleVersionStatus, ScoringMode } from "@trainers/types";

/**
 * Urutan layanan, label layanan (`SERVICE_LABELS` di `lib/scoring`) dan label
 * periode (`periodLabel` di `components/sidak/sidak-input.constants`) dipakai
 * bersama halaman Input; jangan membuat salinan baru di sini.
 */
export { SERVICE_TYPES as TEAMS } from "../../../components/sidak/sidak-input.constants";
export { SERVICE_LABELS } from "../../../lib/scoring";

/** Satu peta istilah status versi: dipakai daftar, Select, header, dan dialog. */
export const RULE_STATUS_LABEL: Record<RuleVersionStatus, string> = {
  draft: "Draft",
  published: "Berlaku",
  superseded: "Digantikan",
};

/** Warna status hanya untuk penanda dekoratif (titik); teks tetap netral. */
export const RULE_STATUS_DOT: Record<RuleVersionStatus, string> = {
  draft: "bg-chart-amber",
  published: "bg-chart-green",
  superseded: "bg-muted-foreground",
};

export function ruleVersionStatusLabel(status: RuleVersionStatus): string {
  return RULE_STATUS_LABEL[status] ?? status;
}

/** Penjelasan status satu kalimat (pengganti banner berwarna penuh). */
export const RULE_STATUS_HINT: Record<RuleVersionStatus, string> = {
  draft:
    "Draft masih dapat diubah. Publish untuk menjadikannya aturan penilaian mulai periode yang dipilih.",
  published:
    "Versi ini berlaku dan tidak dapat diubah. Buat revisi untuk mengubah parameter atau bobot.",
  superseded:
    "Versi ini sudah digantikan. Data historis yang memakainya tetap dipertahankan.",
};

export const SCORING_MODE_LABEL: Record<ScoringMode, string> = {
  weighted: "Berbobot",
  flat: "Flat",
  no_category: "Tanpa kategori",
};

export const CAT_LABEL: Record<Category, string> = {
  non_critical: "Non-critical",
  critical: "Critical",
  none: "Semua parameter",
};

/** Titik warna kategori (dekoratif); teks kategori tetap memakai warna teks biasa. */
export const CAT_DOT: Record<Category, string> = {
  non_critical: "bg-chart-blue",
  critical: "bg-chart-red",
  none: "bg-muted-foreground",
};
