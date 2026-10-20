import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type {
  KetikDimensionGuidance,
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import { cn } from "cn";
import { pointLetter } from "../utils/quoteMarks";
import { Button } from "../../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import {
  KETIK_FIX_THRESHOLD,
  readAspectScores,
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

function scoreChange(score: number, previous: number | null): string | null {
  if (previous === null) return null;
  const delta = score - previous;
  if (delta > 0) return `naik ${delta} dari sesi sebelumnya`;
  if (delta < 0) return `turun ${-delta} dari sesi sebelumnya`;
  return "sama dengan sesi sebelumnya";
}

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
  const finalScore = session.finalScore ?? 0;
  const change = scoreChange(finalScore, previousScore);
  const aspects = readAspectScores(session);
  const guidance = [...(review.education?.dimensionGuidance ?? [])].sort(
    (a, b) => a.priorityRank - b.priorityRank,
  );
  const toFix = guidance.filter((item) => item.score < KETIK_FIX_THRESHOLD);

  const enriched = review.education?.typosEnriched ?? [];
  // Telaah lama tidak punya field anotasi sama sekali.
  const points = review.education?.consumerPoints;
  const notes = review.education?.agentNotes;
  const caseCore = review.education?.caseCore;
  const fixes = (notes ?? [])
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.verdict === "fix");
  const good = (notes ?? [])
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.verdict === "good");
  const [tab, setTab] = useState<string>(points?.length ? "questions" : "fix");
  const [selected, setSelected] = useState<KetikReviewTarget | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (target) {
      setTab(target.tab);
      setSelected(target);
    }
  }, [target]);
  useEffect(() => {
    if (!selected || selected.tab !== tab) return;
    const frame = requestAnimationFrame(() => {
      const element = root.current?.querySelector<HTMLElement>(
        `[data-review-target="${selected.tab}-${selected.key}"]`,
      );
      if (element) focusReviewTarget(element);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, tab]);
  const explain = (key: string) => {
    setTab("scores");
    setSelected({ tab: "scores", key });
  };

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

      {review.education?.verification && (
        <KetikVerificationSummary
          verification={review.education.verification}
          numbers={numbers}
          onShowMessage={onShowMessage}
        />
      )}

      {caseCore && (
        <section
          aria-labelledby="ketik-case-core-title"
          className="flex flex-col gap-1"
        >
          <h3
            id="ketik-case-core-title"
            className="text-[13px] font-semibold text-foreground"
          >
            Inti kasus
          </h3>
          <p className="max-w-[65ch] text-[15px] leading-6 text-fg2">
            {caseCore}
          </p>
        </section>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(String(value));
          setSelected(null);
        }}
        className="gap-4"
      >
        <TabsList
          variant="line"
          aria-label="Rincian telaah"
          className="relative w-full justify-start overflow-x-auto border-b border-border"
        >
          <TabsTrigger
            value="questions"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Pertanyaan konsumen{points ? ` (${points.length})` : ""}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Kalimat agen{notes ? ` (${notes.length})` : ""}
          </TabsTrigger>
          <TabsTrigger
            value="fix"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Perbaiki dulu
          </TabsTrigger>
          <TabsTrigger
            value="good"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Sudah baik ({good.length})
          </TabsTrigger>
          <TabsTrigger
            value="scores"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Penjelasan skor
          </TabsTrigger>
          <TabsTrigger
            value="typo"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Ejaan ({typos.length})
          </TabsTrigger>
          <TabsTrigger
            value="summary"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Ringkasan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="flex flex-col gap-3">
          {!points ? (
            <NotAvailable canRerun={onRerun !== null} />
          ) : points.length === 0 ? (
            <Empty>
              AI tidak menemukan pertanyaan konsumen di percakapan ini.
            </Empty>
          ) : (
            <ol
              aria-label="Pertanyaan konsumen"
              className="flex flex-col gap-3"
            >
              {points.map((point, index) => (
                <ConsumerPointItem
                  key={`${point.messageId}-${index}`}
                  point={point}
                  targetKey={`questions-${index}`}
                  highlighted={
                    selected?.tab === "questions" && selected.key === index
                  }
                  letter={pointLetter(index)}
                  numbers={numbers}
                  onShowMessage={onShowMessage}
                />
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="notes" className="flex flex-col gap-3">
          {!notes ? (
            <NotAvailable canRerun={onRerun !== null} />
          ) : notes.length === 0 ? (
            <Empty>Tidak ada kalimat agen yang dinilai.</Empty>
          ) : (
            <ol
              aria-label="Kalimat agen yang dinilai"
              className="flex flex-col gap-3"
            >
              {notes.map((note, index) => (
                <AgentNoteItem
                  key={`${note.messageId}-${index}`}
                  note={note}
                  targetKey={`notes-${index}`}
                  highlighted={
                    selected?.tab === "notes" && selected.key === index
                  }
                  number={index + 1}
                  numbers={numbers}
                  onShowMessage={onShowMessage}
                />
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="fix" className="flex flex-col gap-4">
          {fixes.length > 0 && (
            <ol
              aria-label="Kalimat yang perlu diperbaiki"
              className="flex flex-col gap-3"
            >
              {fixes.map(({ note, index }) => (
                <AgentNoteItem
                  key={index}
                  note={note}
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
          {toFix.map((item) => (
            <GuidanceItem
              key={item.key}
              item={item}
              numbers={numbers}
              onShowMessage={onShowMessage}
            />
          ))}
          {fixes.length === 0 &&
            review.weaknesses.length === 0 &&
            toFix.length === 0 && (
              <Empty>Belum ada temuan perbaikan yang tersedia.</Empty>
            )}
        </TabsContent>

        <TabsContent value="good" className="flex flex-col gap-3">
          {good.length > 0 ? (
            <ol
              aria-label="Respons agen yang sudah baik"
              className="flex flex-col gap-3"
            >
              {good.map(({ note, index }) => (
                <AgentNoteItem
                  key={index}
                  note={note}
                  number={index + 1}
                  numbers={numbers}
                  onShowMessage={onShowMessage}
                />
              ))}
            </ol>
          ) : (
            <Empty>
              Belum tersedia respons agen yang dinilai sudah tepat. Skor tinggi
              saja tidak menunjukkan kalimat mana yang sudah baik.
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="scores" className="flex flex-col gap-4">
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
              Alasan skor berdasarkan percakapan belum tersedia untuk telaah
              ini.
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="typo" className="flex flex-col gap-2">
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
        </TabsContent>

        <TabsContent value="summary" className="flex flex-col gap-5">
          <p className="max-w-[65ch] text-[15px] leading-7 text-fg2">
            {review.aiSummary}
          </p>
          {review.strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Kekuatan dalam ringkasan
              </h4>
              <PlainList items={review.strengths} />
            </div>
          )}
          {review.coachingFocus.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Fokus coaching
              </h4>
              <PlainList items={review.coachingFocus} />
            </div>
          )}
          {(review.education?.overallNextSteps?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Langkah berikutnya
              </h4>
              <PlainList items={review.education?.overallNextSteps ?? []} />
            </div>
          )}
        </TabsContent>
      </Tabs>
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
    <article
      aria-label={item.label}
      data-review-target={targetKey}
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
    >
      <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
        {item.label}
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {item.score} · {item.verdict}
        </span>
      </h4>
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
    </article>
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
