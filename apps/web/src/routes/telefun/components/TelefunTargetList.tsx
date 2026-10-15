import {
  FILLER_TARGET_COUNT,
  TELEFUN_QA_TARGETS,
  type CommunicationMetric,
  type TelefunCommunicationProfile,
} from "@trainers/types";
import { cn } from "cn";
import { formatTelefunScore } from "../utils/reviewDisplay";

/**
 * Profil komunikasi sebagai daftar "Target vs hasil": tiap aspek dalam
 * satuan aslinya, dengan pita target dan penanda hasil. Pengganti radar.
 */

const STATUS: Record<
  CommunicationMetric["status"],
  { label: string; dot: string }
> = {
  good: { label: "Baik", dot: "bg-chart-green" },
  needs_improvement: { label: "Cukup", dot: "bg-chart-amber" },
  poor: { label: "Kurang", dot: "bg-chart-red" },
};

const LABEL: Record<CommunicationMetric["key"], string> = {
  speakingRate: "Kecepatan bicara",
  intonation: "Intonasi",
  articulation: "Artikulasi",
  fillers: "Filler",
  tone: "Nada emosi",
};

const RATE_SCALE = { min: 80, max: 200 } as const;
const FILLER_SCALE_MAX = 15;
/** Sama dengan `getMetricStatus`: ±10 dari target (skala 0–100) = Baik. */
const SCORE_BAND = 1;

interface TargetRow {
  value: string;
  target: string;
  /** Skala strip, pita target, dan posisi hasil dalam satuan yang sama. */
  scale: { min: number; max: number };
  band: { from: number; to: number };
  marker: number | null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function targetRow(metric: CommunicationMetric): TargetRow {
  if (metric.key === "speakingRate") {
    const wpm = readNumber(metric.rawValue);
    const { idealWpmMin, idealWpmMax } = TELEFUN_QA_TARGETS.speakingRate;
    return {
      value: wpm !== null ? `${Math.round(wpm)} kata/menit` : "–",
      target: `ideal ${idealWpmMin}–${idealWpmMax}`,
      scale: RATE_SCALE,
      band: { from: idealWpmMin, to: idealWpmMax },
      marker: wpm,
    };
  }
  if (metric.key === "fillers") {
    const count = readNumber(metric.rawValue);
    return {
      value: count !== null ? `${count} filler` : "–",
      target: `maks ${FILLER_TARGET_COUNT}`,
      scale: { min: 0, max: FILLER_SCALE_MAX },
      band: { from: 0, to: FILLER_TARGET_COUNT },
      marker: count,
    };
  }
  const target = metric.targetScore / 10;
  const from = Math.max(0, target - SCORE_BAND);
  const to = Math.min(10, target + SCORE_BAND);
  const tone =
    metric.key === "tone" && typeof metric.rawValue === "string"
      ? ` · ${metric.rawValue}`
      : "";
  return {
    value: `${formatTelefunScore(metric.score)} / 10${tone}`,
    target: `target ${formatTelefunScore(from)}–${formatTelefunScore(to)}`,
    scale: { min: 0, max: 10 },
    band: { from, to },
    marker: metric.score,
  };
}

function percent(value: number, scale: { min: number; max: number }): number {
  const ratio = (value - scale.min) / (scale.max - scale.min);
  return Math.max(0, Math.min(100, ratio * 100));
}

export function TelefunTargetList({
  profile,
}: {
  profile: TelefunCommunicationProfile;
}) {
  return (
    <ul aria-label="Target vs hasil" className="flex flex-col gap-4">
      {profile.metrics.map((metric) => {
        const row = targetRow(metric);
        const status = STATUS[metric.status];
        const bandStart = percent(row.band.from, row.scale);
        const bandEnd = percent(row.band.to, row.scale);
        return (
          <li key={metric.key} className="flex flex-col gap-1.5 text-[13px]">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-foreground">
                {LABEL[metric.key]}
              </span>
              <span className="font-mono text-foreground tabular-nums">
                {row.value}
              </span>
              <span className="text-muted-foreground">· {row.target}</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", status.dot)}
                />
                {status.label}
              </span>
            </p>
            <span
              aria-hidden="true"
              className="relative h-2 rounded-full bg-surface-sunken"
            >
              <span
                className="absolute inset-y-0 rounded-full bg-chart-green/30"
                style={{
                  left: `${bandStart}%`,
                  width: `${bandEnd - bandStart}%`,
                }}
              />
              {row.marker !== null && (
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
                  style={{ left: `${percent(row.marker, row.scale)}%` }}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
