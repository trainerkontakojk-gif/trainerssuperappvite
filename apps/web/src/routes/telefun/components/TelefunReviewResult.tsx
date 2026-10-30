import { useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type {
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { focusReviewTarget } from "../utils/contentMarks";
import { buildTelefunReviewView } from "../utils/reviewView";
import type { CallRecord } from "../types";
import {
  TELEFUN_FIX_THRESHOLD,
  formatClock,
  formatTelefunScore,
  readTelefunScore,
  telefunScoreVerdict,
} from "../utils/reviewDisplay";
import { TelefunAnalysisWait } from "./TelefunAnalysisWait";
import { TelefunScoreDetails } from "./TelefunScoreDetails";
import { TelefunProfileRadar } from "./TelefunProfileRadar";
import {
  AgentNoteList,
  ConsumerPointList,
  type LineClock,
  ContentNotAvailable,
} from "./TelefunContentReview";

/** Panel hasil Telaah Telefun dalam satu kolom. */

function barColor(score: number): string {
  if (score < TELEFUN_FIX_THRESHOLD) return "bg-chart-orange";
  if (score >= 8.5) return "bg-chart-green";
  return "bg-fg2";
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
  notesOpen,
  onNotesOpenChange,
  onShowLine,
  rerunStartedAt,
  rerunFailed,
  onRerun,
  notes,
  highlightedId = null,
  clockOf = formatClock,
}: {
  record: CallRecord;
  assessment: VoiceQualityAssessment;
  previous: number | null;
  transcript: readonly TelefunTranscriptEntry[];
  notesOpen: boolean;
  onNotesOpenChange: (open: boolean) => void;
  onShowLine: (startMs: number) => void;
  /** Saat Telaah ulang dimulai; `null` bila tidak berjalan. */
  rerunStartedAt: number | null;
  rerunFailed: boolean;
  /** Tidak ada bila peran ini tidak boleh menilai ulang (hanya trainer/admin). */
  onRerun?: () => void;
  notes: ReactNode;
  /** `id` butir anotasi isi yang ditunjuk dari transkrip. */
  highlightedId?: string | null;
  clockOf?: LineClock;
}) {
  const { content, score, aspects, profile, toFix, good, nextSteps, change } =
    buildTelefunReviewView(record, assessment, previous);
  const root = useRef<HTMLElement | null>(null);
  const jump = (id: string) => {
    const element = root.current?.querySelector<HTMLElement>(`#${id}`);
    if (element) focusReviewTarget(element);
  };
  const navigation = [
    {
      id: "summary",
      label: "Ringkasan",
      show: Boolean(content?.caseCore || profile),
    },
    {
      id: "fix",
      label: `Perbaiki ${toFix.length}`,
      show: !content || toFix.length > 0 || nextSteps.length > 0,
    },
    {
      id: "questions",
      label: `Pertanyaan ${content?.consumerPoints.length ?? 0}`,
      show: true,
    },
    { id: "scores", label: "Alasan skor", show: aspects.length > 0 },
    {
      id: "good",
      label: `Sudah baik ${good.length}`,
      show: !content || good.length > 0 || assessment.strengths.length > 0,
    },
    { id: "notes", label: "Catatan trainer", show: true },
  ];

  return (
    <>
      <ScoreBlock
        score={score}
        change={change}
        action={
          onRerun && (
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
          )
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
            className="grid h-16 grid-cols-[minmax(0,9.5rem)_1fr_2.5rem] items-center gap-x-3 text-[13px]"
          >
            <button
              type="button"
              onClick={() => jump(`telefun-score-${aspect.key}`)}
              aria-label={`Lihat penjelasan ${aspect.label}`}
              className="min-h-[44px] text-left text-fg2 underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {aspect.label}
              {aspect.raw && (
                <span className="block text-xs text-muted-foreground no-underline">
                  {aspect.raw}
                </span>
              )}
            </button>
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
          </li>
        ))}
      </ul>

      <nav
        ref={(element) => {
          root.current = element?.parentElement ?? null;
        }}
        aria-label="Lompat ke bagian"
        className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-elevated py-2"
      >
        {navigation
          .filter((item) => item.show)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "notes") onNotesOpenChange(true);
                jump(`telefun-review-${item.id}`);
              }}
              className="min-h-[44px] shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] font-medium text-fg2 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {item.label}
            </button>
          ))}
      </nav>

      {(content?.caseCore || profile) && (
        <ReviewSection id="summary" title="Ringkasan">
          {content?.caseCore && (
            <div className="flex flex-col gap-1">
              <h4 className="text-[13px] font-semibold text-foreground">
                Inti kasus
              </h4>
              <p className="max-w-[65ch] text-sm leading-6 text-fg2">
                {content.caseCore}
              </p>
            </div>
          )}
          {profile && (
            <div className="flex flex-col gap-4 @min-[38rem]:flex-row @min-[38rem]:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h4 className="text-[13px] font-semibold text-foreground">
                  Profil suara
                </h4>
                <p className="max-w-[65ch] text-[13px] leading-6 text-fg2">
                  {profile.overallSummary}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <TelefunProfileRadar profile={profile} />
              </div>
            </div>
          )}
        </ReviewSection>
      )}

      <ReviewSection id="fix" title="Perbaiki dulu">
        {!content ? (
          <ContentNotAvailable review={content} canRerun={Boolean(onRerun)} />
        ) : toFix.length === 0 ? (
          <Empty>Tidak ada kalimat agen yang ditandai perlu diperbaiki.</Empty>
        ) : (
          <AgentNoteList
            notes={content.agentNotes}
            verdict="fix"
            onShowLine={onShowLine}
            highlightedId={highlightedId}
            clockOf={clockOf}
          />
        )}
        {nextSteps.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold text-foreground">
              Langkah latihan berikutnya
            </h4>
            <PlainList items={nextSteps.slice(0, 3)} ordered />
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        id="questions"
        title="Pertanyaan konsumen"
        count={
          content
            ? `${content.consumerPoints.filter((point) => point.status === "answered").length} dari ${content.consumerPoints.length} terjawab`
            : undefined
        }
      >
        {!content ? (
          <ContentNotAvailable review={content} canRerun={Boolean(onRerun)} />
        ) : content.consumerPoints.length === 0 ? (
          <Empty>
            AI tidak menemukan pertanyaan konsumen di panggilan ini.
          </Empty>
        ) : (
          <ConsumerPointList
            points={content.consumerPoints}
            onShowLine={onShowLine}
            highlightedId={highlightedId}
            clockOf={clockOf}
          />
        )}
      </ReviewSection>

      <ReviewSection id="scores" title="Alasan skor">
        <p className="text-[13px] leading-6 text-muted-foreground">
          Penilaian suara dan saran latihan per aspek. Skor tinggi masih dapat
          disertai koreksi; contoh ucapan dibahas pada bagian Sudah baik dan
          Perbaiki dulu.
        </p>
        <TelefunScoreDetails
          assessment={assessment}
          transcript={transcript}
          onShowLine={onShowLine}
          clockOf={clockOf}
        />
      </ReviewSection>

      <ReviewSection id="good" title="Sudah baik">
        {good.length > 0 && content ? (
          <AgentNoteList
            notes={content.agentNotes}
            verdict="good"
            onShowLine={onShowLine}
            highlightedId={highlightedId}
            clockOf={clockOf}
          />
        ) : assessment.strengths.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold">
              Kekuatan menurut penilaian AI
            </h4>
            <PlainList items={assessment.strengths} />
          </div>
        ) : !content ? (
          <ContentNotAvailable review={content} canRerun={Boolean(onRerun)} />
        ) : (
          <Empty>Belum ada contoh ucapan agen yang ditandai sudah tepat.</Empty>
        )}
      </ReviewSection>

      <section
        id="telefun-review-notes"
        aria-labelledby="telefun-review-notes-title"
        tabIndex={-1}
        className="shrink-0 outline-none focus:ring-2 focus:ring-ring"
      >
        <details
          id="telefun-trainer-notes"
          open={notesOpen}
          onToggle={(event) => onNotesOpenChange(event.currentTarget.open)}
        >
          <summary className="min-h-[44px] cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-ring">
            <h3
              id="telefun-review-notes-title"
              className="inline text-base font-semibold text-foreground"
            >
              Catatan trainer
            </h3>
          </summary>
          {notes}
        </details>
      </section>
    </>
  );
}

function ReviewSection({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`telefun-review-${id}`}
      aria-labelledby={`telefun-review-${id}-title`}
      tabIndex={-1}
      className="flex shrink-0 flex-col gap-3 outline-none focus:ring-2 focus:ring-ring"
    >
      <h3
        id={`telefun-review-${id}-title`}
        className="flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold text-foreground"
      >
        {title}
        {count && (
          <span className="text-[13px] font-normal text-fg2">{count}</span>
        )}
      </h3>
      {children}
    </section>
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
