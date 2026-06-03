import type {
  ServiceType,
  ServiceWeight,
  QAIndicator,
  ScoringMode,
} from "@trainers/types";

export const scoreColor = (score: number) => {
  if (score >= 85) return "text-green-500";
  if (score >= 70) return "text-amber-500";
  return "text-red-500";
};

export const scoreBg = (score: number) => {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
};

export const scoreLabel = (score: number) => {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
};

export const DEFAULT_SERVICE_WEIGHTS: Record<ServiceType, ServiceWeight> = {
  call: {
    service_type: "call",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
  },
  chat: {
    service_type: "chat",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
  },
  email: {
    service_type: "email",
    critical_weight: 0.65,
    non_critical_weight: 0.35,
    scoring_mode: "weighted",
  },
  cso: {
    service_type: "cso",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
  },
  pencatatan: {
    service_type: "pencatatan",
    critical_weight: 0.9,
    non_critical_weight: 0.1,
    scoring_mode: "flat",
  },
  bko: {
    service_type: "bko",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "no_category",
  },
  slik: {
    service_type: "slik",
    critical_weight: 0.6,
    non_critical_weight: 0.4,
    scoring_mode: "weighted",
  },
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

function scoreSession(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number }[],
  weight: ServiceWeight = DEFAULT_SERVICE_WEIGHTS["call"],
): number {
  const getNilai = (ind: QAIndicator) => {
    const t = temuan.find((f) => f.indicator_id === ind.id);
    return t ? t.nilai : 3;
  };

  if (weight.scoring_mode === "flat" || weight.scoring_mode === "no_category") {
    let totalB = 0,
      earnedB = 0;
    indicators.forEach((ind) => {
      totalB += ind.bobot;
      earnedB += (getNilai(ind) / 3) * ind.bobot;
    });
    return totalB === 0 ? 100 : (earnedB / totalB) * 100;
  }

  const calcCat = (cat: "critical" | "non_critical") => {
    const inds = indicators.filter((i) => i.category === cat);
    let total = 0,
      earned = 0;
    inds.forEach((ind) => {
      total += ind.bobot;
      earned += (getNilai(ind) / 3) * ind.bobot;
    });
    return total === 0 ? 100 : (earned / total) * 100;
  };

  return (
    calcCat("non_critical") * weight.non_critical_weight +
    calcCat("critical") * weight.critical_weight
  );
}

export function calculateSessionScoreFromTemuan(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number }[],
  serviceWeight: ServiceWeight = DEFAULT_SERVICE_WEIGHTS["call"],
): number {
  return scoreSession(indicators, temuan, serviceWeight);
}

export const NILAI_LABELS: Record<number, string> = {
  0: "Sangat Tidak Sesuai",
  1: "Tidak Sesuai",
  2: "Perlu Perbaikan",
  3: "Sesuai",
};

export const NILAI_BADGE_COLORS: Record<number, string> = {
  0: "bg-rose-500",
  1: "bg-orange-500",
  2: "bg-amber-500",
  3: "bg-green-500",
};

export function resolveServiceTypeFromTeam(tim?: string | null): string {
  const map: Record<string, string> = {
    Telepon: "call", Chat: "chat", Email: "email",
    Mix: "cso", BKO: "bko", "Tim BKO": "bko", SLIK: "slik",
  };
  return map[tim ?? ""] || "call";
}

export interface QAScoreResult {
  finalScore: number;
  nonCriticalScore: number;
  criticalScore: number;
  sessionCount: number;
  mode: ScoringMode;
}

export function calculateQAScoreFromTemuan(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number; no_tiket?: string | null }[],
  activeWeight: ServiceWeight,
): QAScoreResult | null {
  if (!indicators.length) return null;

  const MAX_SAMPLING = 5;

  const sesiMap = new Map<string, { nilai: number; bobot: number }[]>();
  temuan.forEach((t) => {
    const key = t.no_tiket?.trim() || `__solo_${t.indicator_id}`;
    if (!sesiMap.has(key)) sesiMap.set(key, []);
    const ind = indicators.find((i) => i.id === t.indicator_id);
    sesiMap.get(key)!.push({ nilai: t.nilai, bobot: ind?.bobot ?? 1 });
  });

  if (sesiMap.size === 0) {
    return {
      finalScore: 100, nonCriticalScore: 100, criticalScore: 100,
      sessionCount: 0, mode: activeWeight.scoring_mode,
    };
  }

  const calcCatScore = (cat: "critical" | "non_critical"): number => {
    const catInds = indicators.filter((i) => i.category === cat);
    if (catInds.length === 0) return 100;
    return sesiMap.size > 0 ? (() => {
      const catSes = Array.from(sesiMap.values()).map((items) => {
        let totalB = 0, earnedB = 0;
        catInds.forEach((ind) => {
          const t = items.find((f) => {
            const source = temuan.find((s) => s.indicator_id === ind.id);
            return source && f === items[items.indexOf(items.find(f2 => f2 === f)!)]; 
          });
          const actual = temuan.find((s) => s.indicator_id === ind.id);
          const val = actual ? actual.nilai : 3;
          totalB += ind.bobot;
          earnedB += (val / 3) * ind.bobot;
        });
        return totalB > 0 ? (earnedB / totalB) * 100 : 100;
      });
      const sorted = [...catSes].sort((a, b) => a - b);
      const selected = sorted.slice(0, MAX_SAMPLING);
      const padded = [...selected];
      while (padded.length < MAX_SAMPLING) padded.push(100);
      return padded.reduce((a, b) => a + b, 0) / MAX_SAMPLING;
    })() : 100;
  };

  if (activeWeight.scoring_mode === "weighted") {
    const nc = calcCatScore("non_critical");
    const cr = calcCatScore("critical");
    const final = nc * activeWeight.non_critical_weight + cr * activeWeight.critical_weight;
    return {
      finalScore: Math.round(final),
      nonCriticalScore: Math.round(nc),
      criticalScore: Math.round(cr),
      sessionCount: sesiMap.size,
      mode: "weighted",
    };
  }

  const allScores = Array.from(sesiMap.values()).map((items) => {
    let totalB = 0, earnedB = 0;
    items.forEach((item) => { totalB += item.bobot; earnedB += (item.nilai / 3) * item.bobot; });
    return totalB > 0 ? (earnedB / totalB) * 100 : 100;
  });

  const sorted = [...allScores].sort((a, b) => a - b);
  const selected = sorted.slice(0, MAX_SAMPLING);
  const padded = [...selected];
  while (padded.length < MAX_SAMPLING) padded.push(100);
  const final = padded.reduce((a, b) => a + b, 0) / MAX_SAMPLING;

  return {
    finalScore: Math.round(final),
    nonCriticalScore: Math.round(final),
    criticalScore: Math.round(final),
    sessionCount: sesiMap.size,
    mode: activeWeight.scoring_mode,
  };
}
