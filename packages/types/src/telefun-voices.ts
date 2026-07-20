export type TelefunGender = "male" | "female";

export const GEMINI_LIVE_VOICES_BY_GENDER = {
  male: ["Puck", "Charon", "Fenrir", "Orus"],
  female: ["Kore", "Leda", "Aoede"],
} as const satisfies Record<TelefunGender, readonly string[]>;

export type GeminiLiveVoiceName =
  | (typeof GEMINI_LIVE_VOICES_BY_GENDER.male)[number]
  | (typeof GEMINI_LIVE_VOICES_BY_GENDER.female)[number];

export const GEMINI_LIVE_VOICES: readonly GeminiLiveVoiceName[] = [
  ...GEMINI_LIVE_VOICES_BY_GENDER.male,
  ...GEMINI_LIVE_VOICES_BY_GENDER.female,
] as const;

export const OPENAI_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type OpenAiRealtimeVoiceName = (typeof OPENAI_REALTIME_VOICES)[number];

export const OPENAI_REALTIME_VOICES_BY_GENDER = {
  male: ["ash", "ballad", "echo", "verse", "cedar"],
  female: ["coral", "sage", "shimmer", "marin"],
} as const satisfies Record<
  TelefunGender,
  readonly OpenAiRealtimeVoiceName[]
>;

export type TelefunVoiceName = GeminiLiveVoiceName | OpenAiRealtimeVoiceName;

export const DEFAULT_GEMINI_LIVE_VOICE: GeminiLiveVoiceName = "Kore";
export const DEFAULT_OPENAI_REALTIME_VOICE: OpenAiRealtimeVoiceName = "marin";

export function isGeminiLiveVoiceName(
  value: unknown,
): value is GeminiLiveVoiceName {
  return GEMINI_LIVE_VOICES.includes(value as GeminiLiveVoiceName);
}

export function isOpenAiRealtimeVoiceName(
  value: unknown,
): value is OpenAiRealtimeVoiceName {
  return OPENAI_REALTIME_VOICES.includes(value as OpenAiRealtimeVoiceName);
}
