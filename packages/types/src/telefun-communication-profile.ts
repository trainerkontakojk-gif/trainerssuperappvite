import type {
  CommunicationMetricMode,
  CommunicationMetric,
  TelefunCommunicationProfile,
  VoiceQualityAssessment,
} from "./telefun-assessment";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const BENCHMARK_DEFAULTS: Record<
  CommunicationMetric["key"],
  {
    benchmarkValue: number;
    evaluationMode: CommunicationMetricMode;
    idealMin?: number;
    idealMax?: number;
    goodMin?: number;
    goodMax?: number;
    label: string;
  }
> = {
  speakingRate: {
    benchmarkValue: 70,
    evaluationMode: "optimal_range",
    idealMin: 60,
    idealMax: 80,
    goodMin: 50,
    goodMax: 90,
    label: "Speaking Rate",
  },
  intonation: {
    benchmarkValue: 80,
    evaluationMode: "higher_better",
    goodMin: 75,
    label: "Intonation",
  },
  articulation: {
    benchmarkValue: 90,
    evaluationMode: "higher_better",
    goodMin: 75,
    label: "Articulation",
  },
  fillers: {
    benchmarkValue: 80,
    evaluationMode: "higher_better",
    goodMin: 80,
    label: "Fillers",
  },
  tone: {
    benchmarkValue: 85,
    evaluationMode: "higher_better",
    goodMin: 75,
    label: "Tone",
  },
};

export const TELEFUN_QA_TARGETS = {
  speakingRate: { targetScore: 70, idealWpmMin: 130, idealWpmMax: 150 },
  intonation: { targetScore: 80 },
  articulation: { targetScore: 90 },
  fillers: { targetScore: 80, goodCountMax: 3 },
  tone: { targetScore: 85 },
} as const;

export function normalizeSpeakingRateScore(
  wpm: number | null | undefined,
): number | null {
  if (typeof wpm !== "number" || !Number.isFinite(wpm) || wpm <= 0) return null;
  if (wpm >= 130 && wpm <= 150) return 70;
  const idealCenter = 140;
  const distance = Math.abs(wpm - idealCenter);
  if (distance <= 25)
    return Math.max(50, 70 - Math.round((distance - 10) * 1.2));
  if (distance <= 50)
    return Math.max(30, 50 - Math.round((distance - 25) * 0.8));
  return Math.max(10, 30 - Math.round((distance - 50) * 0.25));
}

export function normalizeFillerDisplayScore(
  count: number | null | undefined,
): number | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
    return null;
  if (count === 0) return 100;
  if (count === 1) return 90;
  if (count <= 3) return 80;
  if (count <= 5) return 60;
  if (count <= 8) return 40;
  if (count <= 11) return 20;
  return 10;
}

export function getMetricStatus(
  displayScore: number,
  targetScore: number,
): "good" | "needs_improvement" | "poor" {
  const distance = Math.abs(displayScore - targetScore);
  if (distance <= 10) return "good";
  if (distance <= 25) return "needs_improvement";
  return "poor";
}

export function evaluateMetricStatus(
  value: number,
  mode: CommunicationMetricMode,
  benchmark: {
    goodMin?: number;
    goodMax?: number;
    idealMin?: number;
    idealMax?: number;
  },
): "good" | "needs_improvement" | "poor" {
  const c = clamp(value, 0, 100);

  switch (mode) {
    case "higher_better":
      if (c >= (benchmark.goodMin ?? 75)) return "good";
      if (c >= 50) return "needs_improvement";
      return "poor";

    case "lower_better":
      if (c <= (benchmark.goodMax ?? 30)) return "good";
      if (c <= 50) return "needs_improvement";
      return "poor";

    case "optimal_range":
      if (
        benchmark.idealMin !== undefined &&
        benchmark.idealMax !== undefined
      ) {
        if (c >= benchmark.idealMin && c <= benchmark.idealMax) return "good";
      }
      if (benchmark.goodMin !== undefined && benchmark.goodMax !== undefined) {
        if (c >= benchmark.goodMin && c <= benchmark.goodMax)
          return "needs_improvement";
      }
      return "poor";

    default:
      return "needs_improvement";
  }
}

