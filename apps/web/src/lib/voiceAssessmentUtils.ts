import type {
  VoiceQualityAssessment,
  TelefunCommunicationProfile,
} from "@trainers/types";
import {
  parseVoiceQualityAssessment,
  parseTelefunScoreResult,
  enrichAssessmentWithCommunicationProfile,
} from "@trainers/types";

export { parseVoiceQualityAssessment as validateAssessment };

export interface TelefunScoreResponse {
  score: number;
  feedback: string;
  assessment?: VoiceQualityAssessment | null;
}

export function normalizeTelefunScoreResponse(
  data: unknown,
): TelefunScoreResponse {
  const result = parseTelefunScoreResult(data);
  if (!result) {
    return { score: 0, feedback: "", assessment: null };
  }
  return {
    score: result.score,
    feedback: result.feedback,
    assessment: result.assessment,
  };
}

export function getCommunicationProfileFromAssessment(
  assessment: VoiceQualityAssessment | null | undefined,
): TelefunCommunicationProfile | null {
  if (!assessment) return null;
  const enriched = enrichAssessmentWithCommunicationProfile(assessment);
  return enriched.communicationProfile || null;
}

