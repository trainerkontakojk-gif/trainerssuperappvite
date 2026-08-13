import {
  parseVoiceQualityAssessment,
  type VoiceQualityAssessment,
} from "@trainers/types";

export function buildTelefunFeedbackSummary(
  assessment: VoiceQualityAssessment,
): string {
  const voiceParts = [
    assessment.speakingRate.feedback,
    assessment.intonation.feedback,
    assessment.articulation.feedback,
    assessment.fillerWords.feedback,
    assessment.emotionalTone.feedback,
  ]
    .filter(Boolean)
    .slice(0, 3);
  const holdFeedback =
    assessment.holdManagement?.status &&
    assessment.holdManagement.status !== "not_used"
      ? assessment.holdManagement.feedback
      : null;
  return [...voiceParts, holdFeedback].filter(Boolean).join("\n\n");
}

export function enrichTelefunHistoryFeedback<
  T extends {
    feedback?: unknown;
    status?: unknown;
    telefun_transport?: unknown;
    voice_assessment?: unknown;
  },
>(row: T): T {
  if (typeof row.feedback === "string" && row.feedback.trim()) return row;
  if (row.telefun_transport !== "openai-webrtc" || row.status !== "completed") {
    return row;
  }

  const assessment = parseVoiceQualityAssessment(row.voice_assessment);
  if (!assessment) return row;

  const feedback = buildTelefunFeedbackSummary(assessment);
  return feedback ? { ...row, feedback } : row;
}
