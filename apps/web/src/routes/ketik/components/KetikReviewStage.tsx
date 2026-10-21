import { Fragment, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Link2, Play, RotateCcw } from "lucide-react";
import { detectKetikSessionAnomalies } from "@trainers/types";
import type {
  KetikHistoryDetail,
  KetikHistoryAttachment,
  KetikSessionHistoryItem,
} from "@trainers/types";
import { cn } from "cn";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Button } from "../../../components/ui/button";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { notify } from "../../../lib/toast";
import { normalizeMessagesForDisplay } from "../lib/message-utils";
import {
  useKetikReviewStatus,
  type KetikReviewFailure,
} from "../hooks/useKetikReviewStatus";
import { numberMessages } from "../utils/reviewDisplay";
import { downloadKetikTranscript } from "../utils/transcript";
import { buildQuoteMarks, pointLetter } from "../utils/quoteMarks";
import { KetikReviewMessage } from "./KetikReviewMessage";
import { KetikReviewAttachmentPreview } from "./KetikReviewAttachmentPreview";
import { KetikReviewWait } from "./KetikReviewWait";
import { ReviewResult } from "./KetikReviewResult";
import {
  focusReviewTarget,
  type KetikReviewTarget,
} from "../utils/reviewNavigation";
import { KetikStageNav } from "./KetikStageNav";
import { SessionReplayModal } from "./SessionReplayModal";
import {
  KetikVerificationMarker,
  KetikVisibleConsumerData,
} from "./KetikReviewVerification";

interface KetikReviewStageProps {
  session: KetikHistoryDetail;
  previousScore: number | null;
  canStartReview: boolean;
  onSessionChange: (session: KetikSessionHistoryItem) => void;
  onBack: () => void;
  onPracticeAgain: () => void;
}

const sectionTitle =
  "font-display text-lg leading-7 font-bold tracking-tight text-foreground";

