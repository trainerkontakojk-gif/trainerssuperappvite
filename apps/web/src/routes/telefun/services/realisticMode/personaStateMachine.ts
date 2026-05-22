import type { ConsumerPersonaType, PersonaLanguagePatterns } from "./types";

export interface PersonaState {
  personaType: ConsumerPersonaType;
  emotionalIntensity: number;
  exchangeCount: number;
  lastDeEscalationAt: number | null;
  lastEscalationAt: number | null;
}

export type PersonaEvent =
  | { type: "de_escalation"; trigger: "empathy" | "solution" | "apology" }
  | {
      type: "escalation";
      trigger: "dismissive" | "ignored_concern" | "rude_hold";
    }
  | { type: "exchange_complete" }
  | { type: "resolution_offered"; addressesConcern: boolean };

export interface PersonaResult {
  state: PersonaState;
  intensityDelta: number;
  languagePatterns: PersonaLanguagePatterns;
}

const INTENSITY_RANGES: Record<
  ConsumerPersonaType,
  { min: number; max: number }
> = {
  angry: { min: 7, max: 8 },
  critical: { min: 6, max: 7 },
  confused: { min: 4, max: 5 },
  rushed: { min: 5, max: 6 },
  passive: { min: 3, max: 4 },
  cooperative: { min: 2, max: 3 },
};

const MIN_INTENSITY = 1;
const MAX_INTENSITY = 10;

const TONE_MARKERS: Record<
  ConsumerPersonaType,
  Record<"high" | "medium" | "low", string[]>
> = {
  angry: {
    high: ["!", "sih", "dong", "kok bisa"],
    medium: ["sih", "dong", "ya"],
    low: ["ya", "sih"],
  },
  critical: {
    high: ["kan", "tuh", "lho", "masa"],
    medium: ["kan", "sih", "ya"],
    low: ["ya", "kok"],
  },
  confused: {
    high: ["?", "hah", "gimana", "maksudnya"],
    medium: ["ya?", "gimana", "kok"],
    low: ["ya", "oh"],
  },
  rushed: {
    high: ["cepat", "buruan", "langsung aja"],
    medium: ["ayo", "langsung", "cepat"],
    low: ["ya", "oke"],
  },
  passive: {
    high: ["ya", "iya", "terserah"],
    medium: ["ya", "iya", "oh"],
    low: ["ya", "hmm"],
  },
  cooperative: {
    high: ["ya", "oke", "baik"],
    medium: ["ya", "kok", "oke"],
    low: ["ya", "oke"],
  },
};

const PREFERRED_FILLERS: Record<
  ConsumerPersonaType,
  Record<"high" | "medium" | "low", string[]>
> = {
  angry: {
    high: ["Heh", "Woi", "Aduh"],
    medium: ["Duh", "Aduh", "Yah"],
    low: ["Hmm", "Yah"],
  },
  critical: {
    high: ["Nah", "Tuh kan", "Lihat"],
    medium: ["Nah", "Hmm", "Begini"],
    low: ["Hmm", "Oh", "Begitu"],
  },
  confused: {
    high: ["Hah", "Lho", "Eh"],
    medium: ["Eh", "Hmm", "Apa"],
    low: ["Hmm", "Oh"],
  },
  rushed: {
    high: ["Ayo", "Udah", "Langsung"],
    medium: ["Oke", "Yuk", "Ayo"],
    low: ["Hmm", "Oke"],
  },
  passive: {
    high: ["Iya", "Ya", "Oh"],
    medium: ["Hmm", "Iya", "Oh"],
    low: ["Hmm", "Oh"],
  },
  cooperative: {
    high: ["Baik", "Oke", "Siap"],
    medium: ["Hmm", "Oh", "Iya"],
    low: ["Hmm", "Oh"],
  },
};

const RESPONSE_LENGTHS: Record<
  ConsumerPersonaType,
  Record<"high" | "medium" | "low", "short" | "medium" | "long">
> = {
  angry: { high: "short", medium: "short", low: "medium" },
  critical: { high: "long", medium: "medium", low: "medium" },
  confused: { high: "long", medium: "medium", low: "short" },
  rushed: { high: "short", medium: "short", low: "medium" },
  passive: { high: "short", medium: "short", low: "short" },
  cooperative: { high: "medium", medium: "medium", low: "medium" },
};

