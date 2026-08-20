import {
  DEFAULT_GEMINI_LIVE_VOICE,
  DEFAULT_OPENAI_REALTIME_VOICE,
  GEMINI_LIVE_VOICES,
  GEMINI_LIVE_VOICES_BY_GENDER,
  OPENAI_REALTIME_VOICES,
  OPENAI_REALTIME_VOICES_BY_GENDER,
  isGeminiLiveVoiceName,
  isOpenAiRealtimeVoiceName,
  type GeminiLiveVoiceName,
  type OpenAiRealtimeVoiceName,
  type TelefunGender,
  type TelefunVoiceName,
} from "@trainers/types";

export {
  DEFAULT_GEMINI_LIVE_VOICE,
  DEFAULT_OPENAI_REALTIME_VOICE,
  GEMINI_LIVE_VOICES,
  GEMINI_LIVE_VOICES_BY_GENDER,
  OPENAI_REALTIME_VOICES,
  OPENAI_REALTIME_VOICES_BY_GENDER,
  isGeminiLiveVoiceName,
  isOpenAiRealtimeVoiceName,
};
export type {
  GeminiLiveVoiceName,
  OpenAiRealtimeVoiceName,
  TelefunGender,
  TelefunVoiceName,
};

export function getVoicesForModel(
  _modelId: string | null | undefined,
  gender?: TelefunGender,
): readonly TelefunVoiceName[] {
  return gender ? GEMINI_LIVE_VOICES_BY_GENDER[gender] : GEMINI_LIVE_VOICES;
}

export function getDefaultVoiceForModel(
  _modelId: string | null | undefined,
): TelefunVoiceName {
  return DEFAULT_GEMINI_LIVE_VOICE;
}

export function isVoiceValidForModel(
  _modelId: string | null | undefined,
  voice: unknown,
): voice is TelefunVoiceName {
  return isGeminiLiveVoiceName(voice);
}

export function resolveGeminiLiveVoice(params: {
  requestedVoice?: string;
  gender: TelefunGender;
  random?: () => number;
}): GeminiLiveVoiceName {
  const pool: readonly GeminiLiveVoiceName[] =
    GEMINI_LIVE_VOICES_BY_GENDER[params.gender];
  return resolveVoiceFromPool({
    requestedVoice: params.requestedVoice,
    pool,
    random: params.random,
  });
}

function resolveVoiceFromPool<TVoice extends TelefunVoiceName>(params: {
  requestedVoice?: string;
  pool: readonly TVoice[];
  random?: () => number;
}): TVoice {
  if (params.requestedVoice) {
    const requestedVoice = params.requestedVoice as TVoice;
    if (params.pool.includes(requestedVoice)) return requestedVoice;
  }
  const rand = params.random ?? Math.random;
  const index = Math.min(
    params.pool.length - 1,
    Math.max(0, Math.floor(rand() * params.pool.length)),
  );
  return params.pool[index];
}

export function resolveVoiceForModel(params: {
  modelId?: string | null;
  requestedVoice?: string;
  gender: TelefunGender;
  random?: () => number;
}): TelefunVoiceName {
  return resolveGeminiLiveVoice({
    requestedVoice: params.requestedVoice,
    gender: params.gender,
    random: params.random,
  });
}
