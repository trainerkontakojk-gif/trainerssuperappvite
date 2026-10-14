import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Link2,
  Play,
  RotateCcw,
} from "lucide-react";
import type {
  ChatMessage,
  KetikDimensionGuidance,
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { notify } from "../../../lib/toast";
import {
  IMAGE_TAG_PATTERN_GLOBAL,
  normalizeMessagesForDisplay,
  stripSystemTags,
} from "../lib/message-utils";
import {
  useKetikReviewStatus,
  type KetikReviewFailure,
} from "../hooks/useKetikReviewStatus";
import {
  KETIK_FIX_THRESHOLD,
  numberMessages,
  previousFinalScore,
  readAspectScores,
  scoreVerdict,
  typoSeverityLabel,
} from "../utils/reviewDisplay";
import { downloadKetikTranscript } from "../utils/transcript";
import { KetikStageNav } from "./KetikStageNav";
import { SessionReplayModal } from "./SessionReplayModal";

interface KetikReviewStageProps {
  session: KetikSessionHistoryItem;
  history: readonly KetikSessionHistoryItem[];
  canStartReview: boolean;
  onSessionChange: (session: KetikSessionHistoryItem) => void;
  onBack: () => void;
  onPracticeAgain: () => void;
}

const sectionTitle =
  "font-display text-lg leading-7 font-bold tracking-tight text-foreground";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Teks pesan untuk transkrip: tag sistem dibuang, gambar diberi keterangan. */
function displayText(message: ChatMessage): string {
  const text = stripSystemTags(message.text)
    .replace(IMAGE_TAG_PATTERN_GLOBAL, "(gambar)")
    .trim();
  return text || "(gambar)";
}

/** Garis bawahi kata yang salah eja langsung di kalimatnya. */
function withTypoMarks(text: string, words: readonly string[]): ReactNode {
  const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
  if (unique.length === 0) return text;
  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded-sm border-b-2 border-chart-orange bg-chart-orange/25 px-px text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

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

/** Tahap Telaah KETIK: transkrip di kiri, hasil telaah di kanan. */
export function KetikReviewStage({
  session,
  history,
  canStartReview,
  onSessionChange,
  onBack,
  onPracticeAgain,
}: KetikReviewStageProps) {
  const review = useKetikReviewStatus(session, onSessionChange);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const messageRefs = useRef(new Map<string, HTMLLIElement>());
  // Dialog di atas lapisan `fixed z-[100]` harus dirender di dalamnya.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  const messages = useMemo(
    () => normalizeMessagesForDisplay(session.messages),
    [session.messages],
  );
  const numbers = useMemo(() => numberMessages(messages), [messages]);
  const typosByMessage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const typo of review.typos) {
      map.set(typo.messageId, [
        ...(map.get(typo.messageId) ?? []),
        typo.originalWord,
      ]);
    }
    return map;
  }, [review.typos]);

  const showMessage = (messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (!element) return;
    setHighlightedId(messageId);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.focus({ preventScroll: true });
  };

  const participant =
    session.simulationSubject?.type === "participant"
      ? formatSimulationSubjectLabel(session.simulationSubject)
      : null;

  return (
    <div
      ref={setLayer}
      data-module="ketik"
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-elevated px-4 py-2 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="min-h-[44px] gap-2 px-2 text-[13px] text-fg2"
        >
          <ArrowLeft data-icon="inline-start" />
          KETIK
        </Button>
        <KetikStageNav />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReplayOpen(true)}
            className="min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <Play data-icon="inline-start" />
            Putar ulang chat
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadKetikTranscript(session)}
            className="min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <Download data-icon="inline-start" />
            <span className="max-sm:sr-only">Unduh transkrip</span>
          </Button>
          <Button
            type="button"
            onClick={onPracticeAgain}
            className="min-h-[44px] px-4 text-[13px] font-semibold"
          >
            Latihan lagi
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          aria-labelledby="ketik-transcript-title"
          className="flex min-w-0 flex-col gap-4 border-border bg-background p-4 sm:p-6 lg:order-first lg:flex-[1_1_55%] lg:overflow-y-auto lg:border-r"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="ketik-transcript-title" className={sectionTitle}>
              Percakapan
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {[session.scenarioTitle, session.consumerName, participant]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ol className="flex flex-col gap-3">
            {messages.map((message) => {
              if (message.sender === "system") return null;
              const number = numbers.get(message.id);
              const isAgent = message.sender === "agent";
              const flagged = typosByMessage.has(message.id);
              return (
                <li
                  key={message.id}
                  ref={(element) => {
                    if (element) messageRefs.current.set(message.id, element);
                    else messageRefs.current.delete(message.id);
                  }}
                  tabIndex={-1}
                  data-testid={`ketik-message-${number}`}
                  data-highlighted={highlightedId === message.id}
                  className={cn(
                    "flex items-start gap-2 rounded-xl outline-none",
                    isAgent && "flex-row-reverse",
                  )}
                >
                  <span className="w-6 shrink-0 pt-2 text-center font-mono text-xs text-muted-foreground">
                    <span className="sr-only">Pesan </span>
                    {number}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap break-words",
                      isAgent
                        ? "rounded-tr-sm bg-module-ketik text-module-ketik-foreground"
                        : "rounded-tl-sm border border-border bg-surface-elevated text-foreground",
                      (flagged || highlightedId === message.id) &&
                        "outline-2 outline-offset-2 outline-chart-orange",
                      highlightedId === message.id && "outline-foreground",
                    )}
                  >
                    <span className="sr-only">
                      {isAgent ? "Agen: " : "Konsumen: "}
                    </span>
                    {withTypoMarks(
                      displayText(message),
                      typosByMessage.get(message.id) ?? [],
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          aria-labelledby="ketik-result-title"
          className="order-first flex min-w-0 flex-col gap-6 bg-surface-elevated p-4 sm:p-6 lg:order-last lg:flex-[1_1_45%] lg:overflow-y-auto"
        >
          <h2 id="ketik-result-title" className="sr-only">
            Hasil telaah
          </h2>
          {review.phase === "ready" && review.review ? (
            <ReviewResult
              session={session}
              history={history}
              review={review.review}
              typos={review.typos}
              numbers={numbers}
              onShowMessage={showMessage}
            />
          ) : review.phase === "reviewing" ||
            review.phase === "loading-result" ? (
            <ReviewProgress loadingResult={review.phase === "loading-result"} />
          ) : review.phase === "failed" ? (
            <ReviewFailed
              failure={review.failure ?? "review"}
              canStartReview={canStartReview}
              onRetry={() => void review.start()}
              onRetryResult={review.retryResult}
            />
          ) : (
            <NotReviewed
              canStartReview={canStartReview}
              onStart={() => void review.start()}
            />
          )}
        </section>
      </div>

      <SessionReplayModal
        isOpen={replayOpen}
        onClose={() => setReplayOpen(false)}
        messages={session.messages}
        typos={review.typos}
        scenarioTitle={session.scenarioTitle}
        consumerName={session.consumerName}
        container={layer}
      />
    </div>
  );
}

function NotReviewed({
  canStartReview,
  onStart,
}: {
  canStartReview: boolean;
  onStart: () => void;
}) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify.success("Tautan sesi disalin.");
    } catch {
      notify.error("Tautan belum bisa disalin.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <h3 className={sectionTitle}>Belum ditelaah</h3>
      {canStartReview ? (
        <>
          <p className="max-w-[60ch] text-[15px] leading-6 text-fg2">
            Jalankan telaah AI untuk menilai lima aspek dan menandai kalimat
            yang perlu diperbaiki.
          </p>
          <Button
            type="button"
            onClick={onStart}
            className="min-h-[44px] px-4 text-[13px] font-semibold"
          >
            Mulai telaah
          </Button>
        </>
      ) : (
        <>
          <p className="max-w-[60ch] text-[15px] leading-6 text-fg2">
            Hanya admin, trainer, dan QA yang dapat menjalankan telaah AI. Minta
            trainer Anda membuka sesi ini dari halaman Riwayat.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyLink()}
            className="min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <Link2 data-icon="inline-start" />
            Salin tautan sesi
          </Button>
        </>
      )}
    </div>
  );
}

function ReviewProgress({ loadingResult }: { loadingResult: boolean }) {
  const steps = [
    { label: "Percakapan tersimpan", state: "done" },
    {
      label: "Menilai lima aspek",
      state: loadingResult ? "done" : "current",
    },
    { label: "Memuat hasil", state: loadingResult ? "current" : "todo" },
  ] as const;

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <h3 className={sectionTitle}>Sedang ditelaah AI</h3>
      <ol className="flex flex-col gap-2 text-[15px]">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex items-center gap-2",
              step.state === "current"
                ? "font-semibold text-foreground"
                : step.state === "done"
                  ? "text-fg2"
                  : "text-muted-foreground",
            )}
          >
            {step.state === "done" ? (
              <Check aria-hidden="true" className="size-4 text-chart-green" />
            ) : step.state === "current" ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground motion-reduce:animate-none"
              />
            ) : (
              <span aria-hidden="true" className="size-4" />
            )}
            {step.label}
            {step.state === "current" && "…"}
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-muted-foreground">
        Biasanya selesai dalam satu menit.
      </p>
    </div>
  );
}

