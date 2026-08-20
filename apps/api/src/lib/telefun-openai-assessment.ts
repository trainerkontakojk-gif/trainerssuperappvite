import { PermanentScoringError } from "./telefun-scoring-errors";

export interface OpenAITelefunAssessmentRequest {
  sessionId: string;
  userId: string;
  modelId: string;
}

export interface OpenAITelefunAssessmentResult {
  overallScore: number;
  [key: string]: unknown;
}

export const TELEFUN_OPENAI_SCORING_DISABLED_CODE =
  "TELEFUN_OPENAI_SCORING_DISABLED";
export const TELEFUN_OPENAI_SCORING_DISABLED_REASON =
  "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.";

/**
 * Compatibility boundary retained for callers compiled against the old API.
 * It intentionally performs no HTTP, provider, usage, or fallback work.
 */
export async function requestOpenAITelefunAssessment(
  _req: OpenAITelefunAssessmentRequest,
): Promise<OpenAITelefunAssessmentResult> {
  throw new PermanentScoringError(
    TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    TELEFUN_OPENAI_SCORING_DISABLED_CODE,
  );
}
