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
  numberReplyNotes,
  noteNumberForQuote,
  type PlacedReplyAnnotation,
  placeConsumerPoints,
  consumerPointReplyEnd,
  type PlacedConsumerPoint,
  renderHighlights,
} from "../../../lib/pdkt-reply-marks";
import { PdktScoreBreakdown } from "./PdktScoreBreakdown";
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
  level = 3,
  pane = false,
  className,
  children,
}: {
  title: string;
  /** Bagian yang bersarang di dalam `Section` lain memakai `<h4>`. */
  level?: 3 | 4;
  /** Bagian dari permukaan bersama: tanpa bingkai kartu sendiri. */
  pane?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const Heading = level === 4 ? "h4" : "h3";
  return (
    <section
      aria-labelledby={id}
      className={cn(pane ? "p-5" : card, "flex flex-col gap-4", className)}
    >
      <Heading id={id} className="text-sm font-semibold text-foreground">
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** Kalimat balasan yang dimaksud langkah perbaikan, tertaut ke tandanya. */
function ActionQuote({
  quote,
  noteNumber,
  replyIdBase,
}: {
  quote: string | undefined;
  noteNumber: number | null;
  replyIdBase: string;
}) {
  if (!quote) return null;
  const target =
    noteNumber === null ? null : replyMarkId(replyIdBase, noteNumber);
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm leading-6 text-foreground">
      <span>Di balasan Anda: “{quote}”</span>
      {target && (
        <a
          href={`#${target}`}
          onClick={(event) => {
            event.preventDefault();
            jumpTo(target);
          }}
          className={cn(
            // Teks tautan kecil agar baris tidak merenggang; area sentuh 44px.
            "relative text-xs font-semibold text-foreground underline underline-offset-4 after:absolute after:inset-x-0 after:top-1/2 after:h-[44px] after:-translate-y-1/2",
            focusRing,
          )}
        >
          Lihat kalimat ini di balasan
        </a>
      )}
    </span>
  );
}

function ScoreSummary({
  result,
  timeTaken,
  notes,
  replyBody,
  replyIdBase,
}: {
  result: PdktEvaluationResult;
  timeTaken: number | null | undefined;
  notes: PlacedReplyAnnotation[];
  replyBody: string;
  replyIdBase: string;
}) {
  const [first, ...rest] = pdktRankedActionItems(result);
  const quoteOf = (action: (typeof rest)[number]) => (
    <ActionQuote
      quote={action.quote}
      noteNumber={noteNumberForQuote(notes, replyBody, action.quote)}
      replyIdBase={replyIdBase}
    />
  );
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
        <p className="text-[13px] leading-6 text-muted-foreground">
          Langkah tanpa kutipan merupakan saran umum, bukan bukti kesalahan pada
          kalimat tertentu.
        </p>
      )}
      {first && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-[12px] font-semibold text-foreground">
            Perbaiki ini dulu
          </span>
          <p className="text-sm leading-6 text-foreground">{first.text}</p>
          {quoteOf(first)}
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
                {quoteOf(action)}
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

/** Gulir `container` agar `target` berada di tengahnya. */
function centerWithin(
  container: HTMLElement,
  target: HTMLElement,
  behavior: ScrollBehavior,
) {
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  container.scrollBy({
    top: rect.top - box.top - (container.clientHeight - rect.height) / 2,
    behavior,
  });
}

/**
 * Gulir ke penanda atau catatan pasangannya lalu fokuskan, tanpa mengubah URL.
 * Hanya area Telaah (dan panel yang bergulir sendiri di dalamnya) yang
 * digulir: `scrollIntoView` ikut menggeser kerangka aplikasi yang
 * overflow-hidden, dan pengguna tidak bisa menggulirnya balik.
 */
function jumpTo(id: string) {
  const target = document.getElementById(id);
  const root = target?.closest<HTMLElement>("[data-review-scroll]");
  if (!target || !root) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  for (
    let pane = target.parentElement;
    pane && pane !== root;
    pane = pane.parentElement
  ) {
    if (
      pane.scrollHeight > pane.clientHeight &&
      /auto|scroll/.test(getComputedStyle(pane).overflowY)
    ) {
      centerWithin(pane, target, "auto");
    }
  }
  centerWithin(root, target, reduceMotion ? "auto" : "smooth");
  target.focus({ preventScroll: true });
}

const focusRing =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-chart-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated";
// Tujuan lompatan difokuskan lewat skrip sesudah klik mouse; `focus-visible`
// tidak menyala di situ, jadi sorotannya memakai `focus`.
const jumpTarget =
  "outline-none focus:ring-2 focus:ring-chart-orange focus:ring-offset-2 focus:ring-offset-surface-elevated";

// Status dibedakan oleh warna dan gaya garis (utuh/putus/titik), tidak hanya
// warna; label status di daftar memakai garis yang sama sebagai legenda.
const consumerStatus = {
  answered: {
    label: "Terjawab",
    line: "decoration-chart-green decoration-solid",
    tint: "bg-chart-green/15",
  },
  partial: {
    label: "Sebagian",
    line: "decoration-chart-amber decoration-dashed",
    tint: "bg-chart-amber/15",
  },
  unanswered: {
    label: "Belum terjawab",
    line: "decoration-chart-red decoration-dotted",
    tint: "bg-chart-red/15",
  },
} as const;
const statusLine = "underline decoration-2 underline-offset-4";
const pointLinkLabel = (point: PlacedConsumerPoint) =>
  `Lihat poin konsumen ${point.letter}, ${consumerStatus[point.status].label.toLowerCase()}`;
const replyMarkId = (base: string, number: number) => `${base}-mark-${number}`;
const replyNoteId = (base: string, number: number) => `${base}-note-${number}`;
const consumerNoteId = (base: string, letter: string) =>
  `${base}-consumer-note-${letter}`;
const consumerMarkId = (base: string, letter: string) =>
  `${base}-consumer-mark-${letter}`;
const pointLinkClass = cn(
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-xs font-bold text-foreground no-underline",
  focusRing,
  jumpTarget,
);
// Label huruf di dalam teks tetap kecil agar baris tidak merenggang; area
// sentuhnya diperluas ke 44px lewat pseudo-elemen (z-10). Huruf yang terlihat
// (z-20) selalu di atas area sentuh label tetangga.
const pointInlineLinkClass = cn(
  "relative rounded-sm px-0.5 text-xs leading-none font-bold text-foreground no-underline after:absolute after:z-10 after:top-1/2 after:left-1/2 after:size-[44px] after:-translate-x-1/2 after:-translate-y-1/2",
  jumpTarget,
);

/** Balasan bertanda dan catatan bernomornya; penanda dan catatan saling tertaut. */
function ReplyWithNotes({
  result,
  replyBody,
  consumerPoints,
  consumerIdBase,
  idBase,
}: {
  result: PdktEvaluationResult;
  replyBody: string;
  consumerPoints: PlacedConsumerPoint[];
  consumerIdBase: string;
  /** Dibagi dengan ringkasan skor agar langkah perbaikan bisa menautkan tanda. */
  idBase: string;
}) {
  const markId = (number: number) => replyMarkId(idBase, number);
  const noteId = (number: number) => replyNoteId(idBase, number);
  const insertions = consumerPoints.flatMap((point) => {
    const at = consumerPointReplyEnd(point, replyBody);
    if (at === null) return [];
    const target = consumerNoteId(consumerIdBase, point.letter);
    return [
      {
        at,
        node: (
          <sup key={point.letter} className="ml-0.5">
            <a
              href={`#${target}`}
              aria-label={pointLinkLabel(point)}
              className={pointInlineLinkClass}
              onClick={(event) => {
                event.preventDefault();
                jumpTo(target);
              }}
            >
              <span className="relative z-20">{point.letter}</span>
            </a>
          </sup>
        ),
      },
    ];
  });
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
            // Di atas area sentuh label poin konsumen yang bisa bersebelahan.
            className={cn(
              "relative z-20 rounded-sm text-foreground no-underline",
              jumpTarget,
            )}
          >
            {number}
          </a>
        </sup>
      </mark>
    ),
    insertions,
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
                  {note.example && (
                    <span className="text-sm text-foreground">
                      Contoh: “{note.example}”
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {note.kind === "transition"
                      ? "Kalimat penghubung"
                      : (PDKT_DIMENSION_LABELS[note.dimension] ??
                        note.dimension)}
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
  // Telaah bertanda sudah menampilkan ejaan dan kejelasan di "Catatan pada
  // balasan"; hanya telaah lama yang masih membutuhkannya di sini.
  const notedInReply = Array.isArray(result.annotations);
  const otherFindings = [
    ...(notedInReply ? [] : (result.typos ?? [])).map((text) => ({
      kind: "Ejaan",
      text,
    })),
    ...(notedInReply ? [] : (result.clarityIssues ?? [])).map((text) => ({
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

function ConsumerEmail({
  item,
  marks,
  idBase,
}: {
  item: PdktMailboxDetailItem;
  marks: ReturnType<typeof placeConsumerPoints>;
  idBase: string;
}) {
  const inbound = readInboundEmail(item);
  return (
    <Section
      pane
      title="Email konsumen"
      className="lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
    >
      {marks.points.length > 0 ? (
        <div className="flex flex-col gap-3 text-sm leading-6 break-words text-foreground">
          {marks.paragraphs.map((parts, index) => (
            <p key={index} className="whitespace-pre-wrap">
              {parts}
            </p>
          ))}
        </div>
      ) : (
        <EmailBody
          body={inbound.body}
          className="flex flex-col gap-3 text-sm leading-6"
        />
      )}
      <EmailAttachments attachments={inbound.attachments} size="compact" />
      {marks.points.length > 0 && (
        <Section
          pane
          level={4}
          title="Poin konsumen"
          className="border-t border-border px-0 pb-0"
        >
          <ol className="flex flex-col gap-3">
            {marks.points.map((point) => {
              // Lingkaran 24px berwarna status, senada dengan tandanya di email.
              const chip = cn(
                "flex size-6 items-center justify-center rounded-full",
                consumerStatus[point.status].tint,
              );
              return (
                <li
                  key={point.letter}
                  id={consumerNoteId(idBase, point.letter)}
                  tabIndex={-1}
                  className={cn("flex gap-2 rounded-sm text-sm", jumpTarget)}
                >
                  {point.marked ? (
                    <a
                      href={`#${consumerMarkId(idBase, point.letter)}`}
                      aria-label={`Kembali ke poin konsumen ${point.letter} di email`}
                      className={cn(pointLinkClass, "shrink-0 self-start")}
                      onClick={(event) => {
                        event.preventDefault();
                        jumpTo(consumerMarkId(idBase, point.letter));
                      }}
                    >
                      <span className={chip}>{point.letter}</span>
                    </a>
                  ) : (
                    <span className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center self-start text-xs font-bold">
                      <span className={chip}>{point.letter}</span>
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-1 break-words py-2">
                    <strong className="font-semibold text-foreground">
                      {point.summary}
                    </strong>
                    <span className="text-xs text-foreground">
                      <span
                        className={cn(
                          statusLine,
                          consumerStatus[point.status].line,
                        )}
                      >
                        {consumerStatus[point.status].label}
                      </span>
                    </span>
                    {point.reason && (
                      <span className="text-sm text-foreground">
                        {point.reason}
                      </span>
                    )}
                    {!point.marked && (
                      <span className="text-xs text-muted-foreground">
                        Tidak ditandai di email: “{point.quote}”
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </Section>
  );
}

/** Email konsumen dan balasan dalam satu permukaan agar mudah dicocokkan. */
function Comparison({
  item,
  marks,
  idBase,
  children,
}: {
  item: PdktMailboxDetailItem;
  marks: ReturnType<typeof placeConsumerPoints>;
  idBase: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Perbandingan email"
      className="grid items-start rounded-xl border border-border bg-surface-elevated lg:grid-cols-2"
    >
      <ConsumerEmail item={item} marks={marks} idBase={idBase} />
      <div className="border-t border-border lg:border-t-0 lg:border-l">
        {children}
      </div>
    </section>
  );
}

const incompleteReview = {
  marks: {
    label: "Telaah lama tanpa penanda",
    text: "Telaah ini dibuat sebelum fitur penanda kalimat ada, jadi AI belum menandai kalimat yang perlu diperbaiki. Telaah ulang untuk melihat tandanya di balasan Anda.",
  },
  points: {
    label: "Telaah tanpa poin konsumen",
    text: "Telaah ini belum menandai permintaan di email konsumen. Telaah ulang untuk melihat poin mana yang sudah dan belum Anda jawab.",
  },
} as const;

/**
 * Telaah tanpa `annotations` (sebelum penanda kalimat ada) atau tanpa poin
 * konsumen bisa ditelaah ulang; backend mengizinkan keduanya.
 */
function IncompleteReviewNotice({
  missing,
  onRetry,
}: Pick<Props, "onRetry"> & { missing: keyof typeof incompleteReview }) {
  return (
    // Pemberitahuan statis: region berlabel, bukan role="alert" yang menyela.
    <Alert
      role="region"
      aria-label={incompleteReview[missing].label}
      className="items-start gap-y-3 px-4 py-3"
    >
      <Info aria-hidden="true" className="text-module-pdkt" />
      <p className="max-w-prose text-sm leading-6 text-foreground">
        {incompleteReview[missing].text}
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
  if (status === "unavailable")
    return (
      <Alert
        role="region"
        aria-label="Telaah yang dihapus"
        className="items-start"
      >
        <Info aria-hidden="true" />
        <div>
          <AlertDescription className="font-semibold text-foreground">
            Telaah sudah dihapus
          </AlertDescription>
          <p className="mt-1 text-sm leading-6 text-foreground">
            Riwayat latihan ini sudah dihapus. Email dan balasan Anda tetap
            tersedia di kotak masuk.
          </p>
        </div>
      </Alert>
    );
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
  const consumerIdBase = useId();
  const replyIdBase = useId();
  const consumerMarks = placeConsumerPoints(
    completed ? result.consumerPoints : undefined,
    readInboundEmail(item).body,
    (text, point, withLabel) => {
      const target = consumerNoteId(consumerIdBase, point.letter);
      return (
        <mark
          key={point.letter}
          className={cn(
            "text-foreground [box-decoration-break:clone]",
            statusLine,
            consumerStatus[point.status].line,
            consumerStatus[point.status].tint,
          )}
        >
          {text}
          {withLabel && (
            <sup className="ml-0.5">
              <a
                id={consumerMarkId(consumerIdBase, point.letter)}
                href={`#${target}`}
                aria-label={pointLinkLabel(point)}
                className={pointInlineLinkClass}
                onClick={(event) => {
                  event.preventDefault();
                  jumpTo(target);
                }}
              >
                <span className="relative z-20">{point.letter}</span>
              </a>
            </sup>
          )}
        </mark>
      );
    },
  );

  return (
    <div data-review-scroll className="flex-1 overflow-y-auto">
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
            {!result.annotations ? (
              <IncompleteReviewNotice missing="marks" onRetry={onRetry} />
            ) : (
              !result.consumerPoints?.length && (
                <IncompleteReviewNotice missing="points" onRetry={onRetry} />
              )
            )}
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <ScoreSummary
                result={result}
                timeTaken={item.time_taken}
                notes={numberReplyNotes(result.annotations, replyBody)}
                replyBody={replyBody}
                replyIdBase={replyIdBase}
              />
              <PdktScoreBreakdown result={result} />
            </div>
          </>
        ) : (
          <ReviewPending status={status} onRetry={onRetry} />
        )}

        <Comparison item={item} marks={consumerMarks} idBase={consumerIdBase}>
          {completed ? (
            <ReplyWithNotes
              result={result}
              replyBody={replyBody}
              consumerPoints={consumerMarks.points}
              consumerIdBase={consumerIdBase}
              idBase={replyIdBase}
            />
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
