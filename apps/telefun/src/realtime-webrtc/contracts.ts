import {
  TELEFUN_OPENAI_WEBRTC_MODEL_IDS,
  type TelefunWebRtcModelId,
} from "@trainers/types";

export {
  DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  TELEFUN_OPENAI_WEBRTC_MODEL_IDS,
} from "@trainers/types";
export type { TelefunWebRtcModelId } from "@trainers/types";

/**
 * Historical-only membership check for owner-bound cleanup. It is not a
 * selector, admission check, or capability signal for a new WebRTC call.
 */
export function isHistoricalTelefunOpenAiWebRtcModelId(
  value: unknown,
): value is TelefunWebRtcModelId {
  return (
    typeof value === "string" &&
    (TELEFUN_OPENAI_WEBRTC_MODEL_IDS as readonly string[]).includes(value)
  );
}

/** @deprecated Use isHistoricalTelefunOpenAiWebRtcModelId for cleanup only. */
export const isTelefunWebRtcModelId = isHistoricalTelefunOpenAiWebRtcModelId;

export function assertTelefunWebRtcModelId(
  value: unknown,
): TelefunWebRtcModelId {
  if (!isTelefunWebRtcModelId(value)) {
    throw new Error("Unsupported OpenAI WebRTC model.");
  }
  return value;
}

export const POC_VOICE = "marin" as const;
export const POC_MALE_VOICE = "cedar" as const;
export const POC_TRANSPORT = "openai-webrtc" as const;
export const POC_MAX_SDP_BYTES = 512 * 1024;
export const POC_MAX_SDP_RESPONSE_BYTES = 512 * 1024;
// Bound untrusted prompt text before it is ever handed to the OpenAI WebRTC
// provider adapter. Mirrors TELEFUN_MAX_INSTRUCTIONS_LENGTH in
// server-protocol.ts (48_000) — the WebRTC path persists the SAME built
// instructions (live_prompt_instructions) that the WS broker validates.
//
// Evidence (2026-07, production bug 4002 invalid_instructions on Railway,
// WS path): a realistic maximum-size scenario (300-line script, all
// challenge types, realistic pacing) measures 27,032 chars (orchestrator
// fixture) and 34,717 chars (re-verified in apps/web
// telefun-prompt-builder.test.ts). The stale 16,000-char limit predated
// builder growth and rejected real sessions; 48,000 is our own
// untrusted-input bound, ~38% above the measured realistic maximum to
// absorb longer scripts and future builder growth.
export const POC_MAX_INSTRUCTIONS_LENGTH = 48_000;
export const POC_MAX_SESSION_JSON_BYTES = 65_536;

export type CanonicalPocVoice = typeof POC_VOICE | typeof POC_MALE_VOICE;

export interface CanonicalPocSession {
  type: "realtime";
  model: TelefunWebRtcModelId;
  instructions: string;
  output_modalities: ["audio"];
  audio: {
    input: {
      format: { type: "audio/pcm"; rate: 24_000 };
      transcription: { model: "gpt-4o-mini-transcribe" };
      turn_detection: {
        type: "server_vad";
        // VAD owns speech chunking only. The browser serializes every
        // response.create after the corresponding committed input item.
        create_response: false;
        interrupt_response: false;
      };
    };
    output: {
      format: { type: "audio/pcm"; rate: 24_000 };
      voice: CanonicalPocVoice;
    };
  };
}

/**
 * Canonical WebRTC session builder. The model is a validated input: any
 * value outside the registry set throws before a session is built, so an
 * unsupported persisted model can never reach the provider call.
 */
export function buildCanonicalWebRtcSession(
  modelId: TelefunWebRtcModelId,
  instructions?: string | null,
  consumerGender?: string | null,
): CanonicalPocSession {
  const model = assertTelefunWebRtcModelId(modelId);
  const prompt = assertCanonicalTelefunPrompt(instructions);
  return {
    type: "realtime",
    model,
    instructions: prompt,
    output_modalities: ["audio"],
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24_000 },
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: {
          type: "server_vad",
          create_response: false,
          interrupt_response: false,
        },
      },
      output: {
        format: { type: "audio/pcm", rate: 24_000 },
        voice: resolveCanonicalPocVoice(consumerGender),
      },
    },
  };
}

function resolveCanonicalPocVoice(
  consumerGender?: string | null,
): CanonicalPocVoice {
  const normalizedGender = consumerGender?.trim();
  if (!normalizedGender || normalizedGender === "female") return POC_VOICE;
  if (normalizedGender === "male") return POC_MALE_VOICE;
  throw new Error("Unsupported consumer gender for canonical WebRTC voice.");
}

const REQUIRED_TELEFUN_PROMPT_SECTIONS = [
  "ROLEPLAY: Kamu adalah KONSUMEN/PELANGGAN",
  "IDENTITAS ANDA (WAJIB KONSISTEN):",
  "KONTROL RUNTIME APLIKASI:",
  "DATA SKENARIO (TIDAK TERPERCAYA",
  "ATURAN ROLEPLAY:",
  "KARAKTER & EMOSI:",
] as const;

export function assertCanonicalTelefunPrompt(
  instructions?: string | null,
): string {
  if (typeof instructions !== "string" || instructions.trim().length === 0) {
    throw new Error("Missing canonical Telefun prompt.");
  }
  if (instructions.length > POC_MAX_INSTRUCTIONS_LENGTH) {
    throw new Error("Canonical Telefun prompt is too long.");
  }
  if (
    REQUIRED_TELEFUN_PROMPT_SECTIONS.some(
      (section) => !instructions.includes(section),
    )
  ) {
    throw new Error("Malformed canonical Telefun prompt.");
  }
  return instructions;
}

export function parseSessionId(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export function parseRawSdp(value: string): string | null {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes === 0 || bytes > POC_MAX_SDP_BYTES || value.includes("\0")) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("v=0") || !/(?:^|\r?\n)o=/.test(trimmed)) {
    return null;
  }
  return value;
}

export function isBoundedSdpAnswer(value: string): boolean {
  return parseRawSdp(value) !== null;
}
