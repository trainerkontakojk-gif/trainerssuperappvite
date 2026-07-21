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
  rawLabel?: string;
  direction?: "higher_better" | "lower_better";
}

const FILLERS_RADAR_TARGET_GUIDE_VALUE = 20;

export interface VoiceRadarChartProps {
  profile: TelefunCommunicationProfile;
  compact?: boolean;
}

const AXIS_META: Record<
  CommunicationMetric["key"],
  { label: string; directionHint: string }
> = {
  speakingRate: { label: "Speaking Rate", directionHint: "mendekati target" },
  intonation: { label: "Intonation", directionHint: "mendekati target" },
  articulation: { label: "Articulation", directionHint: "mendekati target" },
  fillers: { label: "Fillers", directionHint: "panduan rendah" },
  tone: { label: "Tone", directionHint: "mendekati target" },
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
    targetValue:
      metric.key === "fillers"
        ? FILLERS_RADAR_TARGET_GUIDE_VALUE
        : (metric.targetScore ?? metric.benchmarkValue),
    fullMark: 100,
    evaluationMode: metric.evaluationMode,
    rawLabel:
      metric.key === "fillers" && metric.rawValue !== undefined
        ? `${metric.rawValue} kata pengisi`
        : undefined,
    direction:
      metric.key === "fillers" ? "lower_better" : "higher_better",
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
