import type {
  TelefunHoldInterval,
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import type { CallRecord } from "../types";
import { getTelefunScoringStatusLabel, isTelefunRecordScored } from "../types";

/** Aspek di bawah ambang ini masuk tab "Perbaiki dulu" (skala 0–10). */
export const TELEFUN_FIX_THRESHOLD = 7;

export type TelefunAspectKey =
  | "speakingRate"
  | "intonation"
  | "articulation"
  | "fillerWords"
  | "emotionalTone"
  | "holdManagement";

export interface TelefunAspect {
  key: TelefunAspectKey;
  label: string;
  /** `null` bila aspek tidak berlaku (mis. hold tidak dipakai). */
  score: number | null;
  verdict: string;
  feedback: string;
  /** Angka mentah di bawah bar, mis. "158 kata/menit". */
  raw: string | null;
}

const NUMBER_ONE_DECIMAL = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Skor suara dengan satu desimal gaya Indonesia: 7.6 → "7,6". */
export function formatTelefunScore(score: number): string {
  return NUMBER_ONE_DECIMAL.format(score);
}

/** Waktu rekaman "mm.ss" seperti di softphone, mis. 36000 → "00.36". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}.${String(seconds).padStart(2, "0")}`;
}

/** Durasi panggilan singkat: 252 → "4 mnt 12 dtk", 300 → "5 mnt". */
export function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} dtk`;
  return rest === 0 ? `${minutes} mnt` : `${minutes} mnt ${rest} dtk`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function formatTelefunDate(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? DATE_FORMAT.format(time) : "-";
}

function holdRaw(assessment: VoiceQualityAssessment): string | null {
  const hold = assessment.holdManagement;
  if (!hold || hold.status === "not_used" || hold.holdCount === 0) {
    return "tidak dipakai";
  }
  const seconds = Math.round(hold.totalDurationMs / 1000);
  const limit =
    hold.exceededCount > 0
      ? `${hold.exceededCount} kali melewati batas`
      : "tidak melewati batas";
  return `${hold.holdCount} kali · ${seconds} detik · ${limit}`;
}

function fillerRaw(assessment: VoiceQualityAssessment): string {
  const { count, examples } = assessment.fillerWords;
  const quoted = examples
    .slice(0, 3)
    .map((example) => `"${example}"`)
    .join(", ");
  return quoted ? `${count} kali · ${quoted}` : `${count} kali`;
}

/** Enam aspek suara dalam urutan tampilan, dengan angka mentahnya. */
export function readTelefunAspects(
  assessment: VoiceQualityAssessment,
): TelefunAspect[] {
  const hold = assessment.holdManagement;
  return [
    {
      key: "speakingRate",
      label: "Kecepatan bicara",
      score: assessment.speakingRate.score,
      verdict: assessment.speakingRate.verdict,
      feedback: assessment.speakingRate.feedback,
      raw: `${Math.round(assessment.speakingRate.wordsPerMinute)} kata/menit`,
    },
    {
      key: "intonation",
      label: "Intonasi",
      score: assessment.intonation.score,
      verdict: assessment.intonation.verdict,
      feedback: assessment.intonation.feedback,
      raw: null,
    },
    {
      key: "articulation",
      label: "Artikulasi",
      score: assessment.articulation.score,
      verdict: assessment.articulation.verdict,
      feedback: assessment.articulation.feedback,
      raw: null,
    },
    {
      key: "fillerWords",
      label: "Kata pengisi",
      score: assessment.fillerWords.score,
      verdict: assessment.fillerWords.verdict,
      feedback: assessment.fillerWords.feedback,
      raw: fillerRaw(assessment),
    },
    {
      key: "emotionalTone",
      label: "Nada emosi",
      score: assessment.emotionalTone.score,
      verdict: assessment.emotionalTone.verdict,
      feedback: assessment.emotionalTone.feedback,
      raw: assessment.emotionalTone.dominant
        ? `dominan: ${assessment.emotionalTone.dominant}`
        : null,
    },
    {
      key: "holdManagement",
      label: "Penggunaan hold",
      score: hold?.score ?? null,
      verdict: hold?.verdict ?? "N/A",
      feedback: hold?.feedback ?? "",
      raw: holdRaw(assessment),
    },
  ];
}

/** Aspek dengan skor terendah satu sesi; aspek tanpa skor dilewati. */
export function lowestTelefunAspect(
  assessment: VoiceQualityAssessment,
): TelefunAspect | null {
  return readTelefunAspects(assessment).reduce<TelefunAspect | null>(
    (lowest, aspect) =>
      aspect.score !== null && (!lowest || aspect.score < (lowest.score ?? 0))
        ? aspect
        : lowest,
    null,
  );
}

/** Predikat skor 0–10. */
export function telefunScoreVerdict(score: number): string {
  if (score >= 9) return "Sangat baik";
  if (score >= 7.5) return "Baik";
  if (score >= 6) return "Cukup";
  return "Perlu latihan";
}

/** Rekaman tersimpan di server, atau masih ada salinan lokal di perangkat ini. */
export function hasTelefunRecording(record: CallRecord): boolean {
  return Boolean(
    record.url || record.recordingPath || record.agentRecordingPath,
  );
}

export type TelefunAnalysisState =
  | "scored"
  | "pending"
  | "processing"
  | "failed"
  | "incomplete"
  | "no_recording"
  | "not_analyzed";

/** Keadaan analisis suara yang jujur untuk satu sesi. */
export function telefunAnalysisState(record: CallRecord): TelefunAnalysisState {
  if (isTelefunRecordScored(record)) return "scored";
  switch (record.scoringStatus) {
    case "pending":
      return "pending";
    case "processing":
      return "processing";
    case "failed":
      return "failed";
    case "completed":
      return "incomplete";
  }
  if (record.syncStatus === "unsynced" || !hasTelefunRecording(record)) {
    return "no_recording";
  }
  return "not_analyzed";
}

/** Label status pendek untuk tabel dan daftar; tidak bergantung warna. */
export function telefunStatusLabel(record: CallRecord): string {
  const state = telefunAnalysisState(record);
  switch (state) {
    case "scored":
      return "Sudah dinilai";
    case "incomplete":
      return "Hasil belum lengkap";
    case "no_recording":
      return "Rekaman tidak tersimpan";
    case "not_analyzed":
      return "Belum dianalisis";
    case "failed":
      return record.scoringRetryable
        ? "Analisis gagal, akan dicoba lagi otomatis"
        : "Analisis gagal";
    default:
      return getTelefunScoringStatusLabel(record)?.text ?? "Menunggu analisis";
  }
}

export interface TelefunParticipant {
  name: string;
  /** Label lengkap yang dipakai CSV dan penanda peserta lama. */
  label: string;
}

export function telefunParticipant(record: CallRecord): TelefunParticipant {
  const label = formatSimulationSubjectLabel(record.simulationSubject, {
    includeParticipantDetails: false,
  });
  const subject = record.simulationSubject;
  if (subject?.type === "participant") {
    return { name: subject.displayName || label, label };
  }
  if (subject?.type === "self") return { name: "Anda", label: "Anda" };
  // Sesi lama tanpa atribusi: nama pendek di tabel, label lengkap di CSV.
  return { name: "Tidak tercatat", label };
}

export function sortTelefunNewestFirst(records: readonly CallRecord[]) {
  return [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/** Skor sesi yang benar-benar sudah dinilai; selain itu `null`. */
export function readTelefunScore(record: CallRecord): number | null {
  return isTelefunRecordScored(record) && typeof record.score === "number"
    ? record.score
    : null;
}

/** Baris transkrip agen pertama yang memuat salah satu contoh kata pengisi. */
export function firstFillerLine(
  transcript: readonly TelefunTranscriptEntry[],
  examples: readonly string[],
): TelefunTranscriptEntry | null {
  const lowered = examples
    .map((example) => example.toLowerCase())
    .filter(Boolean);
  if (lowered.length === 0) return null;
  return (
    transcript.find(
      (entry) =>
        entry.speaker === "agent" &&
        lowered.some((example) => entry.text.toLowerCase().includes(example)),
    ) ?? null
  );
}

export function holdIntervals(record: CallRecord): TelefunHoldInterval[] {
  return record.sessionMetrics?.hold?.intervals ?? [];
}
