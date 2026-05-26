import type {
  VoiceQualityAssessment,
  VoiceAspectScore,
  TelefunCommunicationProfile,
  CommunicationMetric,
  CommunicationMetricMode,
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
    : isRecord(data) && typeof (data as Record<string, unknown>).overallScore === "number"
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
  if (assessment.communicationProfile) return assessment.communicationProfile;

  const rawValues: Partial<Record<CommunicationMetric["key"], number>> = {
    speakingRate: buildSpeakingRateValue(assessment),
    intonation: clamp(
      Math.round((assessment.intonation?.score ?? 5) * 10),
      0,
      100,
    ),
    articulation: clamp(
      Math.round((assessment.articulation?.score ?? 5) * 10),
      0,
      100,
    ),
    fillers: buildFillersValue(assessment),
    tone: clamp(
      Math.round((assessment.emotionalTone?.score ?? 5) * 10),
      0,
      100,
    ),
  };

  const benchmarkDefaults: Record<
    CommunicationMetric["key"],
    {
      benchmarkValue: number;
      evaluationMode: CommunicationMetricMode;
      label: string;
      goodMin?: number;
      goodMax?: number;
      idealMin?: number;
      idealMax?: number;
    }
  > = {
    speakingRate: {
      benchmarkValue: 70,
      evaluationMode: "optimal_range",
      label: "Speaking Rate",
      idealMin: 60,
      idealMax: 80,
      goodMin: 50,
      goodMax: 90,
    },
    intonation: {
      benchmarkValue: 85,
      evaluationMode: "higher_better",
      label: "Intonation",
      goodMin: 75,
    },
    articulation: {
      benchmarkValue: 90,
      evaluationMode: "higher_better",
      label: "Articulation",
      goodMin: 75,
    },
    fillers: {
      benchmarkValue: 20,
      evaluationMode: "lower_better",
      label: "Fillers",
      goodMax: 30,
    },
    tone: {
      benchmarkValue: 88,
      evaluationMode: "higher_better",
      label: "Tone",
      goodMin: 75,
    },
  };

  function evaluateStatus(
    value: number,
    mode: CommunicationMetricMode,
    b: {
      goodMin?: number;
      goodMax?: number;
      idealMin?: number;
      idealMax?: number;
    },
  ): "good" | "needs_improvement" | "poor" {
    const c = clamp(value, 0, 100);
    switch (mode) {
      case "higher_better":
        return c >= (b.goodMin ?? 75)
          ? "good"
          : c >= 50
            ? "needs_improvement"
            : "poor";
      case "lower_better":
        return c <= (b.goodMax ?? 30)
          ? "good"
          : c <= 50
            ? "needs_improvement"
            : "poor";
      case "optimal_range":
        if (b.idealMin !== undefined && b.idealMax !== undefined) {
          if (c >= b.idealMin && c <= b.idealMax) return "good";
        }
        if (b.goodMin !== undefined && b.goodMax !== undefined) {
          if (c >= b.goodMin && c <= b.goodMax) return "needs_improvement";
        }
        return "poor";
      default:
        return "needs_improvement";
    }
  }

  const metrics: CommunicationMetric[] = (
    Object.keys(benchmarkDefaults) as CommunicationMetric["key"][]
  ).map((key) => {
    const def = benchmarkDefaults[key];
    const value = clamp(rawValues[key] ?? 50, 0, 100);
    const status = evaluateStatus(value, def.evaluationMode, {
      goodMin: def.goodMin,
      goodMax: def.goodMax,
      idealMin: def.idealMin,
      idealMax: def.idealMax,
    });

    return {
      key,
      label: def.label,
      value,
      benchmarkValue: def.benchmarkValue,
      evaluationMode: def.evaluationMode,
      idealMin: def.idealMin,
      idealMax: def.idealMax,
      goodMin: def.goodMin,
      goodMax: def.goodMax,
      status,
      explanation: "",
    };
  });

  const strengths = metrics
    .filter((m) => m.status === "good")
    .map((m) => `${m.label}: Baik`);
  const priorities = metrics
    .filter((m) => m.status !== "good")
    .map((m) => `${m.label}: Perlu perbaikan`);

  return {
    metrics,
    overallSummary: "Data komunikasi dibangun dari penilaian klasik (fallback).",
    strengths:
      strengths.length > 0
        ? strengths
        : ["Belum ada kekuatan yang menonjol."],
    improvementPriorities: priorities,
  };
}

function buildSpeakingRateValue(
  assessment: VoiceQualityAssessment,
): number {
  if (
    typeof assessment.speakingRate?.wordsPerMinute === "number" &&
    assessment.speakingRate.wordsPerMinute > 0
  ) {
    const wpm = assessment.speakingRate.wordsPerMinute;
    if (wpm >= 130 && wpm <= 150) return 85;
    if (wpm >= 120 && wpm <= 160) return 70;
    if (wpm >= 100 && wpm <= 180) return 55;
    return Math.max(20, Math.min(100, Math.round((wpm / 200) * 100)));
  }
  return clamp(Math.round((assessment.speakingRate?.score ?? 5) * 10), 0, 100);
}

function buildFillersValue(assessment: VoiceQualityAssessment): number {
  if (typeof assessment.fillerWords?.count === "number") {
    const count = assessment.fillerWords.count;
    if (count <= 2) return 10;
    if (count <= 5) return 25;
    if (count <= 8) return 45;
    if (count <= 12) return 65;
    if (count <= 20) return 85;
    return 100;
  }
  return clamp(
    Math.round((assessment.fillerWords?.score ?? 5) * 10),
    0,
    100,
  );
}