const INTERRUPTION_LIKELIHOOD: Record<
  ConsumerPersonaType,
  Record<"high" | "medium" | "low", number>
> = {
  angry: { high: 0.7, medium: 0.4, low: 0.2 },
  critical: { high: 0.5, medium: 0.3, low: 0.1 },
  confused: { high: 0.3, medium: 0.2, low: 0.1 },
  rushed: { high: 0.6, medium: 0.4, low: 0.2 },
  passive: { high: 0.1, medium: 0.05, low: 0 },
  cooperative: { high: 0.2, medium: 0.1, low: 0.05 },
};

function getIntensityLevel(intensity: number): "high" | "medium" | "low" {
  if (intensity >= 7) return "high";
  if (intensity >= 4) return "medium";
  return "low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getInitialIntensity(personaType: ConsumerPersonaType): number {
  const range = INTENSITY_RANGES[personaType];
  return Math.floor((range.min + range.max) / 2);
}

function getEscalationDelta(personaType: ConsumerPersonaType): number {
  switch (personaType) {
    case "angry":
    case "critical":
      return 2;
    case "confused":
    case "rushed":
      return 1;
    case "passive":
    case "cooperative":
      return 1;
  }
}

function getDeEscalationDelta(): number {
  return -1;
}

function getLanguagePatterns(
  personaType: ConsumerPersonaType,
  intensity: number,
): PersonaLanguagePatterns {
  const level = getIntensityLevel(intensity);

  return {
    toneMarkers: TONE_MARKERS[personaType][level],
    preferredFillers: PREFERRED_FILLERS[personaType][level],
    responseLength: RESPONSE_LENGTHS[personaType][level],
    interruptionLikelihood: INTERRUPTION_LIKELIHOOD[personaType][level],
  };
}

export function getInitialIntensityRange(personaType: ConsumerPersonaType): {
  min: number;
  max: number;
} {
  return INTENSITY_RANGES[personaType];
}

export function initializePersona(
  personaType: ConsumerPersonaType,
): PersonaState {
  return {
    personaType,
    emotionalIntensity: getInitialIntensity(personaType),
    exchangeCount: 0,
    lastDeEscalationAt: null,
    lastEscalationAt: null,
  };
}

export function reducePersonaState(
  state: PersonaState,
  event: PersonaEvent,
): PersonaResult {
  let delta = 0;
  let exchangeCount = state.exchangeCount;
  let lastDeEscalationAt = state.lastDeEscalationAt;
  let lastEscalationAt = state.lastEscalationAt;

  switch (event.type) {
    case "de_escalation":
      delta = getDeEscalationDelta();
      lastDeEscalationAt = state.exchangeCount;
      break;
    case "escalation":
      delta = getEscalationDelta(state.personaType);
      lastEscalationAt = state.exchangeCount;
      break;
    case "resolution_offered":
      delta = event.addressesConcern ? -1 : 1;
      break;
    case "exchange_complete":
      exchangeCount = state.exchangeCount + 1;
      if (state.personaType === "angry" || state.personaType === "critical") {
        delta = exchangeCount % 2 === 0 ? 1 : 0;
      } else if (
        state.personaType === "confused" ||
        state.personaType === "rushed"
      ) {
        delta = exchangeCount % 3 === 0 ? 1 : 0;
      } else if (
        state.personaType === "passive" ||
        state.personaType === "cooperative"
      ) {
        delta = exchangeCount % 2 === 0 ? -1 : 0;
      }
      break;
  }

  const emotionalIntensity = clamp(
    state.emotionalIntensity + delta,
    MIN_INTENSITY,
    MAX_INTENSITY,
  );

  const nextState: PersonaState = {
    personaType: state.personaType,
    emotionalIntensity,
    exchangeCount,
    lastDeEscalationAt,
    lastEscalationAt,
  };

  return {
    state: nextState,
    intensityDelta: delta,
    languagePatterns: getLanguagePatterns(
      state.personaType,
      emotionalIntensity,
    ),
  };
}
