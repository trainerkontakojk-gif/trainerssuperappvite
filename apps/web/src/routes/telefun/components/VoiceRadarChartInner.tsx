import React, { useState, useEffect, useRef } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TelefunCommunicationProfile } from "@trainers/types";
import { buildVoiceRadarData } from "./VoiceRadarChart";

interface VoiceRadarChartInnerProps {
  profile: TelefunCommunicationProfile;
  compact?: boolean;
}

const VoiceRadarChartInner: React.FC<VoiceRadarChartInnerProps> = ({
  profile,
  compact = false,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            setMeasuredWidth(w);
          }
        }
      });
      ro.observe(el);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setMeasuredWidth(w);
      }
      return () => ro.disconnect();
    } else {
      setMeasuredWidth(el.clientWidth || 1);
    }
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

  const chartData = buildVoiceRadarData(profile);

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

  return (
    <div className="flex flex-col items-center w-full">
      <div
        ref={wrapperRef}
        className="relative w-full min-w-0 overflow-hidden"
        style={{ height, minHeight: height }}
      >
        {measuredWidth > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius={outerRadius}
              data={chartData}
            >
              <PolarGrid stroke="#94a3b8" strokeOpacity={0.2} />
              <PolarAngleAxis
                dataKey="subject"
                tick={({ payload, x, y, cx, cy }: any) => {
                  const metric = chartData.find((d) => d.key === payload.value);
                  return (
                    <text
                      x={x}
                      y={y}
                      textAnchor={x > cx ? "start" : x < cx ? "end" : "middle"}
                      fill="#64748b"
                      fontSize={tickFontSize}
                      fontWeight={700}
                      dy={y > cy ? 10 : -4}
                    >
                      {metric?.label ?? payload.value}
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
                dataKey="targetValue"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.08}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              <Radar
                name="Hasil Anda"
                dataKey="userValue"
                stroke="#2563eb"
                fill="#2563eb"
                fillOpacity={0.22}
                strokeWidth={2}
              />
              <Legend content={renderLegend} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height }} />
        )}
      </div>
      {!compact && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1 w-full text-center">
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            Diagram membandingkan hasil Anda (biru) dengan target QA (hijau).
          </p>
          <p>
            Empat aspek (Speaking Rate, Intonation, Articulation, Tone): skor
            biru <strong>mendekati</strong> target hijau = semakin baik
            (terlalu rendah maupun terlalu tinggi kurang baik — deviasi absolut
            terhadap target yang dinilai). Khusus Fillers
            (↓): skor biru{" "}
            <strong>di bawah</strong> hijau = baik (semakin sedikit kata
            pengisi semakin baik). Angka pada sumbu hanya koordinat visual,
            bukan skor akhir.
          </p>
        </div>
      )}
    </div>
  );
};

export default VoiceRadarChartInner;
