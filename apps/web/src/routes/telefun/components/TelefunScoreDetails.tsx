import type {
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import {
  TELEFUN_FIX_THRESHOLD,
  formatTelefunScore,
} from "../utils/reviewDisplay";
import { buildTelefunScoreDetails } from "../utils/reviewView";
import type { LineClock } from "./TelefunContentReview";

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
  const details = buildTelefunScoreDetails(assessment, transcript);
  return (
    <ol className="flex flex-col gap-3">
      {details.map(({ aspect, metric, line, tip }) => {
        return (
          <li key={aspect.key}>
            <details
              id={`telefun-score-${aspect.key}`}
              open={
                aspect.score !== null && aspect.score < TELEFUN_FIX_THRESHOLD
              }
              className="border-b border-border"
            >
              <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                {aspect.label}{" "}
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {aspect.score === null
                    ? "Belum dinilai"
                    : `${formatTelefunScore(aspect.score)} / 10 · ${aspect.verdict}`}
                </span>
              </summary>
              <div className="flex flex-col gap-2 pb-4">
                {line && (
                  <button
                    type="button"
                    onClick={() => onShowLine(line.startMs)}
                    className="-my-2 min-h-[44px] self-start text-left font-mono text-xs font-medium text-module-telefun hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {clockOf(line.startMs)} · {aspect.label}
                  </button>
                )}
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
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
