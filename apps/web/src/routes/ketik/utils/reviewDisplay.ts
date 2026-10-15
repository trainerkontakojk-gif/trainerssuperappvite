import type {
  ChatMessage,
  KetikDimensionKey,
  KetikSessionHistoryItem,
} from "@trainers/types";

/** Lima aspek telaah KETIK, dalam urutan tampilan. */
export const KETIK_ASPECTS: readonly {
  key: KetikDimensionKey;
  label: string;
  field: keyof Pick<
    KetikSessionHistoryItem,
    | "empathyScore"
    | "probingScore"
    | "resolutionScore"
    | "typoScore"
    | "complianceScore"
  >;
}[] = [
  { key: "empathy", label: "Empati & Komunikasi", field: "empathyScore" },
  { key: "probing", label: "Probing", field: "probingScore" },
  { key: "resolution", label: "Resolusi", field: "resolutionScore" },
  { key: "typo", label: "Tata Tulis", field: "typoScore" },
  { key: "compliance", label: "Kepatuhan", field: "complianceScore" },
];

/** Skor di bawah ambang ini masuk tab "Perbaiki dulu". */
export const KETIK_FIX_THRESHOLD = 75;

export interface KetikAspectScore {
  key: KetikDimensionKey;
  label: string;
  score: number;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readAspectScores(
  session: KetikSessionHistoryItem,
): KetikAspectScore[] {
  return KETIK_ASPECTS.flatMap(({ key, label, field }) => {
    const score = session[field];
    return isScore(score) ? [{ key, label, score }] : [];
  });
}

export function readFinalScore(
  session: KetikSessionHistoryItem,
): number | null {
  return session.reviewStatus === "completed" && isScore(session.finalScore)
    ? session.finalScore
    : null;
}

/** Aspek dengan skor terendah satu sesi; seri memakai urutan tampilan. */
export function lowestAspect(
  session: KetikSessionHistoryItem,
): KetikAspectScore | null {
  return readAspectScores(session).reduce<KetikAspectScore | null>(
    (lowest, aspect) =>
      !lowest || aspect.score < lowest.score ? aspect : lowest,
    null,
  );
}

/** Predikat skor; ambang sama dengan rubrik backend. */
export function scoreVerdict(score: number): string {
  if (score >= 90) return "Sangat baik";
  if (score >= 75) return "Baik";
  if (score >= 60) return "Cukup";
  return "Perlu coaching";
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Berat",
  medium: "Sedang",
  minor: "Ringan",
};

/** Tingkat typo dalam bahasa peserta; nilai tak dikenal jatuh ke "Ringan". */
export function typoSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity.trim().toLowerCase()] ?? "Ringan";
}

/**
 * Nomor pesan seperti yang tampil di transkrip Telaah: pesan konsumen dan agen
 * dihitung mulai 1, pesan sistem tidak diberi nomor.
 */
export function numberMessages(
  messages: readonly ChatMessage[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const message of messages) {
    if (message.sender === "system") continue;
    numbers.set(message.id, numbers.size + 1);
  }
  return numbers;
}

export type KetikReviewStatusLabel =
  "Ditelaah" | "Sedang ditelaah" | "Telaah gagal" | "Belum ditelaah";

export function reviewStatusLabel(
  status: KetikSessionHistoryItem["reviewStatus"],
): KetikReviewStatusLabel {
  switch (status) {
    case "completed":
      return "Ditelaah";
    case "processing":
      return "Sedang ditelaah";
    case "failed":
      return "Telaah gagal";
    default:
      return "Belum ditelaah";
  }
}

/** Nama peserta dari snapshot sesi; record yang sudah dihapus diberi penanda. */
export function sessionParticipant(session: KetikSessionHistoryItem): {
  name: string;
  removed: boolean;
} {
  const subject = session.simulationSubject;
  if (subject?.type === "participant") {
    return {
      name: subject.displayName || "Peserta",
      removed: !subject.participantId,
    };
  }
  if (subject?.type === "self") return { name: "Anda", removed: false };
  return { name: "Tidak tercatat", removed: false };
}

/** Label peserta satu baris, untuk daftar yang tidak punya kolom terpisah. */
export function sessionParticipantLabel(
  session: KetikSessionHistoryItem,
): string {
  const { name, removed } = sessionParticipant(session);
  return removed ? `${name} (data peserta sudah dihapus)` : name;
}

function toTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Riwayat terbaru dulu. */
export function sortNewestFirst(
  history: readonly KetikSessionHistoryItem[],
): KetikSessionHistoryItem[] {
  return [...history].sort((a, b) => toTime(b.date) - toTime(a.date));
}

/** Skor sesi yang ditelaah sebelum `session`, untuk perbandingan naik/turun. */
export function previousFinalScore(
  session: KetikSessionHistoryItem,
  history: readonly KetikSessionHistoryItem[],
): number | null {
  const time = toTime(session.date);
  const previous = sortNewestFirst(history).find(
    (item) =>
      item.id !== session.id &&
      toTime(item.date) < time &&
      readFinalScore(item) !== null,
  );
  return previous ? readFinalScore(previous) : null;
}

const WIB_DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatKetikDate(value: string): string {
  const time = toTime(value);
  return time ? WIB_DATE_TIME.format(time) : "-";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Posisi kutipan anotasi di teks pesan yang ditampilkan. Huruf besar/kecil dan
 * jumlah spasi diabaikan, sama seperti pencocokan di backend; `null` bila tidak
 * ketemu (catatan tetap tampil di panel hasil).
 */
export function findQuoteRange(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escapeRegExp).join("\\s+"), "i").exec(
    text,
  );
  return match
    ? { start: match.index, end: match.index + match[0].length }
    : null;
}
