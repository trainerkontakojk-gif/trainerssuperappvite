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
    evaluationMode: "optimal_range",
    idealMin: 70,
    idealMax: 90,
    goodMin: 55,
    goodMax: 100,
    label: "Intonation",
  },
  articulation: {
    benchmarkValue: 90,
    evaluationMode: "optimal_range",
    idealMin: 80,
    idealMax: 100,
    goodMin: 65,
    goodMax: 100,
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
    evaluationMode: "optimal_range",
    idealMin: 75,
    idealMax: 95,
    goodMin: 60,
    goodMax: 100,
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

export const FILLER_TARGET_COUNT = 3;
export const FILLER_RADAR_MAX_COUNT = 15;

export function mapFillerCountToRadarBurden(
  count: number | null | undefined,
): number | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
    return null;
  return Math.min(100, Math.round((count / FILLER_RADAR_MAX_COUNT) * 100));
}

export function evaluateFillerCountStatus(
  count: number | null | undefined,
): "good" | "needs_improvement" | "poor" {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
    return "poor";
  if (count <= FILLER_TARGET_COUNT) return "good";
  if (count <= 5) return "needs_improvement";
  return "poor";
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
  rawCount?: number,
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
    if (key === "fillers") {
      const c = typeof rawCount === "number" ? rawCount : null;
      if (c === 0) return `Tidak ada kata pengisi terdeteksi. Pertahankan.`;
      return `${c} kata pengisi terdeteksi (target maksimal ${FILLER_TARGET_COUNT}). Baik, pertahankan.`;
    }
    if (key === "speakingRate")
      return `${def.label} Anda berada di rentang ideal.`;
    if (def.evaluationMode === "optimal_range")
      return `${def.label} Anda mendekati target ideal.`;
    return `${def.label} Anda sudah sangat baik.`;
  }
  if (status === "needs_improvement") {
    if (key === "fillers") {
      const c = typeof rawCount === "number" ? rawCount : null;
      return `${c} kata pengisi terdeteksi. Masih wajar, namun kurangi lagi agar lebih profesional (target maksimal ${FILLER_TARGET_COUNT}).`;
    }
    if (key === "speakingRate")
      return `${def.label} Anda mendekati rentang ideal.`;
    if (def.evaluationMode === "optimal_range")
      return `${def.label} Anda cukup mendekati target, namun jaraknya masih bisa dikurangi.`;
    return `${def.label} Anda cukup baik, namun masih dapat ditingkatkan.`;
  }

  if (key === "fillers") {
    const c = typeof rawCount === "number" ? rawCount : null;
    return `${c} kata pengisi terdeteksi — terlalu sering. Sadari kebiasaan dan ganti dengan jeda senyap.`;
  }
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

/**
 * Evaluasi Edukatif Telefun — deterministic drill per metric (rule-based
 * backend; never AI-generated). Parametrized by TELEFUN_QA_TARGETS values.
 */
export function generateDrill(
  key: CommunicationMetric["key"],
  status: string,
): string | undefined {
  if (status === "good") return undefined;

  const drills: Record<CommunicationMetric["key"], string> = {
    speakingRate:
      "Latihan tempo: baca naskah 2 menit dengan target 130-150 WPM, jeda ±1 detik antar kalimat. Rekam dan hitung ulang WPM.",
    intonation:
      "Latihan intonasi: baca kalimat yang sama 3x — datar, penekanan kata kunci, lalu ekspresif. Bandingkan rekamannya.",
    articulation:
      "Latihan artikulasi: ucapkan tongue twister dan istilah produk (restrukturisasi, anuitas) perlahan lalu normal, 5 repetisi.",
    fillers:
      "Latihan filler: saat tergoda mengatakan 'eh/anu', tahan dan ganti dengan jeda senyap 1 detik. Latih 10 menit per hari.",
    tone:
      "Latihan empati: ulangi kalimat empatis dengan nada turun-naik yang hangat sebelum melayani panggilan sungguhan.",
  };

  return drills[key];
}

