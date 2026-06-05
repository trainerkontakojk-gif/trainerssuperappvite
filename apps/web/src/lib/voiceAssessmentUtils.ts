import type {
  VoiceQualityAssessment,
  VoiceAspectScore,
  TelefunCommunicationProfile,
} from "@trainers/types";
import {
  buildCommunicationProfileFromAssessment,
  enrichAssessmentWithCommunicationProfile,
} from "@trainers/types";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateAspectScore(
  data: unknown,
  defaultVerdict = "Neutral",
): VoiceAspectScore {
  const safeData = isRecord(data) ? data : {};
  return {
    score:
      typeof safeData.score === "number" ? clamp(safeData.score, 0, 10) : 0,
    verdict:
      typeof safeData.verdict === "string" ? safeData.verdict : defaultVerdict,
    feedback:
      typeof safeData.feedback === "string"
        ? safeData.feedback
        : "No feedback provided.",
  };
}

export function validateAssessment(
  data: unknown,
): VoiceQualityAssessment | null {
  if (!isRecord(data)) {
    return null;
  }

  if (typeof data.overallScore !== "number") {
    return null;
  }

  const speakingRate = isRecord(data.speakingRate) ? data.speakingRate : {};
  const intonation = isRecord(data.intonation) ? data.intonation : {};
  const articulation = isRecord(data.articulation) ? data.articulation : {};
  const fillerWords = isRecord(data.fillerWords) ? data.fillerWords : {};
  const emotionalTone = isRecord(data.emotionalTone) ? data.emotionalTone : {};

  const safeAspect = (aspect: unknown) => validateAspectScore(aspect);

  const communicationProfile = isRecord(data.communicationProfile)
    ? (data.communicationProfile as unknown as TelefunCommunicationProfile)
    : null;

  return {
    overallScore: clamp(data.overallScore, 0, 10),
    speakingRate: {
      ...safeAspect(speakingRate),
      wordsPerMinute:
        typeof speakingRate.wordsPerMinute === "number"
          ? speakingRate.wordsPerMinute
          : 0,
    },
    intonation: safeAspect(intonation),
    articulation: safeAspect(articulation),
    fillerWords: {
      ...safeAspect(fillerWords),
      count: typeof fillerWords.count === "number" ? fillerWords.count : 0,
      examples: Array.isArray(fillerWords.examples)
        ? fillerWords.examples
            .filter((e): e is string => typeof e === "string")
            .slice(0, 10)
        : [],
    },
    emotionalTone: {
      ...safeAspect(emotionalTone),
      dominant:
        typeof emotionalTone.dominant === "string"
          ? emotionalTone.dominant
          : "Unknown",
    },
    transcript: typeof data.transcript === "string" ? data.transcript : "",
    highlights: Array.isArray(data.highlights)
      ? data.highlights
          .filter((h): h is string => typeof h === "string")
          .slice(0, 5)
      : [],
    strengths: Array.isArray(data.strengths)
      ? data.strengths
          .filter((s): s is string => typeof s === "string")
          .slice(0, 5)
      : [],
    communicationProfile,
  };
}

export interface TelefunScoreResponse {
  score: number;
  feedback: string;
  assessment?: VoiceQualityAssessment | null;
}

export function normalizeTelefunScoreResponse(
  data: unknown,
): TelefunScoreResponse {
  if (!isRecord(data)) {
    return { score: 0, feedback: "", assessment: null };
  }

  const assessment = isRecord(data.assessment)
    ? data.assessment
    : isRecord(data) &&
        typeof (data as Record<string, unknown>).overallScore === "number"
      ? data
      : null;

  return {
    score: typeof data.score === "number" ? data.score : 0,
    feedback: typeof data.feedback === "string" ? data.feedback : "",
    assessment: assessment
      ? (assessment as unknown as VoiceQualityAssessment)
      : null,
  };
}
export function getCommunicationProfileFromAssessment(
  assessment: VoiceQualityAssessment | null | undefined,
): TelefunCommunicationProfile | null {
  if (!assessment) return null;
  const enriched = enrichAssessmentWithCommunicationProfile(assessment);
  return enriched.communicationProfile || null;
}
