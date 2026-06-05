import type {
  VoiceQualityAssessment,
  TelefunCommunicationProfile,
} from "@trainers/types";
import { enrichAssessmentWithCommunicationProfile } from "@trainers/types";

export {
  parseTelefunScoreResult,
  parseVoiceQualityAssessment as validateAssessment,
} from "@trainers/types";

export function getCommunicationProfileFromAssessment(
  assessment: VoiceQualityAssessment | null | undefined,
): TelefunCommunicationProfile | null {
  if (!assessment) return null;
  const enriched = enrichAssessmentWithCommunicationProfile(assessment);
  return enriched.communicationProfile ?? null;
}