/** Deterministic example phrase per metric — rule-based, bukan dari AI. */
export const TELEFUN_EXAMPLE_PHRASES: Record<
  CommunicationMetric["key"],
  string
> = {
  speakingRate:
    "Bapak/Ibu, berdasarkan informasi yang kami terima, ada beberapa hal yang perlu kami jelaskan.",
  intonation: "Saya memahami kondisi yang Bapak/Ibu sampaikan.",
  articulation:
    "Pengajuan restrukturisasi dapat disampaikan kepada pihak perusahaan pembiayaan.",
  fillers: "Baik, saya cek terlebih dahulu informasinya.",
  tone: "Saya memahami situasi ini cukup mengkhawatirkan bagi Bapak/Ibu.",
};

/** Coaching layer version — bump when drill/examplePhrase rules change. */
export const TELEFUN_COACHING_VERSION = 1;

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
  // All metrics besides fillers use target-ideal semantics (match_target)
  return "match_target";
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
      const burden = mapFillerCountToRadarBurden(rawValue);
      displayScore = burden ?? 50;
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

    const status =
      key === "fillers"
        ? evaluateFillerCountStatus(rawValue as number)
        : getMetricStatus(displayScore, targetScore);
    const explanation = generateExplanation(key, displayScore, status, def, rawValue as number);
    const improvementTip = generateImprovementTip(key, status);
    const drill = generateDrill(key, status);

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
      ...(key === "fillers"
        ? { examples: assessment.fillerWords?.examples ?? [] }
        : {}),
      ...(improvementTip ? { improvementTip } : {}),
      ...(drill ? { drill } : {}),
      examplePhrase: TELEFUN_EXAMPLE_PHRASES[key],
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
    coachingVersion: TELEFUN_COACHING_VERSION,
    overallSummary:
      goodCount === total
        ? "Profil komunikasi Anda sangat baik di seluruh aspek. Pertahankan konsistensi ini."
        : goodCount >= 3
          ? `Profil komunikasi Anda cukup baik (${goodCount}/${total} aspek). Fokus pada perbaikan aspek yang belum mendekati target.`
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

/** Derive the top-3 practice priorities from a profile — deterministic. */
export function deriveOverallNextSteps(
  profile: TelefunCommunicationProfile | null | undefined,
): string[] {
  if (!profile) return [];
  const priorities = profile.improvementPriorities.filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  );
  if (priorities.length > 0) return priorities.slice(0, 3);
  // All metrics good — reinforce strengths instead.
  return profile.strengths.slice(0, 1);
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
        typeof m.feedback === "string" &&
        // Rebuild if target direction or evaluation mode changed
        m.targetDirection === getTargetDirection(m.key) &&
        m.evaluationMode === BENCHMARK_DEFAULTS[m.key].evaluationMode &&
        // Rebuild if status does not match current formula
        (m.key === "fillers"
          ? evaluateFillerCountStatus(m.rawValue as number) === m.status
          : getMetricStatus(m.displayScore, m.targetScore) === m.status) &&
        // Force rebuild for fillers with old inverted score
        (m.key !== "fillers" ||
          (typeof m.rawValue === "number"
            ? m.displayScore === mapFillerCountToRadarBurden(m.rawValue)
            : false)) &&
        // Evaluasi Edukatif: legacy coaching without drill/examplePhrase is
        // rebuilt automatically (no AI rerun needed).
        profile.coachingVersion === TELEFUN_COACHING_VERSION &&
        profile.metrics.every(
          (m) =>
            typeof m.examplePhrase === "string" &&
            m.examplePhrase.length > 0 &&
            (m.status === "good" ||
              (typeof m.drill === "string" && m.drill.length > 0)),
        ),
    );

  if (isValid)
    return {
      ...assessment,
      overallNextSteps: deriveOverallNextSteps(profile),
    };

  const newProfile = buildCommunicationProfileFromAssessment(assessment);
  return {
    ...assessment,
    communicationProfile: newProfile,
    overallNextSteps: deriveOverallNextSteps(newProfile),
  };
}
