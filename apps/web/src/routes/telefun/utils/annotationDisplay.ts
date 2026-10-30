import type {
  AnnotationMoment,
  ReplayAnnotationCategory,
} from "../components/ReplayAnnotator";

export const CATEGORY_LABELS: Record<ReplayAnnotationCategory, string> = {
  strength: "Kekuatan",
  improvement_area: "Perlu diperbaiki",
  critical_moment: "Momen kritis",
  technique_used: "Teknik dipakai",
};

export const MOMENT_LABELS: Record<AnnotationMoment, string> = {
  missed_empathy: "Empati terlewat",
  good_de_escalation: "De-eskalasi baik",
  long_pause: "Jeda panjang",
  interruption: "Interupsi",
  technique_usage: "Penggunaan teknik",
};

/** Form menyimpan kunci momen; catatan lain bisa berisi teks bebas. */
export function momentLabel(moment: string): string {
  return Object.hasOwn(MOMENT_LABELS, moment)
    ? MOMENT_LABELS[moment as AnnotationMoment]
    : moment;
}
