import type {
  CommunicationMetric,
  TelefunTranscriptEntry,
  TelefunContentReview,
  TelefunConsumerPoint,
  VoiceQualityAssessment,
} from "@trainers/types";
import { getCommunicationProfileFromAssessment } from "../../../lib/voiceAssessmentUtils";
import type { CallRecord } from "../types";
import {
  firstFillerLine,
  type TelefunAspect,
  formatTelefunScore,
  readTelefunAspects,
  readTelefunScore,
} from "./reviewDisplay";

function scoreChange(score: number, previous: number | null): string | null {
  if (previous === null) return null;
  const delta = Math.round((score - previous) * 10) / 10;
  if (delta > 0)
    return `naik ${formatTelefunScore(delta)} dari panggilan sebelumnya`;
  if (delta < 0)
    return `turun ${formatTelefunScore(-delta)} dari panggilan sebelumnya`;
  return "sama dengan panggilan sebelumnya";
}

export function buildTelefunReviewView(
  record: CallRecord,
  assessment: VoiceQualityAssessment,
  previous: number | null,
) {
  const content: TelefunContentReview | null | undefined =
    assessment.contentReview;
  const score = readTelefunScore(record) ?? assessment.overallScore;
  const aspects = readTelefunAspects(assessment);
  const profile = getCommunicationProfileFromAssessment(assessment);
  const toFix =
    content?.agentNotes.filter((note) => note.verdict === "fix") ?? [];
  const good =
    content?.agentNotes.filter((note) => note.verdict === "good") ?? [];
  const nextSteps = assessment.overallNextSteps ?? [];
  const change = scoreChange(score, previous);
  return { content, score, aspects, profile, toFix, good, nextSteps, change };
}

export function orderedConsumerPoints(points: readonly TelefunConsumerPoint[]) {
  const order = { unanswered: 0, partial: 1, answered: 2 };
  return points
    .map((point, index) => ({ point, index }))
    .sort(
      (a, b) =>
        order[a.point.status] - order[b.point.status] || a.index - b.index,
    );
}

const PROFILE_KEY: Partial<
  Record<TelefunAspect["key"], CommunicationMetric["key"]>
> = {
  speakingRate: "speakingRate",
  intonation: "intonation",
  articulation: "articulation",
  fillerWords: "fillers",
  emotionalTone: "tone",
};

export function buildTelefunScoreDetails(
  assessment: VoiceQualityAssessment,
  transcript: readonly TelefunTranscriptEntry[],
) {
  const aspects = readTelefunAspects(assessment);
  const profile = getCommunicationProfileFromAssessment(assessment);
  const fillerLine = firstFillerLine(
    transcript,
    assessment.fillerWords.examples,
  );
  const metricOf = (aspect: TelefunAspect) => {
    const key = PROFILE_KEY[aspect.key];
    return key
      ? profile?.metrics.find((metric) => metric.key === key)
      : undefined;
  };
  return aspects.map((aspect) => {
    const metric = metricOf(aspect);
    const line = aspect.key === "fillerWords" ? fillerLine : null;
    const tip =
      metric?.improvementTip ??
      metric?.drill ??
      (aspect.key === "holdManagement"
        ? assessment.holdManagement?.drill
        : undefined);
    return { aspect, metric, line, tip };
  });
}

export const TELEFUN_PROFILE_AXES: readonly {
  key: CommunicationMetric["key"];
  label: string;
}[] = [
  { key: "speakingRate", label: "Kecepatan bicara" },
  { key: "intonation", label: "Intonasi" },
  { key: "articulation", label: "Artikulasi" },
  { key: "fillers", label: "Filler" },
  { key: "tone", label: "Nada emosi" },
];