const FAILURE_COPY: Record<KetikReviewFailure, string> = {
  review: "AI belum memberi hasil telaah.",
  timeout: "AI tidak memberi hasil dalam 2 menit.",
  result: "Telaah sudah selesai, tetapi hasilnya belum bisa dimuat.",
};

function ReviewFailed({
  failure,
  canStartReview,
  onRetry,
  onRetryResult,
}: {
  failure: KetikReviewFailure;
  canStartReview: boolean;
  onRetry: () => void;
  onRetryResult: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <h3 className={sectionTitle}>Telaah belum berhasil</h3>
      <p className="max-w-[60ch] text-[15px] leading-6 text-fg2">
        {FAILURE_COPY[failure]} Percakapan Anda tetap tersimpan, jadi telaah
        bisa dijalankan ulang tanpa mengulang chat.
      </p>
      {failure === "result" ? (
        <Button
          type="button"
          onClick={onRetryResult}
          className="min-h-[44px] gap-2 px-4 text-[13px] font-semibold"
        >
          <RotateCcw data-icon="inline-start" />
          Muat ulang hasil
        </Button>
      ) : canStartReview ? (
        <Button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] gap-2 px-4 text-[13px] font-semibold"
        >
          <RotateCcw data-icon="inline-start" />
          Coba telaah lagi
        </Button>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Minta trainer Anda menjalankan ulang telaah dari halaman Riwayat.
        </p>
      )}
    </div>
  );
}

