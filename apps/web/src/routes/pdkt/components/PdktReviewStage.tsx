import type { ReactNode } from "react";
import { useId } from "react";
import { AlertCircle, Info, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "cn";
import type {
  PdktEvaluationResult,
  PdktMailboxDetailItem,
} from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { CopyInlineButton } from "../../../components/PdktEducationSections";
import { PDKT_DIMENSION_LABELS } from "../../../lib/pdkt-dimensions";
import {
  placeReplyAnnotations,
  renderHighlights,
} from "../../../lib/pdkt-reply-marks";
import { EmailAttachments } from "./EmailAttachments";
import { EmailBody } from "./EmailDetailPane";
import type { MailboxReviewState } from "./MailboxSidebar";
import {
  PDKT_NO_SUBJECT,
  readAgentReply,
  readInboundEmail,
} from "../utils/emailDisplay";
import {
  formatPdktDuration,
  pdktRankedActionItems,
  pdktReviewDimensionRows,
  pdktScoreGrade,
} from "../utils/reviewSummary";

interface Props {
  item: PdktMailboxDetailItem;
  status: MailboxReviewState["status"] | null;
  result: PdktEvaluationResult | null;
  /** Memulai atau mengulang telaah (status `failed` atau `not_started`). */
  onRetry: () => void;
  onInbox: () => void;
  onDelete?: () => void;
  /** Tanpa `onPracticeAgain` tombol latihan lagi tidak tampil. */
  onPracticeAgain?: () => void;
  practiceLabel: string;
  isStartingPractice: boolean;
  practiceUnavailableReason?: string;
}

const card = "rounded-xl border border-border bg-surface-elevated p-5";

function Section({
  title,
  pane = false,
  className,
  children,
}: {
  title: string;
  /** Bagian dari permukaan bersama: tanpa bingkai kartu sendiri. */
  pane?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(pane ? "p-5" : card, "flex flex-col gap-4", className)}
    >
      <h3 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScoreSummary({
  result,
  timeTaken,
}: {
  result: PdktEvaluationResult;
  timeTaken: number | null | undefined;
}) {
  const [first, ...rest] = pdktRankedActionItems(result);
  const alignment = result.expectedAnswerAlignment;
  const score = Math.max(0, Math.min(100, Math.round(result.score)));

  return (
    <section
      aria-label="Ringkasan skor"
      className={cn(card, "flex flex-col gap-4")}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Skor total
        </span>
        <p className="flex items-baseline gap-2">
          <span
            data-testid="pdkt-review-score"
            className="font-display text-5xl leading-none font-bold tracking-tight"
          >
            {score}
          </span>
          <span className="text-sm text-muted-foreground">
            dari 100 · {pdktScoreGrade(score)}
          </span>
        </p>
      </div>
      <div
        aria-hidden="true"
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-foreground"
          style={{ width: `${score}%` }}
        />
      </div>

      {first && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-[12px] font-semibold text-foreground">
            Perbaiki ini dulu
          </span>
          <p className="text-sm leading-6 text-foreground">{first.text}</p>
          {first.example && (
            <p className="text-sm leading-6 text-foreground">
              Contoh: <q>{first.example}</q>
            </p>
          )}
          <span className="text-[12px] text-fg2">
            Aspek: {PDKT_DIMENSION_LABELS[first.dimension]}
          </span>
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Langkah berikutnya
          </span>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-6">
            {rest.map((action) => (
              <li key={`${action.priorityRank}-${action.dimension}`}>
                {action.text}
                {action.example && (
                  <span className="text-muted-foreground">
                    {" "}
                    Contoh: “{action.example}”
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {(alignment || timeTaken) && (
        <dl className="flex flex-col gap-2 border-t border-border pt-4 text-xs">
          {alignment && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">
                Kesesuaian dengan kunci jawaban
              </dt>
              <dd className="text-sm font-semibold text-foreground">
                {alignment.category}
              </dd>
              <dd className="leading-5 text-muted-foreground">
                {alignment.reason}
              </dd>
            </div>
          )}
          {timeTaken ? (
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Waktu pengerjaan</dt>
              <dd className="font-medium text-foreground">
                {formatPdktDuration(timeTaken)}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

function ScoreBreakdown({ result }: { result: PdktEvaluationResult }) {
  const rows = pdktReviewDimensionRows(result);
  if (rows.length === 0) return null;

  return (
    <Section title="Rincian skor">
      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.dimension} className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {row.label}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {row.description}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {row.low && (
                  <span className="text-[12px] font-semibold text-foreground">
                    Perlu perbaikan
                  </span>
                )}
                <span className="font-mono text-sm font-bold">{row.value}</span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  row.low ? "bg-chart-orange" : "bg-foreground/70",
                )}
                style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
              />
            </div>
            {row.tip && (
              <p className="text-xs leading-5 text-muted-foreground">
                {row.tip}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Gulir ke penanda atau catatan pasangannya lalu fokuskan, tanpa mengubah URL. */
function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  target.scrollIntoView({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth",
  });
  target.focus({ preventScroll: true });
}

const focusRing =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-chart-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated";
// Tujuan lompatan difokuskan lewat skrip sesudah klik mouse; `focus-visible`
// tidak menyala di situ, jadi sorotannya memakai `focus`.
const jumpTarget =
  "outline-none focus:ring-2 focus:ring-chart-orange focus:ring-offset-2 focus:ring-offset-surface-elevated";

/** Balasan bertanda dan catatan bernomornya; penanda dan catatan saling tertaut. */
function ReplyWithNotes({
  result,
  replyBody,
}: {
  result: PdktEvaluationResult;
  replyBody: string;
}) {
  const idBase = useId();
  const markId = (number: number) => `${idBase}-mark-${number}`;
  const noteId = (number: number) => `${idBase}-note-${number}`;
  const { notes, segments } = placeReplyAnnotations(
    result.annotations,
    replyBody,
    (text, number) => (
      <mark
        key={number}
        className="bg-chart-orange/15 px-0.5 text-foreground underline decoration-chart-orange decoration-2 underline-offset-4 [box-decoration-break:clone]"
      >
        {text}
        <sup className="ml-0.5 text-xs font-bold">
          <a
            id={markId(number)}
            href={`#${noteId(number)}`}
            aria-label={`Lihat catatan ${number}`}
            onClick={(event) => {
              event.preventDefault();
              jumpTo(noteId(number));
            }}
            className={cn(
              "rounded-sm text-foreground no-underline",
              jumpTarget,
            )}
          >
            {number}
          </a>
        </sup>
      </mark>
    ),
  );

  return (
    <div className="flex flex-col divide-y divide-border">
      <Section pane title="Balasan Anda">
        <p className="text-sm leading-7 whitespace-pre-wrap text-foreground">
          {segments}
        </p>
      </Section>

      {notes.length > 0 && (
        <Section pane title="Catatan pada balasan">
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li
                key={note.number}
                id={noteId(note.number)}
                tabIndex={-1}
                className={cn(
                  "-mx-2 flex gap-3 rounded-lg px-2 py-1 text-sm focus:bg-chart-orange/10",
                  jumpTarget,
                )}
              >
                {note.marked ? (
                  <a
                    href={`#${markId(note.number)}`}
                    aria-label={`Kembali ke kalimat bertanda ${note.number}`}
                    onClick={(event) => {
                      event.preventDefault();
                      jumpTo(markId(note.number));
                    }}
                    // Lingkaran 24px; area sentuh diperluas ke 44px.
                    className={cn(
                      "relative flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-orange/15 text-xs font-bold text-foreground after:absolute after:-inset-[10px] hover:bg-chart-orange/25",
                      focusRing,
                    )}
                  >
                    {note.number}
                  </a>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold"
                  >
                    {note.number}
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="sr-only">Catatan {note.number}: </span>
                  <strong className="font-semibold text-foreground">
                    {note.note}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {PDKT_DIMENSION_LABELS[note.dimension] ?? note.dimension}
                    {note.marked
                      ? null
                      : ` · Tidak ditandai di balasan: “${note.quote}”`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function OtherFindings({ result }: { result: PdktEvaluationResult }) {
  const otherFindings = [
    ...(result.typos ?? []).map((text) => ({ kind: "Ejaan", text })),
    ...(result.clarityIssues ?? []).map((text) => ({
      kind: "Kejelasan",
      text,
    })),
    ...(result.contentGaps ?? []).map((text) => ({
      kind: "Isi yang kurang",
      text,
    })),
  ];
  const feedback = result.feedback?.trim();
  if (otherFindings.length === 0 && !feedback) return null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {otherFindings.length > 0 && (
        <Section title="Temuan lain">
          <ul className="flex flex-col gap-2 text-sm leading-6">
            {otherFindings.map((finding, index) => (
              <li key={index}>
                <span className="text-xs font-semibold text-muted-foreground">
                  {finding.kind}:
                </span>{" "}
                {finding.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {feedback && (
        <Section title="Catatan AI">
          <p className="text-sm leading-6 text-foreground">{result.feedback}</p>
        </Section>
      )}
    </div>
  );
}

function ConsumerEmail({ item }: { item: PdktMailboxDetailItem }) {
  const inbound = readInboundEmail(item);
  return (
    // Tetap terlihat saat balasan dan catatan yang panjang digulir; email
    // yang lebih tinggi dari layar bergulir di panelnya sendiri.
    <Section
      pane
      title="Email konsumen"
      className="lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
    >
      <EmailBody
        body={inbound.body}
        className="flex flex-col gap-3 text-sm leading-6"
      />
      <EmailAttachments attachments={inbound.attachments} size="compact" />
    </Section>
  );
}

/** Email konsumen dan balasan dalam satu permukaan agar mudah dicocokkan. */
function Comparison({
  item,
  children,
}: {
  item: PdktMailboxDetailItem;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Perbandingan email"
      className="grid items-start rounded-xl border border-border bg-surface-elevated lg:grid-cols-2"
    >
      <ConsumerEmail item={item} />
      <div className="border-t border-border lg:border-t-0 lg:border-l">
        {children}
      </div>
    </section>
  );
}

/** Telaah yang dibuat sebelum penanda kalimat ada tidak menyimpan `annotations`. */
function MarksMissingNotice({ onRetry }: Pick<Props, "onRetry">) {
  return (
    // Pemberitahuan statis: region berlabel, bukan role="alert" yang menyela.
    <Alert
      role="region"
      aria-label="Telaah lama tanpa penanda"
      className="items-start gap-y-3 px-4 py-3"
    >
      <Info aria-hidden="true" className="text-module-pdkt" />
      <p className="max-w-prose text-sm leading-6 text-foreground">
        Telaah ini dibuat sebelum fitur penanda kalimat ada, jadi AI belum
        menandai kalimat yang perlu diperbaiki. Telaah ulang untuk melihat
        tandanya di balasan Anda.
      </p>
      <div className="col-start-2">
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="min-h-[44px] gap-1.5 text-xs"
        >
          <RotateCcw aria-hidden="true" />
          Telaah ulang
        </Button>
      </div>
    </Alert>
  );
}

function ReviewPending({ status, onRetry }: Pick<Props, "status" | "onRetry">) {
  if (status === "failed") {
    // Teks galat dari server/AI tidak pernah ditampilkan ke peserta.
    return (
      <Alert variant="destructive" className="items-start">
        <AlertCircle aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <AlertDescription className="font-semibold text-foreground">
            Telaah gagal
          </AlertDescription>
          <p className="text-xs leading-5 text-foreground">
            AI belum bisa menelaah balasan ini. Balasan Anda tetap tersimpan.
            Coba lagi dalam beberapa saat.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="min-h-[44px] gap-1.5 text-xs"
        >
          <RotateCcw aria-hidden="true" />
          Coba lagi
        </Button>
      </Alert>
    );
  }
  if (status === "not_started") {
    return (
      <div
        className={cn(
          card,
          "flex flex-wrap items-center justify-between gap-3",
        )}
      >
        <p className="text-sm text-fg2">Telaah belum dimulai.</p>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="min-h-[44px] text-xs"
        >
          Mulai telaah
        </Button>
      </div>
    );
  }
  return (
    <div role="status" className={cn(card, "flex items-center gap-3")}>
      <Loader2
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin text-module-pdkt motion-reduce:animate-none"
      />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">Sedang ditelaah AI…</span>
        <span className="text-xs text-muted-foreground">
          Hasil telaah muncul di sini begitu selesai. Anda boleh kembali ke
          kotak masuk.
        </span>
      </span>
    </div>
  );
}

/** Tahap Telaah: hasil telaah AI atas balasan yang sudah dikirim. */
export function PdktReviewStage({
  item,
  status,
  result,
  onRetry,
  onInbox,
  onDelete,
  onPracticeAgain,
  practiceLabel,
  isStartingPractice,
  practiceUnavailableReason,
}: Props) {
  const practiceReasonId = useId();
  const replyBody = readAgentReply(item);
  const completed = status === "completed" && result;
  const rewrite = completed ? result.edu?.suggestedRewrite : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-6">
        <h2 className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Balasan untuk {item.sender_name}
          </span>
          <span className="font-display text-2xl leading-8 font-bold tracking-tight text-balance">
            {item.subject || PDKT_NO_SUBJECT}
          </span>
        </h2>

        {completed ? (
          <>
            {!result.annotations && <MarksMissingNotice onRetry={onRetry} />}
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <ScoreSummary result={result} timeTaken={item.time_taken} />
              <ScoreBreakdown result={result} />
            </div>
          </>
        ) : (
          <ReviewPending status={status} onRetry={onRetry} />
        )}

        <Comparison item={item}>
          {completed ? (
            <ReplyWithNotes result={result} replyBody={replyBody} />
          ) : (
            replyBody && (
              <Section pane title="Balasan Anda">
                <p className="text-sm leading-7 whitespace-pre-wrap">
                  {replyBody}
                </p>
              </Section>
            )
          )}
        </Comparison>

        {completed && <OtherFindings result={result} />}

        {rewrite?.body && (
          <details className={cn(card, "group")}>
            <summary className="min-h-[44px] cursor-pointer content-center text-sm font-semibold">
              Lihat contoh balasan yang lebih baik
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {rewrite.subject && (
                <p className="text-sm font-semibold">
                  Subjek: {rewrite.subject}
                </p>
              )}
              {rewrite.highlights?.some(Boolean) && (
                <p className="text-xs text-muted-foreground">
                  Bagian yang disorot hijau adalah perbaikan dari balasan Anda.
                </p>
              )}
              <p className="text-sm leading-7 whitespace-pre-line">
                {renderHighlights(
                  rewrite.body,
                  rewrite.highlights,
                  "rounded bg-chart-green/15 px-0.5 text-foreground",
                )}
              </p>
              <div>
                <CopyInlineButton
                  text={[
                    rewrite.subject ? `Subjek: ${rewrite.subject}` : "",
                    rewrite.body,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                />
              </div>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="min-h-[44px] gap-2 px-3 text-xs"
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
              Hapus email
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onInbox}
              className="min-h-[44px]"
            >
              Kembali ke kotak masuk
            </Button>
            {onPracticeAgain && (
              <Button
                type="button"
                onClick={onPracticeAgain}
                disabled={
                  isStartingPractice || Boolean(practiceUnavailableReason)
                }
                aria-describedby={
                  practiceUnavailableReason ? practiceReasonId : undefined
                }
                className="min-h-[44px]"
              >
                {isStartingPractice ? "Membuat email…" : practiceLabel}
              </Button>
            )}
          </div>
        </div>
        {practiceUnavailableReason && (
          <p id={practiceReasonId} className="text-sm text-muted-foreground">
            {practiceUnavailableReason}
          </p>
        )}
      </div>
    </div>
  );
}
