export type NonverbalClipKind =
  | "sigh"
  | "groan"
  | "tsk"
  | "pff"
  | "exhale"
  | "sniffle"
  | "sob"
  | "whimper";

export type ToneMoment =
  | { kind: "opening" }
  | { kind: "after_consumer_turn"; consumerTurnsCompleted: number }
  | { kind: "hold_end"; sequence: number; exceeded: boolean }
  | { kind: "agent_silence" };

export interface ToneDirection {
  note: string | null;
  clip: NonverbalClipKind | null;
}

const NO_DIRECTION: ToneDirection = { note: null, clip: null };

const AFTER_TURN_CLIPS: Record<"marah" | "pasrah", NonverbalClipKind[]> = {
  marah: ["tsk", "pff", "exhale"],
  pasrah: ["sniffle", "whimper", "sniffle"],
};

export function directTone(
  consumerTypeId: string,
  moment: ToneMoment,
  state: { turnsSinceLastClip: number },
): ToneDirection {
  if (consumerTypeId !== "marah" && consumerTypeId !== "pasrah") {
    return NO_DIRECTION;
  }

  const isAngry = consumerTypeId === "marah";
  let clip: NonverbalClipKind | null;
  let note: string;

  switch (moment.kind) {
    case "opening":
      clip = isAngry ? "exhale" : "sniffle";
      note = isAngry
        ? "Ketus, tidak sabar, nada tinggi dan tempo cepat; tekan inti keluhan."
        : "Menahan tangis: suara bergetar dan basah, napas tersendat sebelum kalimat, tempo pelan, jeda panjang.";
      break;
    case "after_consumer_turn":
      clip =
        state.turnsSinceLastClip >= 2
          ? getAfterTurnClip(consumerTypeId, moment.consumerTurnsCompleted)
          : null;
      if (isAngry) {
        note =
          moment.consumerTurnsCompleted >= 3
            ? "Intensitas mengikuti tangga kesabaranmu; tetap kesal kecuali agen sudah mengakui masalah secara spesifik dan memberi langkah plus kepastian waktu."
            : "Tetap kesal dan menekan; nada naik bila jawaban agen mengambang atau template. Jangan melunak hanya karena agen sopan.";
      } else {
        note =
          moment.consumerTurnsCompleted >= 3
            ? "Suara tetap serak dan sengau; boleh sedikit lebih tenang hanya bila agen berempati tulus dan memberi langkah konkret."
            : "Masih menahan tangis: suara tercekat, kalimat patah-patah, napas tersendat.";
      }
      break;
    case "hold_end": {
      const escalated = moment.sequence >= 2 || moment.exceeded;
      clip = isAngry
        ? escalated
          ? "groan"
          : "sigh"
        : escalated
          ? "sob"
          : "sniffle";
      note = isAngry
        ? escalated
          ? "Lebih kesal dari sebelumnya; nada tinggi dan tidak sabar."
          : "Kesal karena ditahan; hela napas berat sebelum bicara, nada naik."
        : escalated
          ? "Hampir pecah; suara tercekat."
          : "Lelah menunggu; suara makin lirih dan bergetar.";
      break;
    }
    case "agent_silence":
      clip = isAngry ? "tsk" : null;
      note = isAngry
        ? "Agen diam; tetap kesal dan tagih dengan nada tajam, singkat."
        : "Agen diam; suara lemah dan berat, seperti kehabisan tenaga.";
      break;
  }

  return {
    note: `[TELEFUN_CONTROL:TONE] ${note}`,
    clip,
  };
}

function getAfterTurnClip(
  consumerTypeId: "marah" | "pasrah",
  consumerTurnsCompleted: number,
): NonverbalClipKind {
  const clips = AFTER_TURN_CLIPS[consumerTypeId];
  const sequence = Math.max(0, Math.floor((consumerTurnsCompleted - 1) / 2));
  return clips[sequence % clips.length]!;
}
