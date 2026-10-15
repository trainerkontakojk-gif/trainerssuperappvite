import { lazy, Suspense, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type {
  CommunicationMetric,
  TelefunContentReview,
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { getCommunicationProfileFromAssessment } from "../../../lib/voiceAssessmentUtils";
import type { CallRecord } from "../types";
import {
  TELEFUN_FIX_THRESHOLD,
  firstFillerLine,
  formatClock,
  formatTelefunScore,
  readTelefunAspects,
  readTelefunScore,
  telefunScoreVerdict,
  type TelefunAspect,
} from "../utils/reviewDisplay";
import { TelefunAnalysisWait } from "./TelefunAnalysisWait";
import {
  AgentNoteList,
  ConsumerPointList,
  ContentNotAvailable,
} from "./TelefunContentReview";

/** Panel hasil Telaah Telefun: skor, aspek, inti kasus, dan tab rincian. */

const VoiceRadarChart = lazy(() =>
  import("./VoiceRadarChart").then((module) => ({
    default: module.VoiceRadarChart,
  })),
);

/** Metrik profil komunikasi yang sepadan dengan aspek suara. */
const PROFILE_KEY: Partial<
  Record<TelefunAspect["key"], CommunicationMetric["key"]>
> = {
  speakingRate: "speakingRate",
  intonation: "intonation",
  articulation: "articulation",
  fillerWords: "fillers",
  emotionalTone: "tone",
};

function barColor(score: number): string {
  if (score < TELEFUN_FIX_THRESHOLD) return "bg-chart-orange";
  if (score >= 8.5) return "bg-chart-green";
  return "bg-fg2";
}

function scoreChange(score: number, previous: number | null): string | null {
  if (previous === null) return null;
  const delta = Math.round((score - previous) * 10) / 10;
  if (delta > 0)
    return `naik ${formatTelefunScore(delta)} dari panggilan sebelumnya`;
  if (delta < 0)
    return `turun ${formatTelefunScore(-delta)} dari panggilan sebelumnya`;
  return "sama dengan panggilan sebelumnya";
}

/** Sesi lama yang punya skor tetapi tanpa rincian penilaian. */
export function ScoreOnly({ record }: { record: CallRecord }) {
  const score = readTelefunScore(record) ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <ScoreBlock score={score} change={null} />
      <p className="max-w-[60ch] text-[15px] leading-6 text-fg2">
        Rincian per aspek tidak tersimpan untuk panggilan lama ini.
      </p>
      {record.feedback && (
        <p className="max-w-[65ch] text-[15px] leading-6 whitespace-pre-wrap text-fg2">
          {record.feedback}
        </p>
      )}
    </div>
  );
}

function ScoreBlock({
  score,
  change,
  action,
}: {
  score: number;
  change: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border pb-5">
      <div className="flex flex-col">
        <span className="text-[13px] text-muted-foreground">Skor suara</span>
        <span className="flex items-baseline gap-1.5">
          <span
            data-testid="telefun-voice-score"
            className="font-mono text-5xl leading-none font-extrabold tracking-[-0.04em] text-foreground tabular-nums"
          >
            {formatTelefunScore(score)}
          </span>
          <span className="font-mono text-lg font-medium text-muted-foreground">
            / 10
          </span>
        </span>
      </div>
      <p className="flex flex-col pb-1">
        <strong className="font-semibold text-foreground">
          {telefunScoreVerdict(score)}
        </strong>
        {change && (
          <span className="text-[13px] text-muted-foreground">{change}</span>
        )}
      </p>
      {action}
    </div>
  );
}

export function ReviewResult({
  record,
  assessment,
  previous,
  transcript,
  tab,
  onTabChange,
  onShowLine,
  rerunStartedAt,
  rerunFailed,
  onRerun,
  notes,
}: {
  record: CallRecord;
  assessment: VoiceQualityAssessment;
  previous: number | null;
  transcript: readonly TelefunTranscriptEntry[];
  tab: string;
  onTabChange: (tab: string) => void;
  onShowLine: (startMs: number) => void;
  /** Saat Telaah ulang dimulai; `null` bila tidak berjalan. */
  rerunStartedAt: number | null;
  rerunFailed: boolean;
  onRerun: () => void;
  notes: ReactNode;
}) {
  const content: TelefunContentReview | null | undefined =
    assessment.contentReview;
  const score = readTelefunScore(record) ?? assessment.overallScore;
  const aspects = readTelefunAspects(assessment);
  const profile = getCommunicationProfileFromAssessment(assessment);
  const scored = aspects.filter(
    (aspect): aspect is TelefunAspect & { score: number } =>
      aspect.score !== null,
  );
  const toFix = scored
    .filter((aspect) => aspect.score < TELEFUN_FIX_THRESHOLD)
    .sort((a, b) => a.score - b.score);
  const good = scored.filter((aspect) => aspect.score >= TELEFUN_FIX_THRESHOLD);
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
  const nextSteps = assessment.overallNextSteps ?? [];

  return (
    <>
      <ScoreBlock
        score={score}
        change={scoreChange(score, previous)}
        action={
          <Button
            type="button"
            variant="outline"
            disabled={rerunStartedAt !== null}
            onClick={onRerun}
            className="ml-auto min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <RotateCcw data-icon="inline-start" />
            {rerunStartedAt !== null ? "Menelaah ulang…" : "Telaah ulang"}
          </Button>
        }
      />

      {rerunStartedAt !== null && (
        <TelefunAnalysisWait
          startedAt={rerunStartedAt}
          label="Telaah ulang berjalan"
          keepsPrevious
        />
      )}
      {rerunFailed && (
        <p role="alert" className="text-[13px] leading-5 text-fg2">
          <strong className="font-semibold text-foreground">
            Telaah ulang belum berhasil.
          </strong>{" "}
          Hasil sebelumnya tetap ditampilkan. Coba lagi beberapa saat lagi.
        </p>
      )}

      <ul aria-label="Skor per aspek" className="flex flex-col gap-3">
        {aspects.map((aspect) => (
          <li
            key={aspect.key}
            className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.5rem] items-center gap-x-3 gap-y-0.5 text-[13px]"
          >
            <span className="text-fg2">{aspect.label}</span>
            <span
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              {aspect.score !== null && (
                <span
                  className={cn(
                    "block h-full rounded-full",
                    barColor(aspect.score),
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(100, aspect.score * 10))}%`,
                  }}
                />
              )}
            </span>
            <span className="text-right font-mono font-bold text-foreground tabular-nums">
              {aspect.score !== null ? formatTelefunScore(aspect.score) : "–"}
            </span>
            {aspect.raw && (
              <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
                {aspect.raw}
              </span>
            )}
          </li>
        ))}
      </ul>

      {content?.caseCore && (
        <section
          aria-labelledby="telefun-case-core"
          className="flex flex-col gap-1 rounded-xl bg-background px-4 py-3"
        >
          <h3
            id="telefun-case-core"
            className="text-[13px] font-semibold text-foreground"
          >
            Inti kasus
          </h3>
          <p className="text-sm leading-6 text-fg2">{content.caseCore}</p>
        </section>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") onTabChange(value);
        }}
        className="gap-4"
      >
        <TabsList
          variant="line"
          aria-label="Rincian telaah"
          className="relative w-full justify-start overflow-x-auto border-b border-border"
        >
          <TabsTrigger
            value="fix"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Perbaiki dulu ({toFix.length})
          </TabsTrigger>
          <TabsTrigger
            value="good"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Sudah baik ({good.length})
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Pertanyaan konsumen
            {content ? ` (${content.consumerPoints.length})` : ""}
          </TabsTrigger>
          <TabsTrigger
            value="lines"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Kalimat agen{content ? ` (${content.agentNotes.length})` : ""}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Catatan trainer
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Profil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fix" className="flex flex-col gap-3">
          {toFix.length === 0 ? (
            <Empty>
              Tidak ada aspek dengan skor di bawah{" "}
              {formatTelefunScore(TELEFUN_FIX_THRESHOLD)}.
            </Empty>
          ) : (
            <ol className="flex flex-col gap-3">
              {toFix.map((aspect) => {
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
                        {formatClock(line.startMs)} · {aspect.label}
                      </button>
                    ) : (
                      <span className="font-mono text-xs font-medium text-module-telefun">
                        {aspect.label}
                      </span>
                    )}
                    <p className="text-sm text-foreground">{aspect.feedback}</p>
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
          )}
          {nextSteps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Langkah latihan berikutnya
              </h4>
              <PlainList items={nextSteps.slice(0, 3)} ordered />
            </div>
          )}
        </TabsContent>

        <TabsContent value="good" className="flex flex-col gap-3">
          {good.map((aspect) => (
            <article
              key={aspect.key}
              className="flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3"
            >
              <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
                {aspect.label}
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {formatTelefunScore(aspect.score)} · {aspect.verdict}
                </span>
              </h4>
              <p className="text-[13px] leading-6 text-fg2">
                {aspect.feedback}
              </p>
            </article>
          ))}
          {assessment.strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Kekuatan
              </h4>
              <PlainList items={assessment.strengths} />
            </div>
          )}
          {good.length === 0 && assessment.strengths.length === 0 && (
            <Empty>
              Belum ada aspek dengan skor{" "}
              {formatTelefunScore(TELEFUN_FIX_THRESHOLD)} ke atas.
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="questions" className="flex flex-col gap-3">
          {!content ? (
            <ContentNotAvailable review={content} canRerun />
          ) : content.consumerPoints.length === 0 ? (
            <Empty>
              AI tidak menemukan pertanyaan konsumen di panggilan ini.
            </Empty>
          ) : (
            <ConsumerPointList
              points={content.consumerPoints}
              onShowLine={onShowLine}
            />
          )}
        </TabsContent>

        <TabsContent value="lines" className="flex flex-col gap-3">
          {!content ? (
            <ContentNotAvailable review={content} canRerun />
          ) : content.agentNotes.length === 0 ? (
            <Empty>Tidak ada kalimat agen yang dinilai.</Empty>
          ) : (
            <AgentNoteList notes={content.agentNotes} onShowLine={onShowLine} />
          )}
        </TabsContent>

        <TabsContent value="notes">{notes}</TabsContent>

        <TabsContent value="profile" className="flex flex-col gap-3">
          {profile ? (
            <>
              <p className="max-w-[65ch] text-[13px] leading-6 text-fg2">
                {profile.overallSummary}
              </p>
              <Suspense
                fallback={
                  <p className="text-[13px] text-muted-foreground">
                    Memuat diagram…
                  </p>
                }
              >
                <VoiceRadarChart profile={profile} compact />
              </Suspense>
            </>
          ) : (
            <Empty>Profil komunikasi belum tersedia untuk panggilan ini.</Empty>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function PlainList({
  items,
  ordered = false,
}: {
  items: readonly string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List
      className={cn(
        "flex flex-col gap-1.5 pl-5 text-[13px] leading-6 text-fg2 marker:text-muted-foreground",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </List>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}
