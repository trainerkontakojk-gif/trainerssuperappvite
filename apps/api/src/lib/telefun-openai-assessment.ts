import { parseVoiceQualityAssessment } from "@trainers/types";
import {
  PermanentScoringError,
  TransientScoringError,
} from "./telefun-scoring-errors";

export interface OpenAITelefunAssessmentRequest {
  sessionId: string;
  userId: string;
  modelId: string;
}

export interface OpenAITelefunAssessmentResult {
  overallScore: number;
  [key: string]: unknown;
}

const INTERNAL_SCORING_TIMEOUT_MS = 75_000;

function internalBaseUrl(): string {
  return (process.env.TELEFUN_INTERNAL_URL || "").replace(/\/$/, "");
}

function internalToken(): string {
  return process.env.TELEFUN_INTERNAL_TOKEN || "";
}

/**
 * Calls the Telefun service internal scoring endpoint for provider-matched
 * OpenAI assessment. Reads TELEFUN_INTERNAL_URL / TELEFUN_INTERNAL_TOKEN from
 * the API runtime env only — never exposed to the frontend.
 */
export async function requestOpenAITelefunAssessment(
  req: OpenAITelefunAssessmentRequest,
): Promise<OpenAITelefunAssessmentResult> {
  const baseUrl = internalBaseUrl();
  const token = internalToken();

  if (!baseUrl || !token) {
    throw new PermanentScoringError(
      "Konfigurasi internal Telefun (URL/token) tidak tersedia di layanan API.",
      "MISSING_INTERNAL_CONFIG",
    );
  }

  const url = `${baseUrl}/internal/telefun/scoring`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(INTERNAL_SCORING_TIMEOUT_MS),
    });
  } catch {
    throw new TransientScoringError(
      "Gagal menghubungi layanan penilaian internal.",
      "INTERNAL_NETWORK_ERROR",
    );
  }

  const isTransientStatus = response.status === 429 || response.status >= 500;

  if (isTransientStatus) {
    throw new TransientScoringError(
      `Layanan penilaian internal tidak tersedia (${response.status}).`,
      "INTERNAL_TRANSIENT",
    );
  }

  if (!response.ok) {
    throw new PermanentScoringError(
      `Layanan penilaian internal menolak permintaan (${response.status}).`,
      "INTERNAL_PERMANENT",
    );
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new PermanentScoringError(
      "Respons layanan penilaian internal bukan JSON valid.",
      "INTERNAL_BAD_RESPONSE",
    );
  }

  const assessment = parseVoiceQualityAssessment(payload?.assessment);
  if (!assessment) {
    throw new PermanentScoringError(
      "Hasil penilaian dari layanan internal tidak lolos validasi skema.",
      "INTERNAL_INVALID_ASSESSMENT",
    );
  }

  return assessment as OpenAITelefunAssessmentResult;
}
