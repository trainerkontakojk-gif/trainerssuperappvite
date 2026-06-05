import React, { Suspense } from "react";
import type {
  CommunicationMetric,
  TelefunCommunicationProfile,
} from "@trainers/types";

interface VoiceRadarDatum {
  key: CommunicationMetric["key"];
  subject: string;
  label: string;
  userValue: number;
  targetValue: number;
  fullMark: 100;
  evaluationMode: CommunicationMetric["evaluationMode"];
}

export interface VoiceRadarChartProps {
  profile: TelefunCommunicationProfile;
  compact?: boolean;
}

const AXIS_META: Record<
  CommunicationMetric["key"],
  { label: string; directionHint: string }
> = {
  speakingRate: { label: "Speaking Rate", directionHint: "ideal stabil" },
  intonation: { label: "Intonation", directionHint: "semakin tinggi" },
  articulation: { label: "Articulation", directionHint: "semakin tinggi" },
  fillers: { label: "Fillers", directionHint: "semakin rendah" },
  tone: { label: "Tone", directionHint: "semakin tinggi" },
};

export function buildVoiceRadarData(
  profile: TelefunCommunicationProfile,
): VoiceRadarDatum[] {
  return profile.metrics.map((metric) => ({
    key: metric.key,
    subject: metric.key,
    label:
      metric.key === "fillers"
        ? "Fillers (↓)"
        : (AXIS_META[metric.key]?.label ?? metric.label),
    userValue: metric.displayScore ?? metric.value,
    targetValue: metric.targetScore ?? metric.benchmarkValue,
    fullMark: 100,
    evaluationMode: metric.evaluationMode,
  }));
}

const LazyVoiceRadarChartInner = React.lazy(
  () => import("./VoiceRadarChartInner"),
);

const ChartFallback: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div
    className={`flex items-center justify-center ${compact ? "h-[220px]" : "h-[380px]"} w-full min-w-0 text-sm text-muted-foreground`}
  >
    Memuat grafik...
  </div>
);

export const VoiceRadarChart: React.FC<VoiceRadarChartProps> = (props) => {
  return (
    <Suspense fallback={<ChartFallback compact={props.compact} />}>
      <LazyVoiceRadarChartInner
        profile={props.profile}
        compact={props.compact}
      />
    </Suspense>
  );
};
