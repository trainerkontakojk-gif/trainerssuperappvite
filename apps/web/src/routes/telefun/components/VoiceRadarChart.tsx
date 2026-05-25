import React, { useState, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { VoiceQualityAssessment } from "@trainers/types";

interface VoiceRadarChartProps {
  assessment: VoiceQualityAssessment;
}

export const VoiceRadarChart: React.FC<VoiceRadarChartProps> = ({
  assessment,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const data = [
    {
      subject: "Speaking Rate",
      A: assessment.speakingRate.score,
      fullMark: 10,
    },
    {
      subject: "Intonation",
      A: assessment.intonation.score,
      fullMark: 10,
    },
    {
      subject: "Articulation",
      A: assessment.articulation.score,
      fullMark: 10,
    },
    {
      subject: "Fillers",
      A: assessment.fillerWords.score,
      fullMark: 10,
    },
    {
      subject: "Emotional Tone",
      A: assessment.emotionalTone.score,
      fullMark: 10,
    },
  ];

  if (!mounted) {
    return <div className="h-[300px] w-full min-w-0 min-h-0" />;
  }

  return (
    <div className="h-[300px] w-full min-w-0 min-h-0">
      <ResponsiveContainer width="100%" height="100%" minHeight={0}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#94a3b8" strokeOpacity={0.2} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 10]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="Voice Quality"
            dataKey="A"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

