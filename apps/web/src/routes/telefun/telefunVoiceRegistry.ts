export type TelefunGender = "male" | "female";

export type GeminiLiveVoiceName =
  | "Puck"
  | "Charon"
  | "Kore"
  | "Fenrir"
  | "Leda"
  | "Orus"
  | "Aoede";

export const GEMINI_LIVE_VOICES_BY_GENDER: Record<
  TelefunGender,
  readonly GeminiLiveVoiceName[]
> = {
  male: ["Puck", "Charon", "Fenrir", "Orus"],
  female: ["Kore", "Leda", "Aoede"],
} as const;

const ALL_VALID_VOICES: readonly string[] = [
  ...GEMINI_LIVE_VOICES_BY_GENDER.male,
  ...GEMINI_LIVE_VOICES_BY_GENDER.female,
];

export function isGeminiLiveVoiceName(value: unknown): value is GeminiLiveVoiceName {
  return ALL_VALID_VOICES.includes(value as string);
}

export function resolveGeminiLiveVoice(params: {
  requestedVoice?: string;
  gender: TelefunGender;
  random?: () => number;
}): GeminiLiveVoiceName {
  const pool = GEMINI_LIVE_VOICES_BY_GENDER[params.gender];
  const rand = params.random ?? Math.random;
  if (params.requestedVoice && isGeminiLiveVoiceName(params.requestedVoice)) {
    const voice = params.requestedVoice as GeminiLiveVoiceName;
    if (pool.includes(voice)) return voice;
  }
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)));
  return pool[index];
}
