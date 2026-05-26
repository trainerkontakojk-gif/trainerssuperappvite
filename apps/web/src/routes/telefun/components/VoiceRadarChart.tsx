import React, { useState, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CommunicationMetric, TelefunCommunicationProfile } from "@trainers/types";

interface VoiceRadarChartProps {
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

export const VoiceRadarChart: React.FC<VoiceRadarChartProps> = ({
  profile,
  compact = false,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!profile.metrics || profile.metrics.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${compact ? "h-[220px]" : "h-[380px]"} w-full min-w-0 text-sm text-slate-400`}
      >
        Data profil komunikasi belum tersedia.
      </div>
    );
  }

  const chartData = profile.metrics.map((m) => ({
    subject: AXIS_META[m.key]?.label ?? m.label,
    [m.label]: m.value,
    benchmark: m.benchmarkValue,
    fullMark: 100,
    key: m.key,
    evaluationMode: m.evaluationMode,
    directionHint: AXIS_META[m.key]?.directionHint ?? "",
  }));

  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex justify-center gap-6 mt-2 text-xs">
        {payload?.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-bold text-slate-600 dark:text-white/70">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const height = compact ? 240 : 380;
  const outerRadius = compact ? "70%" : "75%";
  const tickFontSize = compact ? 10 : 12;

  if (!mounted) {
    return (
      <div
        className={`min-h-0 min-w-0 w-full`}
        style={{ height }}
      />
    );
  }

  return (
    <div className="w-full min-w-0 min-h-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={0}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          data={chartData}
        >
          <PolarGrid stroke="#94a3b8" strokeOpacity={0.2} />
          <PolarAngleAxis
            dataKey="subject"
            tick={({ payload, x, y, cx, cy, ...rest }: any) => {
              const metric = profile.metrics.find(
                (m) => m.label === payload.value,
              );
              const isLowerBetter =
                metric?.evaluationMode === "lower_better";
              return (
                <text
                  x={x}
                  y={y}
                  textAnchor={
                    x > cx ? "start" : x < cx ? "end" : "middle"
                  }
                  fill="#64748b"
                  fontSize={tickFontSize}
                  fontWeight={700}
                  dy={y > cy ? 10 : -4}
                >
                  {payload.value}
                  {isLowerBetter && (
                    <tspan fill="#f59e0b" fontSize={tickFontSize - 2}>
                      {" "}(<tspan fill="#f59e0b" fontSize={tickFontSize - 2}>&darr;</tspan>)
                    </tspan>
                  )}
                </text>
              );
            }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: "#94a3b8", fontSize: 9 }}
            axisLine={false}
            tickCount={5}
          />
          <Radar
            name="Target QA"
            dataKey="benchmark"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.1}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <Radar
            name="Hasil Anda"
            dataKey={(d) => d[d.subject] || 0}
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Legend content={renderLegend} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
