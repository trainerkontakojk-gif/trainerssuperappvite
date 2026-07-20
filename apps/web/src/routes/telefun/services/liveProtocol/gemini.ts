import { arrayBufferToBase64, base64ToUint8Array } from "./common";

export function buildTelefunLiveSetupMessage(params: {
  telefunModelId: string;
  voiceName: string;
  systemInstruction: string;
}) {
  return {
    setup: {
      model: `models/${params.telefunModelId}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: params.voiceName },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 300,
          silenceDurationMs: 950,
        },
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
    },
  };
}

export function buildRealtimeAudioMessage(
  buffer: ArrayBuffer,
  sampleRateHz = 16000,
) {
  return {
    realtimeInput: {
      audio: {
        mimeType: `audio/pcm;rate=${sampleRateHz}`,
        data: arrayBufferToBase64(buffer),
      },
    },
  };
}

export function buildAudioStreamEndMessage() {
  return {
    realtimeInput: {
      audioStreamEnd: true,
    },
  };
}

export function buildGeminiRealtimeTextMessage(text: string) {
  return {
    realtimeInput: { text },
  };
}

export function parsePcmSampleRate(
  mimeType: string | undefined,
  fallback = 24000,
): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function extractGeminiInlineAudioChunks(
  message: unknown,
  fallbackSampleRateHz = 24000,
): Array<{
  data: Uint8Array;
  sampleRate: number;
}> {
  const parts = (message as any)?.serverContent?.modelTurn?.parts;
  if (!Array.isArray(parts)) return [];

  return parts
    .map((part) => {
      const inlineData = part?.inlineData;
      if (!inlineData?.data || typeof inlineData.data !== "string") return null;
      return {
        data: base64ToUint8Array(inlineData.data),
        sampleRate: parsePcmSampleRate(
          inlineData.mimeType,
          fallbackSampleRateHz,
        ),
      };
    })
    .filter(Boolean) as Array<{ data: Uint8Array; sampleRate: number }>;
}

export function shouldSendRealtimeAudio(params: {
  wsReady: boolean;
  setupComplete: boolean;
  muted: boolean;
  held: boolean;
}): boolean {
  return (
    params.wsReady && params.setupComplete && !params.muted && !params.held
  );
}
