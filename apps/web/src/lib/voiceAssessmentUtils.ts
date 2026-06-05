import type {
  VoiceQualityAssessment,
  VoiceAspectScore,
  TelefunCommunicationProfile,
  TelefunHoldAssessment,
} from "@trainers/types";
import { enrichAssessmentWithCommunicationProfile } from "@trainers/types";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createNotUsedHoldAssessment(): TelefunHoldAssessment {
  return {
    status: "not_used",
    score: null,
    verdict: "N/A",
    feedback: "User tidak menggunakan hold pada sesi ini.",
    holdCount: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
  };
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

function validateHoldAssessment(data: unknown): TelefunHoldAssessment | null {
  if (!isRecord(data)) return null;
  const status = data.status as string;
  if (!["not_used", "within_limit", "exceeded"].includes(status)) return null;

  const score =
    typeof data.score === "number" ? clamp(data.score, 0, 10) : null;
  const verdict = data.verdict as string;
  if (!["N/A", "Baik", "Kurang"].includes(verdict)) return null;

  return {
    status: status as TelefunHoldAssessment["status"],
    score,
    verdict: verdict as TelefunHoldAssessment["verdict"],
    feedback: typeof data.feedback === "string" ? data.feedback : "",
    holdCount:
      typeof data.holdCount === "number" ? Math.max(0, data.holdCount) : 0,
    totalDurationMs:
      typeof data.totalDurationMs === "number"
        ? Math.max(0, data.totalDurationMs)
        : 0,
    longestDurationMs:
      typeof data.longestDurationMs === "number"
        ? Math.max(0, data.longestDurationMs)
        : 0,
    exceededCount:
      typeof data.exceededCount === "number"
        ? Math.max(0, data.exceededCount)
        : 0,
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
    holdManagement:
      validateHoldAssessment(data.holdManagement) ??
      createNotUsedHoldAssessment(),
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
