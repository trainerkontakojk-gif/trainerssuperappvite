import type {
  ConsumerPersonaType,
  ConversationPhase,
  TelefunSessionState,
} from "./types";

export interface FallbackState {
  waitingSince: number | null;
  consecutiveFailures: number;
  lastFallbackAt: number | null;
  sessionPaused: boolean;
}

export interface FallbackInput {
  now: number;
  sessionState: TelefunSessionState;
  agentStoppedSpeakingAt: number | null;
  personaType: ConsumerPersonaType;
  conversationPhase: ConversationPhase;
  timeoutMs?: number;
  cooldownMs?: number;
}

export type FallbackAction =
  | "none"
  | "inject_fallback"
  | "session_recovery"
  | "reset_counter";

export interface FallbackResult {
  state: FallbackState;
  action: FallbackAction;
  utterance?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_COOLDOWN_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 2;

const FALLBACK_UTTERANCE_POOLS: Record<
  ConsumerPersonaType,
  Record<ConversationPhase, string[]>
> = {
  angry: {
    greeting: [
      "Halo? Ada orang nggak sih?",
      "Woi, masih di sana?",
      "Halo? Kok diam?",
    ],
    problem_statement: [
      "Halo? Saya lagi ngomong ini!",
      "Kok nggak dijawab sih?",
      "Masih dengerin nggak?",
    ],
    explanation: [
      "Terus gimana? Kok diam?",
      "Jadi solusinya apa? Jawab dong!",
      "Halo? Saya nunggu jawaban nih!",
    ],
    negotiation: [
      "Jadi gimana keputusannya?",
      "Kok lama banget sih jawabnya?",
      "Saya nggak punya waktu banyak ya!",
    ],
    closing: [
      "Masih ada yang mau disampaikan?",
      "Halo? Sudah selesai belum?",
      "Oke kalau nggak ada lagi ya.",
    ],
  },
  confused: {
    greeting: [
      "Halo? Maaf, saya masih di sini.",
      "Eh, masih tersambung ya?",
      "Halo? Bisa dengar saya?",
    ],
    problem_statement: [
      "Maaf, saya bingung. Bisa diulang?",
      "Eh, tadi apa ya? Saya kurang paham.",
      "Halo? Saya masih nunggu penjelasan.",
    ],
    explanation: [
      "Maaf, saya masih kurang ngerti. Bisa dijelaskan lagi?",
      "Halo? Tadi sampai mana ya?",
      "Eh, jadi gimana maksudnya?",
    ],
    negotiation: [
      "Jadi yang mana yang harus saya pilih?",
      "Maaf, saya bingung harus gimana.",
      "Bisa diulang pilihannya?",
    ],
    closing: [
      "Eh, sudah selesai ya?",
      "Maaf, tadi ada yang perlu saya lakukan lagi?",
      "Halo? Masih ada yang perlu dibahas?",
    ],
  },
  rushed: {
    greeting: [
      "Halo? Saya buru-buru nih.",
      "Masih di sana? Saya nggak banyak waktu.",
      "Halo? Cepat ya.",
    ],
    problem_statement: [
      "Kok lama? Saya sibuk nih.",
      "Halo? Bisa cepat nggak?",
      "Saya nunggu ya, tapi cepat.",
    ],
    explanation: [
      "Jadi intinya apa? Cepat dong.",
      "Halo? Langsung ke poinnya aja.",
      "Saya nggak punya waktu lama-lama.",
    ],
    negotiation: [
      "Cepat putuskan dong.",
      "Jadi gimana? Saya harus pergi sebentar lagi.",
      "Langsung aja, mau yang mana?",
    ],
    closing: [
      "Oke sudah ya? Saya harus pergi.",
      "Ada lagi nggak? Saya buru-buru.",
      "Kalau sudah, saya tutup ya.",
    ],
  },
  passive: {
    greeting: ["Halo... masih di sana ya?", "Oh, saya masih nunggu.", "Halo?"],
    problem_statement: [
      "Hmm, saya masih di sini.",
      "Oh, iya. Saya nunggu.",
      "Halo? Tidak apa-apa, saya tunggu.",
    ],
    explanation: [
      "Oh, iya. Saya dengarkan.",
      "Hmm, lanjut ya kalau sudah siap.",
      "Saya masih di sini kok.",
    ],
    negotiation: [
      "Iya, saya tunggu keputusannya.",
      "Tidak apa-apa, ambil waktu saja.",
      "Hmm, jadi gimana ya?",
    ],
    closing: [
      "Oh, sudah selesai ya?",
      "Iya, terima kasih.",
      "Hmm, oke kalau begitu.",
    ],
  },
  critical: {
    greeting: [
      "Halo? Saya sudah menunggu lama.",
      "Masih di sana? Tolong profesional sedikit.",
      "Halo? Ini sudah lama sekali.",
    ],
    problem_statement: [
      "Kok tidak ada respons? Ini tidak profesional.",
      "Saya menunggu jawaban yang jelas.",
      "Halo? Tolong ditanggapi dengan serius.",
    ],
    explanation: [
      "Jadi bagaimana kelanjutannya?",
      "Saya butuh jawaban yang konkret.",
      "Tolong jangan buat saya menunggu lama.",
    ],
    negotiation: [
      "Saya perlu keputusan yang jelas.",
      "Ini sudah terlalu lama. Bagaimana?",
      "Tolong segera berikan solusinya.",
    ],
    closing: [
      "Baik, ada lagi yang perlu disampaikan?",
      "Kalau sudah selesai, saya harap ini tidak terulang.",
      "Oke, saya catat semua ini.",
    ],
  },
  cooperative: {
    greeting: [
      "Halo, saya masih di sini. Bisa diulang sedikit?",
      "Maaf, tadi agak kurang jelas.",
      "Halo? Tidak apa-apa, saya tunggu.",
    ],
    problem_statement: [
      "Iya, saya masih mendengarkan.",
      "Maaf, bisa diulang tadi?",
      "Halo? Saya masih di sini kok.",
    ],
    explanation: [
      "Iya, saya paham. Lanjut ya.",
      "Oh begitu. Bisa dijelaskan lagi bagian tadi?",
      "Maaf, tadi saya kurang dengar. Bisa diulang?",
    ],
    negotiation: [
      "Iya, saya setuju. Lanjut ya.",
      "Baik, jadi langkah selanjutnya apa?",
      "Oke, saya ikut saran Anda.",
    ],
    closing: [
      "Baik, terima kasih banyak ya.",
      "Oke, ada lagi yang perlu saya tahu?",
      "Terima kasih, sudah sangat membantu.",
    ],
  },
};

export function createInitialFallbackState(): FallbackState {
  return {
    waitingSince: null,
    consecutiveFailures: 0,
    lastFallbackAt: null,
    sessionPaused: false,
  };
}

function pickUtterance(
  personaType: ConsumerPersonaType,
  conversationPhase: ConversationPhase,
  consecutiveFailures: number,
): string {
  const pool = FALLBACK_UTTERANCE_POOLS[personaType][conversationPhase];
  if (pool.length === 0) return "Halo?";
  const index = Math.min(pool.length - 1, consecutiveFailures % pool.length);
  return pool[index];
}

export function evaluateFallback(
  state: FallbackState,
  input: FallbackInput,
): FallbackResult {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const nextState: FallbackState = { ...state };

  if (input.sessionState === "ended") {
    return {
      state: createInitialFallbackState(),
      action: "reset_counter",
    };
  }

  if (input.agentStoppedSpeakingAt == null) {
    if (state.waitingSince !== null || state.consecutiveFailures !== 0) {
      return {
        state: createInitialFallbackState(),
        action: "reset_counter",
      };
    }

    return {
      state,
      action: "none",
    };
  }

  if (
    nextState.lastFallbackAt !== null &&
    input.now - nextState.lastFallbackAt < cooldownMs
  ) {
    return {
      state: nextState,
      action: "none",
    };
  }

  if (nextState.waitingSince === null) {
    nextState.waitingSince = input.agentStoppedSpeakingAt;
  }

  const elapsed = input.now - nextState.waitingSince;
  if (elapsed < timeoutMs) {
    return {
      state: nextState,
      action: "none",
    };
  }

  if (nextState.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return {
      state: {
        waitingSince: null,
        consecutiveFailures: 0,
        lastFallbackAt: input.now,
        sessionPaused: false,
      },
      action: "session_recovery",
    };
  }

  const utterance = pickUtterance(
    input.personaType,
    input.conversationPhase,
    nextState.consecutiveFailures,
  );

  return {
    state: {
      waitingSince: input.agentStoppedSpeakingAt,
      consecutiveFailures: nextState.consecutiveFailures + 1,
      lastFallbackAt: input.now,
      sessionPaused: false,
    },
    action: "inject_fallback",
    utterance,
  };
}
