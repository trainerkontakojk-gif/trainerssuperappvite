import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type {
  KetikDimensionGuidance,
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import { cn } from "cn";
import { buildKetikReviewView } from "../utils/reviewView";
import { pointLetter } from "../utils/quoteMarks";
import { Button } from "../../../components/ui/button";
import {
  KETIK_FIX_THRESHOLD,
  scoreVerdict,
  typoSeverityLabel,
} from "../utils/reviewDisplay";
import {
  focusReviewTarget,
  type KetikReviewTarget,
} from "../utils/reviewNavigation";
import { KetikVerificationSummary } from "./KetikReviewVerification";
import {
  AgentNoteItem,
  ConsumerPointItem,
  NotAvailable,
  QuoteButton,
} from "./KetikReviewAnnotations";

function barColor(score: number): string {
  if (score < KETIK_FIX_THRESHOLD) return "bg-chart-orange";
  if (score >= 85) return "bg-chart-green";
  return "bg-fg2";
}

export function ReviewResult({
  session,
  previousScore,
  review,
  typos,
  numbers,
  onShowMessage,
  rerunFailed,
  onRerun,
  rerunsLeft,
  rerunRefusal,
  target,
}: {
  target: KetikReviewTarget | null;
  session: KetikSessionHistoryItem;
  previousScore: number | null;
  review: KetikSessionReview;
  typos: KetikTypoFinding[];
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
  rerunFailed: boolean;
  /** `null` untuk peran tanpa izin menjalankan telaah. */
  onRerun: (() => void) | null;
  /** 0 = jatah telaah ulang sesi ini sudah dipakai (agent dan leader). */
  rerunsLeft?: number | null;
  /** Alasan dari server saat telaah ulang ditolak. */
  rerunRefusal?: string | null;
}) {
  const rerunUsed = rerunsLeft === 0;
  const {
    finalScore,
    change,
    aspects,
    guidance,
    enriched,
    points,
    caseCore,
    fixes,
    good,
    orderedPoints,
    nextSteps,
  } = buildKetikReviewView(session, review, previousScore);
  const [localTarget, setLocalTarget] = useState<KetikReviewTarget | null>(
    null,
  );
  const selected = localTarget ?? target;
  const root = useRef<HTMLDivElement>(null);
  // Incoming transcript marks win over the previous in-panel selection.
  useEffect(() => {
    setLocalTarget(null);
  }, [target]);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      const element = root.current?.querySelector<HTMLElement>(
        `[data-review-target="${selected.section}-${selected.key}"]`,
      );
      if (!element) return;
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
        focusReviewTarget(element.querySelector("summary") ?? element);
      } else {
        focusReviewTarget(element);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const explain = (key: string) => setLocalTarget({ section: "scores", key });
  const jump = (id: string) => {
    const element = root.current?.querySelector<HTMLElement>(
      `#ketik-review-${id}`,
    );
    if (element) focusReviewTarget(element);
  };
  const navigation = [
    {
      id: "fix",
      label: `Perbaiki ${fixes.length + review.weaknesses.length}`,
      show: fixes.length + review.weaknesses.length > 0,
    },
    {
      id: "questions",
      label: `Pertanyaan ${points?.length ?? 0}`,
      show: !!points?.length,
    },
    { id: "scores", label: "Alasan skor", show: guidance.length > 0 },
    {
      id: "good",
      label: `Sudah baik ${good.length || review.strengths.length}`,
      show: good.length + review.strengths.length > 0,
    },
    { id: "typo", label: `Ejaan ${typos.length}`, show: typos.length > 0 },
    { id: "next", label: "Langkah berikutnya", show: nextSteps.length > 0 },
  ].filter((item) => item.show);

  return (
    <div ref={root} className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border pb-5">
        <div className="flex flex-col">
          <span className="text-[13px] text-muted-foreground">Skor akhir</span>
          <span
            data-testid="ketik-final-score"
            className="font-mono text-5xl leading-none font-extrabold tracking-[-0.04em] text-foreground tabular-nums"
          >
            {finalScore}
          </span>
        </div>
        <p className="flex flex-col pb-1">
          <strong className="font-semibold text-foreground">
            {scoreVerdict(finalScore)}
          </strong>
          {change && (
            <span className="text-[13px] text-muted-foreground">{change}</span>
          )}
        </p>
        {onRerun && !rerunUsed && (
          <Button
            type="button"
            variant="outline"
            onClick={onRerun}
            className="ml-auto min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <RotateCcw data-icon="inline-start" />
            Telaah ulang
          </Button>
        )}
      </div>

      {rerunRefusal ? (
        <p role="alert" className="text-[13px] leading-5 text-fg2">
          {rerunRefusal}
        </p>
      ) : onRerun && rerunUsed ? (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Telaah ulang sudah dipakai untuk sesi ini.
        </p>
      ) : null}

      {rerunFailed && (
        <p role="alert" className="text-[13px] leading-5 text-fg2">
          <strong className="font-semibold text-foreground">
            Telaah ulang belum berhasil.
          </strong>{" "}
          Hasil sebelumnya tetap ditampilkan. Coba lagi beberapa saat lagi.
        </p>
      )}

      <ul aria-label="Skor per aspek" className="flex flex-col gap-2.5">
        {aspects.map((aspect) => (
          <li
            key={aspect.key}
            className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-[13px]"
          >
            <button
              type="button"
              aria-label={`Jelaskan skor ${aspect.label}`}
              onClick={() => explain(aspect.key)}
              className="min-h-[44px] text-left text-fg2 underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              {aspect.label}
            </button>
            <span
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  barColor(aspect.score),
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, aspect.score))}%`,
                }}
              />
            </span>
            <span className="text-right font-mono font-bold text-foreground tabular-nums">
              {aspect.score}
            </span>
          </li>
        ))}
      </ul>

      {navigation.length > 0 && (
        <nav
          aria-label="Lompat ke bagian"
          className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-surface-elevated py-2"
        >
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => jump(item.id)}
              className="min-h-[44px] shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] text-fg2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {review.education?.verification && (
        <KetikVerificationSummary
          verification={review.education.verification}
          numbers={numbers}
          onShowMessage={onShowMessage}
        />
      )}

      {(caseCore || review.aiSummary) && (
        <ReviewSection id="summary" title="Ringkasan">
          {caseCore && (
            <div className="flex flex-col gap-1">
              <h4 className="text-[13px] font-semibold text-foreground">
                Inti kasus
              </h4>
              <p className="max-w-[65ch] text-[15px] leading-6 text-fg2">
                {caseCore}
              </p>
            </div>
          )}
          {review.aiSummary && (
            <p className="max-w-[65ch] text-[15px] leading-7 text-fg2">
              {review.aiSummary}
            </p>
          )}
        </ReviewSection>
      )}

      <ReviewSection id="fix" title="Perbaiki dulu">
        {fixes.length > 0 && (
          <ol
            aria-label="Kalimat yang perlu diperbaiki"
            className="flex flex-col gap-3"
          >
            {fixes.map(({ note, index }) => (
              <AgentNoteItem
                key={index}
                note={note}
                targetKey={`notes-${index}`}
                highlighted={
                  selected?.section === "notes" && selected.key === index
                }
                number={index + 1}
                numbers={numbers}
                onShowMessage={onShowMessage}
              />
            ))}
          </ol>
        )}
        {review.weaknesses.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">Temuan lain</h4>
            <PlainList items={review.weaknesses} />
          </div>
        )}
        {fixes.length === 0 && review.weaknesses.length === 0 && (
          <Empty>Belum ada temuan perbaikan yang tersedia.</Empty>
        )}
      </ReviewSection>

      <ReviewSection
        id="questions"
        title="Pertanyaan konsumen"
        count={
          points
            ? `${points.filter((point) => point.status === "answered").length} dari ${points.length} terjawab`
            : undefined
        }
      >
        {!points ? (
          <NotAvailable canRerun={onRerun !== null} />
        ) : points.length === 0 ? (
          <Empty>
            AI tidak menemukan pertanyaan konsumen di percakapan ini.
          </Empty>
        ) : (
          <ol aria-label="Pertanyaan konsumen" className="flex flex-col gap-3">
            {orderedPoints.map(({ point, index }) => (
              <ConsumerPointItem
                key={index}
                point={point}
                targetKey={`questions-${index}`}
                highlighted={
                  selected?.section === "questions" && selected.key === index
                }
                letter={pointLetter(index)}
                numbers={numbers}
                onShowMessage={onShowMessage}
              />
            ))}
          </ol>
        )}
      </ReviewSection>

      <ReviewSection id="scores" title="Alasan skor">
        <p className="text-[13px] leading-6 text-fg2">
          Setiap aspek dapat memiliki kekuatan dan kekurangan sekaligus. Skor
          tinggi tetap dapat memiliki temuan perbaikan.
        </p>
        {guidance.map((item) => (
          <GuidanceItem
            key={item.key}
            item={item}
            targetKey={`scores-${item.key}`}
            numbers={numbers}
            onShowMessage={onShowMessage}
          />
        ))}
        {guidance.length === 0 && (
          <Empty>
            Alasan skor berdasarkan percakapan belum tersedia untuk telaah ini.
          </Empty>
        )}
      </ReviewSection>

      <ReviewSection id="good" title="Sudah baik">
        {good.length > 0 ? (
          <ol
            aria-label="Respons agen yang sudah baik"
            className="flex flex-col gap-3"
          >
            {good.map(({ note, index }) => (
              <AgentNoteItem
                key={index}
                note={note}
                targetKey={`notes-${index}`}
                highlighted={
                  selected?.section === "notes" && selected.key === index
                }
                number={index + 1}
                numbers={numbers}
                onShowMessage={onShowMessage}
              />
            ))}
          </ol>
        ) : review.strengths.length > 0 ? (
          <PlainList items={review.strengths} />
        ) : (
          <Empty>
            Belum tersedia respons agen yang dinilai sudah tepat. Skor tinggi
            saja tidak menunjukkan kalimat mana yang sudah baik.
          </Empty>
        )}
      </ReviewSection>

      <ReviewSection id="typo" title="Ejaan">
        {typos.length === 0 ? (
          <Empty>Tidak ada salah ketik yang ditemukan.</Empty>
        ) : (
          typos.map((typo) => {
            const number = numbers.get(typo.messageId);
            const why = enriched.find(
              (item) =>
                item.messageId === typo.messageId &&
                item.originalWord === typo.originalWord,
            )?.whyWrong;
            return (
              <button
                key={typo.id}
                type="button"
                onClick={() => onShowMessage(typo.messageId)}
                disabled={number === undefined}
                className="flex min-h-[44px] w-full flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
              >
                <span className="font-mono text-xs text-module-ketik">
                  {number !== undefined
                    ? `Pesan ${number}`
                    : "Pesan tidak ditemukan"}{" "}
                  · {typoSeverityLabel(typo.severity)}
                </span>
                <span className="text-sm text-foreground">
                  <span className="line-through decoration-muted-foreground">
                    {typo.originalWord}
                  </span>{" "}
                  →{" "}
                  <strong className="font-semibold">
                    {typo.correctedWord}
                  </strong>
                </span>
                {why && <span className="text-[13px] text-fg2">{why}</span>}
              </button>
            );
          })
        )}
      </ReviewSection>

      {nextSteps.length > 0 && (
        <ReviewSection id="next" title="Langkah berikutnya">
          <PlainList items={nextSteps} />
        </ReviewSection>
      )}
    </div>
  );
}

function GuidanceItem({
  item,
  targetKey,
  numbers,
  onShowMessage,
}: {
  item: KetikDimensionGuidance;
  targetKey?: string;
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
}) {
  const verified =
    item.source === "transcript" && (item.evidence?.length ?? 0) > 0;
  return (
    <details
      data-review-target={targetKey}
      open={item.score < KETIK_FIX_THRESHOLD}
      className="border-b border-border"
    >
      <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {item.label}{" "}
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {item.score} · {item.verdict}
        </span>
      </summary>
      <div className="flex flex-col gap-2 pb-4">
        {verified ? (
          <>
            <p className="text-[13px] leading-6 text-fg2">
              <strong className="font-semibold">Alasan skor: </strong>
              {item.diagnosis}
            </p>
            <p className="text-[13px] font-semibold">Bukti percakapan</p>
            {item.evidence?.map((evidence, index) => (
              <QuoteButton
                key={index}
                prefix="Pesan"
                messageId={evidence.messageId}
                quote={evidence.quote}
                numbers={numbers}
                onShowMessage={onShowMessage}
              />
            ))}
          </>
        ) : (
          <p className="text-[13px] leading-6 text-fg2">
            Alasan skor berdasarkan percakapan belum tersedia untuk aspek ini.
            Panduan umum di bawah bukan penjelasan spesifik atas nilai{" "}
            {item.score}.
          </p>
        )}
        <p className="text-[13px] leading-6 text-foreground">
          <strong className="font-semibold">
            {verified ? "Langkah berikutnya: " : "Panduan umum: "}
          </strong>
          {item.howToFix}
        </p>
        {item.exampleRewrite && (
          <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-6 text-foreground">
            <span className="font-semibold">
              {verified ? "Contoh lebih baik: " : "Contoh latihan: "}
            </span>
            {item.exampleRewrite}
          </p>
        )}
      </div>
    </details>
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
      id={`ketik-review-${id}`}
      aria-labelledby={`ketik-review-${id}-title`}
      tabIndex={-1}
      className="flex flex-col gap-3 outline-none focus:ring-2 focus:ring-ring"
    >
      <h3
        id={`ketik-review-${id}-title`}
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

function PlainList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-6 text-fg2 marker:text-muted-foreground">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}