export function generateExplanation(
  key: CommunicationMetric["key"],
  value: number,
  modeOrStatus: CommunicationMetricMode | "good" | "needs_improvement" | "poor",
  benchmark?: {
    idealMin?: number;
    idealMax?: number;
    goodMin?: number;
    goodMax?: number;
  },
): string {
  let status: "good" | "needs_improvement" | "poor";
  if (
    modeOrStatus === "good" ||
    modeOrStatus === "needs_improvement" ||
    modeOrStatus === "poor"
  ) {
    status = modeOrStatus;
  } else {
    status = evaluateMetricStatus(value, modeOrStatus, benchmark || {});
  }

  const def = BENCHMARK_DEFAULTS[key];
  if (status === "good") {
    if (key === "fillers")
      return `${def.label} Anda sangat minim, pertahankan.`;
    if (key === "speakingRate")
      return `${def.label} Anda berada di rentang ideal.`;
    return `${def.label} Anda sudah sangat baik.`;
  }
  if (status === "needs_improvement") {
    if (key === "fillers")
      return `${def.label} Anda masih ada, namun belum berlebihan. Kurangi lagi agar lebih profesional.`;
    if (key === "speakingRate")
      return `${def.label} Anda mendekati rentang ideal.`;
    return `${def.label} Anda cukup baik, namun masih dapat ditingkatkan.`;
  }

  if (key === "fillers")
    return `${def.label} Anda terlalu sering muncul, perlu dikurangi secara sadar.`;
  if (key === "speakingRate")
    return `${def.label} Anda di luar rentang ideal, perlu penyesuaian.`;
  return `${def.label} Anda perlu perbaikan signifikan.`;
}

export function generateImprovementTip(
  key: CommunicationMetric["key"],
  status: string,
): string | undefined {
  if (status === "good") return undefined;

  const tips: Record<CommunicationMetric["key"], string> = {
    speakingRate:
      "Latih tempo bicara 130-150 WPM. Gunakan jeda alami antar kalimat.",
    intonation:
      "Variasikan nada tinggi-rendah. Hindari bicara datar seperti membaca.",
    articulation:
      "Latih pengucapan kata-kata sulit. Buka mulut lebih lebar saat bicara.",
    fillers:
      "Ganti 'eh', 'anu', 'gitu' dengan jeda senyap. Sadari kebiasaan Anda.",
    tone: "Tunjukkan empati lewat nada suara. Sesuaikan emosi dengan konteks percakapan.",
  };

  return tips[key];
}

function getAspectScore(
  assessment: VoiceQualityAssessment,
  key: CommunicationMetric["key"],
): {
  score: number;
  verdict: string;
  feedback: string;
} {
  const fallback = {
    score: 0,
    verdict: "Belum tersedia",
    feedback: "Feedback belum tersedia.",
  };
  switch (key) {
    case "speakingRate":
      return assessment.speakingRate ?? fallback;
    case "intonation":
      return assessment.intonation ?? fallback;
    case "articulation":
      return assessment.articulation ?? fallback;
    case "fillers":
      return assessment.fillerWords ?? fallback;
    case "tone":
      return assessment.emotionalTone ?? fallback;
  }
}

function getTargetDirection(
  key: CommunicationMetric["key"],
): CommunicationMetric["targetDirection"] {
  if (key === "fillers") return "lower_raw_is_better";
  if (key === "speakingRate") return "match_target";
  return "higher_quality";
}

