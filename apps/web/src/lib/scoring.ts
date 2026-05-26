import type {
  ServiceType,
  ServiceWeight,
  QAIndicator,
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
