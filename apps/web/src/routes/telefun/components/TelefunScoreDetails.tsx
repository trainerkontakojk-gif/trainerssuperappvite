import type {
  CommunicationMetric,
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import { getCommunicationProfileFromAssessment } from "../../../lib/voiceAssessmentUtils";
import {
  firstFillerLine,
  formatTelefunScore,
  readTelefunAspects,
  type TelefunAspect,
} from "../utils/reviewDisplay";
import type { LineClock } from "./TelefunContentReview";

const PROFILE_KEY: Partial<
  Record<TelefunAspect["key"], CommunicationMetric["key"]>
> = {
  speakingRate: "speakingRate",
  intonation: "intonation",
  articulation: "articulation",
  fillerWords: "fillers",
  emotionalTone: "tone",
};

export function TelefunScoreDetails({
  assessment,
  transcript,
  onShowLine,
  clockOf,
}: {
  assessment: VoiceQualityAssessment;
  transcript: readonly TelefunTranscriptEntry[];
  onShowLine: (startMs: number) => void;
  clockOf: LineClock;
}) {
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
  return (
    <ol className="flex flex-col gap-3">
      {aspects.map((aspect) => {
        const metric = metricOf(aspect);
        const line = aspect.key === "fillerWords" ? fillerLine : null;
        const tip =
          metric?.improvementTip ??
          metric?.drill ??
          (aspect.key === "holdManagement"
            ? assessment.holdManagement?.drill
            : undefined);
        return (
          <li
            key={aspect.key}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-background px-4 py-3"
          >
            {line ? (
              <button
                type="button"
                onClick={() => onShowLine(line.startMs)}
                className="-my-2 min-h-[44px] self-start text-left font-mono text-xs font-medium text-module-telefun hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {clockOf(line.startMs)} · {aspect.label}
              </button>
            ) : (
              <span className="font-mono text-xs font-medium text-module-telefun">
                {aspect.label}
              </span>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              {aspect.score === null
                ? "Belum dinilai"
                : `${formatTelefunScore(aspect.score)} / 10 · ${aspect.verdict}`}
            </p>
            <p className="text-sm text-foreground">
              {aspect.feedback ||
                "Penjelasan penilaian belum tersedia untuk aspek ini."}
            </p>
            {tip && (
              <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-6 text-foreground">
                <span className="font-semibold">Latihan: </span>
                {tip}
              </p>
            )}
            {metric?.examplePhrase && (
              <p className="text-[13px] leading-6 text-fg2">
                Contoh: “{metric.examplePhrase}”
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
