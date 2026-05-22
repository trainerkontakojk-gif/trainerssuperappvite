/**
 * Disruption Scenario Engine - Pure Function Guard
 *
 * Introduces realistic consumer disruptions during simulation sessions.
 * Trainers configure 1-3 disruption types per session; the engine manages
 * spacing, attempt limits, resolution tracking, and persona-appropriate
 * prompt generation in Indonesian.
 *
 * Key behaviors:
 * - Configuration accepts 1-3 disruption types (rejects 0 or >3)
 * - No disruption triggers before exchange 2
 * - Minimum 3 exchanges between consecutive disruptions
 * - Attempt limits: technical_term_confusion max 2, repeated_question max 3
 * - Resolved disruptions NEVER re-trigger
 * - Disruption prompts are persona-appropriate and in Indonesian
 */

import type {
  ConsumerPersonaType,
  DisruptionType,
  DisruptionInstance,
  DisruptionState,
  DisruptionInput,
  DisruptionResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum exchange count before any disruption can trigger. */
const MIN_EXCHANGE_BEFORE_DISRUPTION = 2;

/** Minimum exchanges between consecutive disruptions. */
const MIN_EXCHANGE_SPACING = 3;

/** Maximum number of disruption types allowed per session. */
const MAX_DISRUPTION_TYPES = 3;

/** Attempt limits per disruption type. */
const ATTEMPT_LIMITS: Partial<Record<DisruptionType, number>> = {
  technical_term_confusion: 2,
  repeated_question: 3,
};

/** Default attempt limit for disruption types without a specific limit. */
const DEFAULT_ATTEMPT_LIMIT = 2;

// ---------------------------------------------------------------------------
// Disruption Prompt Pools (Indonesian)
// ---------------------------------------------------------------------------

const DISRUPTION_PROMPTS: Record<
  DisruptionType,
  Record<ConsumerPersonaType, string[]>
> = {
  technical_term_confusion: {
    angry: [
      "Hah? Apa itu? Jangan pakai istilah yang saya nggak ngerti dong!",
      "Maksudnya apa sih? Saya nggak paham istilah begituan!",
    ],
    critical: [
      "Maaf, bisa dijelaskan istilah itu? Saya kurang familiar.",
      "Istilah itu apa ya? Tolong pakai bahasa yang lebih sederhana.",
    ],
    confused: [
      "Maaf, itu maksudnya apa ya? Saya bingung.",
      "Saya kurang paham istilah itu. Bisa dijelaskan lagi?",
    ],
    rushed: [
      "Itu apa? Langsung aja jelaskan yang simpel.",
      "Nggak ngerti istilah itu. Singkat aja ya.",
    ],
    passive: ["Oh... itu apa ya?", "Maaf, saya kurang paham istilah itu."],
    cooperative: [
      "Maaf, bisa tolong jelaskan istilah itu? Saya belum paham.",
      "Saya kurang paham istilah itu. Bisa dibantu jelaskan?",
    ],
  },
  repeated_question: {
    angry: [
      "Saya tanya lagi ya, kenapa bisa begini?!",
      "Kok belum dijawab sih? Saya ulangi pertanyaannya!",
    ],
    critical: [
      "Saya rasa jawaban tadi belum menjawab pertanyaan saya. Bisa diulang?",
      "Maaf, tapi saya masih belum puas dengan jawabannya. Kenapa bisa terjadi?",
    ],
    confused: [
      "Maaf, saya masih belum paham. Bisa diulang penjelasannya?",
      "Eh, tadi gimana ya? Saya masih bingung.",
    ],
    rushed: [
      "Belum kejawab nih. Sekali lagi, gimana solusinya?",
      "Oke tapi pertanyaan saya tadi belum dijawab. Cepat ya.",
    ],
    passive: [
      "Maaf... tadi pertanyaan saya belum dijawab ya?",
      "Hmm, saya mau tanya lagi soal yang tadi.",
    ],
    cooperative: [
      "Maaf, boleh saya tanya ulang? Saya ingin memastikan.",
      "Saya mau konfirmasi lagi ya, tadi bagaimana prosesnya?",
    ],
  },
  misunderstanding: {
    angry: [
      "Bukan itu yang saya maksud! Saya bilang yang lain tadi!",
      "Kok salah paham sih? Saya nggak bilang begitu!",
    ],
    critical: [
      "Sepertinya ada kesalahpahaman. Yang saya maksud bukan itu.",
      "Maaf, tapi itu bukan yang saya sampaikan tadi.",
    ],
    confused: [
      "Eh, bukan itu yang saya maksud. Atau saya yang salah ya?",
      "Hmm, kayaknya beda deh sama yang saya bilang tadi.",
    ],
    rushed: [
      "Bukan itu. Yang saya maksud yang lain. Cepat ya.",
      "Salah. Bukan itu masalahnya.",
    ],
    passive: [
      "Oh... kayaknya beda sama yang saya maksud.",
      "Hmm, mungkin saya kurang jelas ya tadi.",
    ],
    cooperative: [
      "Maaf, sepertinya ada sedikit kesalahpahaman. Yang saya maksud tadi...",
      "Oh bukan itu, maaf kalau kurang jelas. Maksud saya...",
    ],
  },
  interruption: {
    angry: [
      "Tunggu-tunggu! Saya belum selesai bicara!",
      "Eh sebentar! Ada yang mau saya sampaikan dulu!",
    ],
    critical: [
      "Maaf, sebelum dilanjutkan, ada hal penting yang perlu saya sampaikan.",
      "Sebentar, saya perlu menambahkan sesuatu.",
    ],
    confused: [
      "Eh maaf, sebentar. Saya mau tanya sesuatu dulu.",
      "Tunggu, saya bingung. Boleh tanya dulu?",
    ],
    rushed: [
      "Oke-oke, langsung aja ke intinya.",
      "Skip aja yang itu. Yang penting solusinya gimana?",
    ],
    passive: ["Maaf... boleh saya bilang sesuatu?", "Hmm, sebentar ya..."],
    cooperative: [
      "Maaf menyela, tapi ada yang ingin saya sampaikan.",
      "Oh iya, sebelum lanjut, saya mau tambahkan satu hal.",
    ],
  },
  incomplete_data: {
    angry: [
      "Pokoknya ada masalah dengan akun saya! Tolong diperbaiki!",
      "Saya mau komplain! Layanannya bermasalah!",
    ],
    critical: [
      "Jadi begini, ada masalah dengan transaksi saya kemarin.",
      "Saya ingin melaporkan kendala pada layanan yang saya gunakan.",
    ],
    confused: [
      "Jadi... ada masalah gitu. Saya lupa detailnya tapi ada yang salah.",
      "Hmm, saya nggak ingat nomornya. Tapi ada masalah.",
    ],
    rushed: [
      "Ada masalah. Tolong cek aja langsung.",
      "Saya mau lapor masalah. Nanti detailnya menyusul.",
    ],
    passive: [
      "Ada sedikit masalah... tapi saya lupa nomornya.",
      "Hmm, saya mau lapor sesuatu. Tapi datanya kurang lengkap.",
    ],
    cooperative: [
      "Saya ingin melaporkan masalah, tapi maaf saya belum siapkan semua datanya.",
      "Begini, ada kendala yang mau saya sampaikan. Nanti saya cari dulu nomornya ya.",
    ],
  },
  unclear_voice: {
    angry: [
      "...mmh... *suara tidak jelas* ...pokoknya saya kesal!",
      "*suara terputus-putus* ...nggak bisa begini terus!",
    ],
    critical: [
      "*suara agak tidak jelas* ...jadi menurut saya...",
      "Maaf sinyal saya jelek. *suara terputus* ...yang tadi itu...",
    ],
    confused: [
      "*suara tidak jelas* ...maaf, saya di tempat ramai.",
      "Halo? *suara terputus* ...tadi saya bilang...",
    ],
    rushed: [
      "*suara cepat dan tidak jelas* ...pokoknya tolong segera ya.",
      "*terputus-putus* ...langsung aja...",
    ],
    passive: [
      "*suara pelan dan tidak jelas* ...iya...",
      "*hampir tidak terdengar* ...maaf...",
    ],
    cooperative: [
      "Maaf, sinyal saya kurang bagus. *suara terputus* ...tadi saya bilang...",
      "*suara agak tidak jelas* ...maaf ya, saya coba ulang.",
    ],
  },
  emotional_escalation: {
    angry: [
      "Saya sudah capek! Ini sudah ketiga kalinya saya telepon dan nggak ada solusi!",
      "Kok bisa sih pelayanannya kayak gini?! Saya mau bicara sama atasan!",
    ],
    critical: [
      "Saya kecewa dengan penanganan ini. Sudah berapa lama dan belum ada solusi.",
      "Ini tidak profesional. Saya harap ada tindakan nyata.",
    ],
    confused: [
      "Saya bingung dan frustasi. Kenapa prosesnya ribet sekali?",
      "Aduh, saya sudah pusing. Kenapa nggak bisa lebih simpel?",
    ],
    rushed: [
      "Saya nggak punya waktu lagi! Ini harus selesai sekarang!",
      "Sudah buang-buang waktu saya! Cepat selesaikan!",
    ],
    passive: [
      "Ya sudahlah... saya pasrah. Terserah mau gimana.",
      "Saya capek... ya sudah lah.",
    ],
    cooperative: [
      "Saya mulai khawatir ini tidak akan terselesaikan. Bisa dibantu lebih lanjut?",
      "Jujur saya agak kecewa, tapi saya harap kita bisa cari jalan keluarnya.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Resolution Detection Keywords
// ---------------------------------------------------------------------------

const RESOLUTION_KEYWORDS: Record<DisruptionType, string[]> = {
  technical_term_confusion: [
    "artinya",
    "maksudnya",
    "yaitu",
    "adalah",
    "singkatnya",
    "dengan kata lain",
    "jadi intinya",
    "penjelasannya",
  ],
  repeated_question: [
    "jadi",
    "intinya",
    "kesimpulannya",
    "jawabannya",
    "solusinya",
    "langkahnya",
    "prosesnya",
  ],
  misunderstanding: [
    "yang saya maksud",
    "sebenarnya",
    "koreksi",
    "yang benar",
    "maaf atas kesalahpahaman",
    "izinkan saya jelaskan ulang",
  ],
  interruption: [
    "silakan",
    "saya dengarkan",
    "ya silakan",
    "monggo",
    "apa yang ingin disampaikan",
    "saya paham",
  ],
  incomplete_data: [
    "nomor",
    "tanggal",
    "data",
    "informasi",
    "bisa disebutkan",
    "boleh saya minta",
    "tolong sebutkan",
  ],
  unclear_voice: [
    "bisa diulang",
    "maaf kurang jelas",
    "bisa lebih keras",
    "saya dengar",
    "coba ulangi",
  ],
  emotional_escalation: [
    "saya mengerti",
    "saya paham",
    "mohon maaf",
    "kami akan",
    "solusinya",
    "saya bantu",
    "tenang",
    "kami pastikan",
  ],
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Gets the maximum attempt limit for a given disruption type.
 */
function getAttemptLimit(type: DisruptionType): number {
  return ATTEMPT_LIMITS[type] ?? DEFAULT_ATTEMPT_LIMIT;
}

/**
 * Selects a disruption prompt based on type and persona.
 * Uses a simple rotation based on attempt count for variety.
 */
function selectPrompt(
  type: DisruptionType,
  personaType: ConsumerPersonaType,
  attemptIndex: number,
): string {
  const pool = DISRUPTION_PROMPTS[type][personaType];
  return pool[attemptIndex % pool.length];
}

/**
 * Checks if an agent response resolves a specific disruption type.
 * Uses keyword matching against the agent's response text.
 */
function checkResolution(
  agentResponse: string,
  disruptionType: DisruptionType,
): boolean {
  const keywords = RESOLUTION_KEYWORDS[disruptionType];
  const lowerResponse = agentResponse.toLowerCase();
  return keywords.some((keyword) =>
    lowerResponse.includes(keyword.toLowerCase()),
  );
}

/**
 * Finds the next disruption that can be triggered from the active list.
 * A disruption can be triggered if:
 * - It has not been resolved
 * - It has not exceeded its attempt limit
 */
function findTriggerable(history: DisruptionInstance[]): number {
  return history.findIndex(
    (instance) =>
      !instance.resolved && instance.attempts < getAttemptLimit(instance.type),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initializes the disruption state for a session.
 *
 * @param enabledTypes - Array of 1-3 disruption types to enable
 * @param maxActive - Maximum active disruptions (default 3, used for validation)
 * @throws Error if enabledTypes length is 0 or > 3
 */
export function initializeDisruptions(
  enabledTypes: DisruptionType[],
  maxActive: number = MAX_DISRUPTION_TYPES,
): DisruptionState {
  if (enabledTypes.length === 0) {
    throw new Error("At least 1 disruption type must be enabled. Received 0.");
  }

  if (enabledTypes.length > MAX_DISRUPTION_TYPES) {
    throw new Error(
      `Maximum ${MAX_DISRUPTION_TYPES} disruption types allowed per session. Received ${enabledTypes.length}.`,
    );
  }

  const effectiveMaxActive = Math.min(
    Math.max(maxActive, 1),
    MAX_DISRUPTION_TYPES,
  );

  const activeTypes = enabledTypes.slice(0, effectiveMaxActive);

  const disruptionHistory: DisruptionInstance[] = activeTypes.map((type) => ({
    type,
    triggeredAtExchange: -1,
    resolved: false,
    attempts: 0,
  }));

  return {
    activeDisruptions: activeTypes,
    exchangeCount: 0,
    disruptionHistory,
    nextDisruptionAfterExchange: MIN_EXCHANGE_BEFORE_DISRUPTION,
  };
}

/**
 * Evaluates the current state and input to determine the next disruption action.
 *
 * Logic flow:
 * 1. Update exchange count from input
 * 2. Check if agent response resolves any active (unresolved) disruption -> mark_resolved
 * 3. Check spacing rules (exchange >= 2, spacing >= 3 exchanges)
 * 4. Find a triggerable disruption (not resolved, within attempt limits)
 * 5. If found, trigger it and update spacing
 * 6. Otherwise, return 'none'
 */
export function evaluateDisruption(
  state: DisruptionState,
  input: DisruptionInput,
): DisruptionResult {
  const newHistory = state.disruptionHistory.map((d) => ({ ...d }));
  const newExchangeCount = input.exchangeCount;
  let newNextDisruptionAfter = state.nextDisruptionAfterExchange;

  // Step 1: Check if agent response resolves any active disruption
  if (input.agentResponse) {
    for (let i = 0; i < newHistory.length; i++) {
      const instance = newHistory[i];
      if (!instance.resolved && instance.attempts > 0) {
        if (checkResolution(input.agentResponse, instance.type)) {
          newHistory[i] = { ...instance, resolved: true };

          return {
            state: {
              activeDisruptions: state.activeDisruptions,
              exchangeCount: newExchangeCount,
              disruptionHistory: newHistory,
              nextDisruptionAfterExchange: newNextDisruptionAfter,
            },
            action: { type: "mark_resolved", disruptionIndex: i },
          };
        }
      }
    }
  }

  // Step 2: Check spacing rules - no disruption before exchange 2
  if (newExchangeCount < MIN_EXCHANGE_BEFORE_DISRUPTION) {
    return {
      state: {
        activeDisruptions: state.activeDisruptions,
        exchangeCount: newExchangeCount,
        disruptionHistory: newHistory,
        nextDisruptionAfterExchange: newNextDisruptionAfter,
      },
      action: "none",
    };
  }

  // Step 3: Check spacing rule - must be at or past nextDisruptionAfterExchange
  if (newExchangeCount < newNextDisruptionAfter) {
    return {
      state: {
        activeDisruptions: state.activeDisruptions,
        exchangeCount: newExchangeCount,
        disruptionHistory: newHistory,
        nextDisruptionAfterExchange: newNextDisruptionAfter,
      },
      action: "none",
    };
  }

  // Step 4: Find a triggerable disruption
  const triggerableIndex = findTriggerable(newHistory);

  if (triggerableIndex === -1) {
    return {
      state: {
        activeDisruptions: state.activeDisruptions,
        exchangeCount: newExchangeCount,
        disruptionHistory: newHistory,
        nextDisruptionAfterExchange: newNextDisruptionAfter,
      },
      action: "none",
    };
  }

  // Step 5: Trigger the disruption
  const instance = newHistory[triggerableIndex];
  const prompt = selectPrompt(
    instance.type,
    input.personaType,
    instance.attempts,
  );

  newHistory[triggerableIndex] = {
    ...instance,
    triggeredAtExchange: newExchangeCount,
    attempts: instance.attempts + 1,
  };

  newNextDisruptionAfter = newExchangeCount + MIN_EXCHANGE_SPACING;

  return {
    state: {
      activeDisruptions: state.activeDisruptions,
      exchangeCount: newExchangeCount,
      disruptionHistory: newHistory,
      nextDisruptionAfterExchange: newNextDisruptionAfter,
    },
    action: {
      type: "trigger_disruption",
      disruption: instance.type,
      prompt,
    },
  };
}
