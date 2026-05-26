import type {
  CommunicationMetricMode,
  CommunicationMetric,
  TelefunCommunicationProfile,
  VoiceQualityAssessment,
} from "@trainers/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    benchmarkValue: 85,
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
    benchmarkValue: 20,
    evaluationMode: "lower_better",
    goodMax: 30,
    label: "Fillers",
  },
  tone: {
    benchmarkValue: 88,
    evaluationMode: "higher_better",
    goodMin: 75,
    label: "Tone",
  },
};

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
  const clamped = clamp(value, 0, 100);

  switch (mode) {
    case "higher_better":
      if (clamped >= (benchmark.goodMin ?? 75)) return "good";
      if (clamped >= 50) return "needs_improvement";
      return "poor";

    case "lower_better":
      if (clamped <= (benchmark.goodMax ?? 30)) return "good";
      if (clamped <= 50) return "needs_improvement";
      return "poor";

    case "optimal_range":
      if (
        benchmark.idealMin !== undefined &&
        benchmark.idealMax !== undefined
      ) {
        if (clamped >= benchmark.idealMin && clamped <= benchmark.idealMax)
          return "good";
      }
      if (
        benchmark.goodMin !== undefined &&
        benchmark.goodMax !== undefined
      ) {
        if (clamped >= benchmark.goodMin && clamped <= benchmark.goodMax)
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
  mode: CommunicationMetricMode,
  benchmark: { idealMin?: number; idealMax?: number; goodMin?: number; goodMax?: number },
): string {
  const def = BENCHMARK_DEFAULTS[key];

  switch (mode) {
    case "higher_better":
      if (value >= (benchmark.goodMin ?? 75))
        return `${def.label} Anda sudah sangat baik.`;
      if (value >= 50)
        return `${def.label} Anda cukup baik, namun masih dapat ditingkatkan.`;
      return `${def.label} Anda perlu perbaikan signifikan.`;

    case "lower_better":
      if (value <= (benchmark.goodMax ?? 30))
        return `${def.label} Anda sangat minim, pertahankan.`;
      if (value <= 50)
        return `${def.label} Anda cukup terkendali, namun bisa dikurangi lagi.`;
      return `${def.label} Anda cukup tinggi, perlu dikurangi secara sadar.`;

    case "optimal_range":
      if (
        benchmark.idealMin !== undefined &&
        benchmark.idealMax !== undefined &&
        value >= benchmark.idealMin &&
        value <= benchmark.idealMax
      )
        return `${def.label} Anda berada di rentang ideal.`;
      if (
        benchmark.goodMin !== undefined &&
        benchmark.goodMax !== undefined &&
        value >= benchmark.goodMin &&
        value <= benchmark.goodMax
      )
        return `${def.label} Anda mendekati rentang ideal.`;
      return `${def.label} Anda di luar rentang ideal, perlu penyesuaian.`;

    default:
      return `Nilai ${def.label} adalah ${value}/100.`;
  }
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
    tone:
      "Tunjukkan empati lewat nada suara. Sesuaikan emosi dengan konteks percakapan.",
  };

  return tips[key];
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
  return Math.min(100, Math.round((assessment.speakingRate?.score ?? 5) * 10));
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
  return Math.min(100, Math.max(0, Math.round(assessment.fillerWords?.score ?? 5) * 10));
}

function buildToneValue(assessment: VoiceQualityAssessment): number {
  return Math.min(100, Math.round((assessment.emotionalTone?.score ?? 5) * 10));
}

export function buildCommunicationProfileFromAssessment(
  assessment: VoiceQualityAssessment | null,
): TelefunCommunicationProfile | null {
  if (!assessment) return null;

  const rawValues: Partial<Record<CommunicationMetric["key"], number>> = {
    speakingRate: buildSpeakingRateValue(assessment),
    intonation: Math.min(100, Math.round((assessment.intonation?.score ?? 5) * 10)),
    articulation: Math.min(100, Math.round((assessment.articulation?.score ?? 5) * 10)),
    fillers: buildFillersValue(assessment),
    tone: buildToneValue(assessment),
  };

  const metrics: CommunicationMetric[] = (
    Object.keys(BENCHMARK_DEFAULTS) as CommunicationMetric["key"][]
  ).map((key) => {
    const def = BENCHMARK_DEFAULTS[key];
    const value = clamp(rawValues[key] ?? 50, 0, 100);
    const status = evaluateMetricStatus(value, def.evaluationMode, {
      goodMin: def.goodMin,
      goodMax: def.goodMax,
      idealMin: def.idealMin,
      idealMax: def.idealMax,
    });
    const explanation = generateExplanation(key, value, def.evaluationMode, {
      idealMin: def.idealMin,
      idealMax: def.idealMax,
      goodMin: def.goodMin,
      goodMax: def.goodMax,
    });
    const improvementTip = generateImprovementTip(key, status);

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
      const order: Record<string, number> = { poor: 0, needs_improvement: 1 };
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
        : ["Belum ada kekuatan yang menonjol. Fokus pada perbaikan terlebih dahulu."],
    improvementPriorities,
  };
}

export function enrichAssessmentWithCommunicationProfile(
  assessment: VoiceQualityAssessment,
): VoiceQualityAssessment {
  if (assessment.communicationProfile) return assessment;
  const profile = buildCommunicationProfileFromAssessment(assessment);
  return { ...assessment, communicationProfile: profile };
}