export function buildCommunicationProfileFromAssessment(
  assessment: VoiceQualityAssessment | null,
): TelefunCommunicationProfile | null {
  if (!assessment) return null;

  const metrics: CommunicationMetric[] = (
    Object.keys(BENCHMARK_DEFAULTS) as CommunicationMetric["key"][]
  ).map((key) => {
    const def = BENCHMARK_DEFAULTS[key];
    const targetScore = def.benchmarkValue;
    const aspect = getAspectScore(assessment, key);

    let displayScore = 50;
    let rawValue: number | string | undefined = undefined;
    let rawUnit: CommunicationMetric["rawUnit"] = undefined;

    if (key === "speakingRate") {
      rawValue = assessment.speakingRate?.wordsPerMinute;
      rawUnit = "WPM";
      const normScore = normalizeSpeakingRateScore(rawValue);
      if (normScore !== null) {
        displayScore = normScore;
      } else {
        displayScore = clamp(
          Math.round((assessment.speakingRate?.score ?? 5) * 10),
          0,
          100,
        );
      }
    } else if (key === "fillers") {
      rawValue = assessment.fillerWords?.count;
      rawUnit = "filler_words";
      const normScore = normalizeFillerDisplayScore(rawValue);
      if (normScore !== null) {
        displayScore = normScore;
      } else {
        displayScore = clamp(
          Math.round((assessment.fillerWords?.score ?? 5) * 10),
          0,
          100,
        );
      }
    } else if (key === "intonation") {
      displayScore = clamp(
        Math.round((assessment.intonation?.score ?? 5) * 10),
        0,
        100,
      );
    } else if (key === "articulation") {
      displayScore = clamp(
        Math.round((assessment.articulation?.score ?? 5) * 10),
        0,
        100,
      );
    } else if (key === "tone") {
      rawValue = assessment.emotionalTone?.dominant;
      rawUnit = "dominant_tone";
      displayScore = clamp(
        Math.round((assessment.emotionalTone?.score ?? 5) * 10),
        0,
        100,
      );
    }

    const status = evaluateMetricStatus(displayScore, def.evaluationMode, def);
    const explanation = generateExplanation(key, displayScore, status);
    const improvementTip = generateImprovementTip(key, status);

    return {
      key,
      label: def.label,
      value: displayScore,
      benchmarkValue: targetScore,
      score: clamp(aspect.score ?? 0, 0, 10),
      displayScore,
      targetScore,
      targetDirection: getTargetDirection(key),
      rawValue,
      rawUnit,
      evaluationMode: def.evaluationMode,
      verdict: aspect.verdict,
      status,
      feedback: aspect.feedback,
      explanation,
      ...(improvementTip ? { improvementTip } : {}),
    };
  });

  const strengths = metrics
    .filter((m) => m.status === "good")
    .map((m) => `${m.label}: ${m.explanation}`);
  const improvementPriorities = metrics
    .filter((m) => m.status !== "good")
    .sort((a, b) => {
      const order: Record<string, number> = {
        poor: 0,
        needs_improvement: 1,
      };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    })
    .map((m) => `${m.label}: ${m.explanation}`);

  const goodCount = metrics.filter((m) => m.status === "good").length;
  const total = metrics.length;

  return {
    metrics,
    overallSummary:
      goodCount === total
        ? "Profil komunikasi Anda sangat baik di seluruh aspek. Pertahankan konsistensi ini."
        : goodCount >= 3
          ? `Profil komunikasi Anda cukup baik (${goodCount}/${total} aspek). Fokus pada perbaikan aspek yang masih di bawah target.`
          : `Profil komunikasi Anda perlu perbaikan signifikan (${goodCount}/${total} aspek). Gunakan tips perbaikan untuk setiap aspek.`,
    strengths:
      strengths.length > 0
        ? strengths
        : [
            "Belum ada kekuatan yang menonjol. Fokus pada perbaikan terlebih dahulu.",
          ],
    improvementPriorities,
  };
}

export function enrichAssessmentWithCommunicationProfile(
  assessment: VoiceQualityAssessment,
): VoiceQualityAssessment {
  const profile = assessment.communicationProfile;
  const expectedMetricKeys = Object.keys(
    BENCHMARK_DEFAULTS,
  ) as CommunicationMetric["key"][];
  const profileMetricKeys = profile?.metrics.map((metric) => metric.key) ?? [];
  const hasCanonicalMetricSet =
    profileMetricKeys.length === expectedMetricKeys.length &&
    new Set(profileMetricKeys).size === expectedMetricKeys.length &&
    expectedMetricKeys.every((key) => profileMetricKeys.includes(key));
  const isValid =
    profile &&
    Array.isArray(profile.metrics) &&
    hasCanonicalMetricSet &&
    profile.metrics.every(
      (m) =>
        BENCHMARK_DEFAULTS[m.key]?.benchmarkValue === m.targetScore &&
        typeof m.score === "number" &&
        Number.isFinite(m.score) &&
        typeof m.displayScore === "number" &&
        Number.isFinite(m.displayScore) &&
        typeof m.targetScore === "number" &&
        Number.isFinite(m.targetScore) &&
        typeof m.targetDirection === "string" &&
        typeof m.verdict === "string" &&
        typeof m.feedback === "string",
    );

  if (isValid) return assessment;

  const newProfile = buildCommunicationProfileFromAssessment(assessment);
  return { ...assessment, communicationProfile: newProfile };
}