/** Tahap Telaah KETIK: transkrip di kiri, hasil telaah di kanan. */
export function KetikReviewStage({
  session,
  previousScore,
  canStartReview,
  onSessionChange,
  onBack,
  onPracticeAgain,
}: KetikReviewStageProps) {
  const review = useKetikReviewStatus(session, onSessionChange);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<KetikHistoryAttachment | null>(
    null,
  );
  const attachmentTrigger = useRef<HTMLButtonElement | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [target, setTarget] = useState<KetikReviewTarget | null>(null);
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
  const education = review.phase === "ready" ? review.review?.education : null;
  const anomalies = useMemo(
    () =>
      detectKetikSessionAnomalies({
        nik: session.consumerNik,
        email: session.consumerEmail,
        city: session.consumerCity,
      }),
    [session.consumerNik, session.consumerEmail, session.consumerCity],
  );
  // Malformed values are marked wherever the consumer repeats them.
  const anomalyWords = useMemo(
    () => anomalies.map((anomaly) => anomaly.highlight),
    [anomalies],
  );
  const verification = education?.verification ?? null;
  const missedBefore =
    verification && verification.status !== "confirmed"
      ? verification.missedBeforeMessageId
      : null;
  const quoteMarks = useMemo(
    () =>
      buildQuoteMarks(
        education?.consumerPoints ?? [],
        education?.agentNotes ?? [],
        setTarget,
      ),
    [education],
  );
  // Huruf poin konsumen yang dijawab oleh tiap pesan agen.
  const answersByMessage = useMemo(() => {
    const map = new Map<string, string[]>();
    (education?.consumerPoints ?? []).forEach((point, index) => {
      if (!point.answerMessageId) return;
      map.set(point.answerMessageId, [
        ...(map.get(point.answerMessageId) ?? []),
        pointLetter(index),
      ]);
    });
    return map;
  }, [education]);

  const showMessage = (messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (!element) return;
    setHighlightedId(messageId);
    focusReviewTarget(element);
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
        {session.transcriptProvenance === "legacy" && (
          <p className="text-[13px] text-muted-foreground">
            Transkrip lama belum terverifikasi server.
          </p>
        )}
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

      <div
        data-review-scroll
        className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
      >
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
          <KetikVisibleConsumerData
            values={{
              city: session.consumerCity,
              phone: session.consumerPhone,
              nik: session.consumerNik,
              email: session.consumerEmail,
            }}
            anomalies={anomalies}
          />
          <ol className="flex flex-col gap-3">
            {messages.map((message) => {
              if (message.sender === "system") return null;
              const number = numbers.get(message.id);
              const isAgent = message.sender === "agent";
              const timestamp = message.timestamp
                ? new Date(message.timestamp)
                : null;
              const hasValidTimestamp =
                timestamp !== null && Number.isFinite(timestamp.getTime());
              const flagged = typosByMessage.has(message.id);
              const answers = answersByMessage.get(message.id);
              const marker =
                verification && message.id === missedBefore ? (
                  <KetikVerificationMarker status={verification.status} />
                ) : null;
              return (
                <Fragment key={message.id}>
                  {marker}
                  <li
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
                    <div
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
                      <KetikReviewMessage
                        text={message.text}
                        attachments={session.attachments ?? []}
                        marks={quoteMarks.get(message.id) ?? []}
                        typoWords={
                          isAgent
                            ? (typosByMessage.get(message.id) ?? [])
                            : anomalyWords
                        }
                        onOpen={(selected, trigger) => {
                          attachmentTrigger.current = trigger;
                          setAttachment(selected);
                        }}
                      />
                      {answers && (
                        <span className="mt-1 block text-xs font-medium">
                          Menjawab poin {answers.join(", ")}
                        </span>
                      )}
                      {hasValidTimestamp && (
                        <time
                          dateTime={message.timestamp}
                          className={cn(
                            "mt-1 block text-right text-[13px] font-medium tabular-nums",
                            isAgent
                              ? "text-module-ketik-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                    </div>
                  </li>
                </Fragment>
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
          {review.pollFailed && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
            >
              <p>Status telaah belum dapat diperbarui.</p>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={review.refreshStatus}
              >
                Coba cek status
              </Button>
            </div>
          )}
          {review.phase === "ready" && review.review ? (
            <ReviewResult
              session={session}
              previousScore={previousScore}
              review={review.review}
              typos={review.typos}
              numbers={numbers}
              onShowMessage={showMessage}
              target={target}
              rerunFailed={review.rerunFailed}
              onRerun={canStartReview ? () => setRerunOpen(true) : null}
              rerunsLeft={review.rerunsLeft}
              rerunRefusal={review.rerunRefusal}
            />
          ) : review.phase === "reviewing" ||
            review.phase === "loading-result" ? (
            <ReviewProgress
              loadingResult={review.phase === "loading-result"}
              queueStatus={review.queueStatus}
            />
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

      <KetikReviewAttachmentPreview
        attachment={attachment}
        onClose={() => setAttachment(null)}
        container={layer}
        trigger={attachmentTrigger}
      />

      <ConfirmDialog
        open={rerunOpen}
        title="Telaah ulang sesi ini?"
        description={`AI menilai percakapan ini sekali lagi dan hasil sekarang diganti dengan yang baru. Bila telaah ulang gagal, hasil sekarang tetap dipakai.${review.rerunsLeft === 1 ? " Anda bisa menelaah ulang 1 kali untuk sesi ini." : ""}`}
        confirmLabel="Telaah ulang"
        confirmVariant="default"
        container={layer}
        onCancel={() => setRerunOpen(false)}
        onConfirm={() => {
          setRerunOpen(false);
          void review.rerun();
        }}
      />

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
            Anda belum memiliki izin menelaah sesi ini. Hubungi trainer Anda.
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

function ReviewProgress({
  loadingResult,
  queueStatus,
}: {
  loadingResult: boolean;
  queueStatus: "queued" | "processing" | null;
}) {
  const title = loadingResult
    ? "Memuat hasil telaah"
    : queueStatus === "queued"
      ? "Menunggu giliran telaah"
      : queueStatus === "processing"
        ? "Sedang ditelaah AI"
        : "Memeriksa permintaan telaah";
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <h3 className={sectionTitle}>{title}</h3>
      <p className="text-[15px] leading-6 text-fg2">
        {loadingResult
          ? "Hasil sudah tersedia dan sedang dimuat."
          : "Percakapan tetap tersimpan. Anda boleh meninggalkan halaman ini dan kembali untuk melihat hasilnya."}
      </p>
      {!loadingResult && <KetikReviewWait />}
    </div>
  );
}

const FAILURE_COPY: Record<KetikReviewFailure, string> = {
  review: "AI belum memberi hasil telaah.",
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
