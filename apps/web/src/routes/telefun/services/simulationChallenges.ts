export type TelefunSimulationChallengeType =
  | "technical_term_confusion"
  | "repeated_question"
  | "misunderstanding"
  | "interruption"
  | "incomplete_data"
  | "unclear_voice"
  | "emotional_escalation";

export interface SimulationChallengeDefinition {
  id: TelefunSimulationChallengeType;
  label: string;
  promptInstruction: string;
}

export const SIMULATION_CHALLENGES: readonly SimulationChallengeDefinition[] = [
  {
    id: "technical_term_confusion",
    label: "Bingung Istilah Teknis",
    promptInstruction:
      "Minta penjelasan sederhana hanya setelah agen memakai jargon yang belum dijelaskan.",
  },
  {
    id: "repeated_question",
    label: "Pertanyaan Berulang",
    promptInstruction:
      "Ulangi pertanyaan hanya jika jawaban sebelumnya belum lengkap atau ambigu.",
  },
  {
    id: "misunderstanding",
    label: "Salah Paham",
    promptInstruction:
      "Salah pahami pernyataan ambigu secara wajar, lalu terima klarifikasi agen.",
  },
  {
    id: "interruption",
    label: "Interupsi",
    promptInstruction:
      "Sela dengan sopan hanya ketika agen terlalu mendominasi percakapan.",
  },
  {
    id: "incomplete_data",
    label: "Data Tidak Lengkap",
    promptInstruction:
      "Tahan satu detail non-identitas dan berikan ketika ditanya; identitas tidak boleh berubah.",
  },
  {
    id: "unclear_voice",
    label: "Suara Tidak Jelas",
    promptInstruction:
      "Minta pengulangan secara natural tanpa membacakan markup seperti *suara terputus*.",
  },
  {
    id: "emotional_escalation",
    label: "Eskalasi Emosional",
    promptInstruction:
      "Naikkan emosi hanya jika masalah belum ditangani dan redakan jika agen merespons dengan baik.",
  },
] as const;

const CHALLENGE_IDS = new Set<TelefunSimulationChallengeType>(
  SIMULATION_CHALLENGES.map(({ id }) => id),
);

export function normalizeSimulationChallengeTypes(
  value: unknown,
): TelefunSimulationChallengeType[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is TelefunSimulationChallengeType =>
          typeof item === "string" &&
          CHALLENGE_IDS.has(item as TelefunSimulationChallengeType),
      ),
    ),
  ].slice(0, 3);
}

export function getSimulationChallengeDefinitions(
  value: unknown,
): SimulationChallengeDefinition[] {
  const ids = normalizeSimulationChallengeTypes(value);
  return SIMULATION_CHALLENGES.filter(({ id }) => ids.includes(id));
}

export function getSimulationInterruptionInstruction(value: unknown): string {
  const interruptionSelected =
    normalizeSimulationChallengeTypes(value).includes("interruption");
  return interruptionSelected
    ? "MENYELA KONDISIONAL: Jika agen terlalu mendominasi percakapan atau berbicara panjang tanpa jeda, kamu BOLEH menyela secara sopan untuk meminta penjelasan lebih pelan atau satu per satu. Jangan menyela secara agresif."
    : "JANGAN MENYELA AGEN. Tunggu sampai agen selesai berbicara atau memberi jeda yang jelas sebelum merespons.";
}