function ReviewResult({
  session,
  history,
  review,
  typos,
  numbers,
  onShowMessage,
}: {
  session: KetikSessionHistoryItem;
  history: readonly KetikSessionHistoryItem[];
  review: KetikSessionReview;
  typos: KetikTypoFinding[];
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
}) {
  const finalScore = session.finalScore ?? 0;
  const change = scoreChange(finalScore, previousFinalScore(session, history));
  const aspects = readAspectScores(session);
  const guidance = [...(review.education?.dimensionGuidance ?? [])].sort(
    (a, b) => a.priorityRank - b.priorityRank,
  );
  const toFix = guidance.filter((item) => item.score < KETIK_FIX_THRESHOLD);
  const good = guidance.filter((item) => item.score >= KETIK_FIX_THRESHOLD);
  const enriched = review.education?.typosEnriched ?? [];

  return (
    <>
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
      </div>

      <ul aria-label="Skor per aspek" className="flex flex-col gap-2.5">
        {aspects.map((aspect) => (
          <li
            key={aspect.key}
            className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-[13px]"
          >
            <span className="text-fg2">{aspect.label}</span>
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

      <Tabs defaultValue="fix" className="gap-4">
        <TabsList
          variant="line"
          aria-label="Rincian telaah"
          className="w-full justify-start overflow-x-auto border-b border-border"
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

        <TabsContent value="fix" className="flex flex-col gap-3">
          {toFix.length > 0 ? (
            toFix.map((item) => <GuidanceItem key={item.key} item={item} />)
          ) : guidance.length === 0 && review.weaknesses.length > 0 ? (
            <PlainList items={review.weaknesses} />
          ) : (
            <Empty>
              Tidak ada aspek dengan skor di bawah {KETIK_FIX_THRESHOLD}.
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="good" className="flex flex-col gap-3">
          {good.map((item) => (
            <GuidanceItem key={item.key} item={item} withFix={false} />
          ))}
          {review.strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Kekuatan
              </h4>
              <PlainList items={review.strengths} />
            </div>
          )}
          {good.length === 0 && review.strengths.length === 0 && (
            <Empty>
              Belum ada aspek dengan skor {KETIK_FIX_THRESHOLD} ke atas.
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
    </>
  );
}

function GuidanceItem({
  item,
  withFix = true,
}: {
  item: KetikDimensionGuidance;
  withFix?: boolean;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3">
      <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
        {item.label}
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {item.score} · {item.verdict}
        </span>
      </h4>
      <p className="text-[13px] leading-6 text-fg2">{item.diagnosis}</p>
      {withFix && (
        <>
          <p className="text-[13px] leading-6 text-foreground">
            {item.howToFix}
          </p>
          {item.exampleRewrite && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-6 text-foreground">
              <span className="font-semibold">Contoh lebih baik: </span>
              {item.exampleRewrite}
            </p>
          )}
        </>
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
