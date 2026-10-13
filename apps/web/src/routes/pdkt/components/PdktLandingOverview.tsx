import { ArrowRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import type { SessionHistory } from "./HistoryModal";
import {
  formatPdktDate,
  formatPdktRelativeDay,
  type PdktLandingSummary,
} from "../utils/landingSummary";

export type PdktLoadState = "loading" | "ready" | "error";

interface PdktLandingOverviewProps {
  summary: PdktLandingSummary;
  historyState: PdktLoadState;
  mailboxState: PdktLoadState;
  onRetryHistory: () => void;
  onRetryMailbox: () => void;
  onOpenMailbox: (mailboxId?: string) => void;
  onOpenSession: (session: SessionHistory) => void;
  onOpenHistory: () => void;
}

const headingClass =
  "font-display text-xl leading-7 font-bold tracking-tight text-foreground";

function SectionHeader({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className={headingClass}>
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function LoadProblem({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-foreground"
    >
      {message}
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

function Stat({
  testId,
  label,
  value,
  note,
  busy,
}: {
  testId: string;
  label: string;
  value: string;
  note: string;
  busy: boolean;
}) {
  return (
    <div
      data-testid={testId}
      aria-busy={busy}
      className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-xl border border-border bg-surface-elevated px-6 py-5"
    >
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <span className="font-mono text-3xl leading-9 font-bold tabular-nums text-foreground">
        {busy ? "–" : value}
      </span>
      <span className="text-xs text-muted-foreground">
        {busy ? "Memuat…" : note}
      </span>
    </div>
  );
}

/** Bagian data di bawah hero halaman awal PDKT (progres, antrean, telaah). */
export function PdktLandingOverview({
  summary,
  historyState,
  mailboxState,
  onRetryHistory,
  onRetryMailbox,
  onOpenMailbox,
  onOpenSession,
  onOpenHistory,
}: PdktLandingOverviewProps) {
  const historyBusy = historyState === "loading";
  const mailboxBusy = mailboxState === "loading";
  const { waiting, average, reviewing, unreplied, focus, recent } = summary;
  const latestReviewed = recent[0]?.session;
  const reviewedCount = average?.sessions ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-12 pb-16">
      <section
        aria-labelledby="pdkt-progress-title"
        className="flex flex-col gap-4"
      >
        <SectionHeader
          id="pdkt-progress-title"
          title="Progres latihan"
          description="Ringkasan dari kotak masuk dan riwayat sesi yang bisa Anda lihat."
        />
        <div className="flex flex-wrap gap-4">
          <Stat
            testId="pdkt-stat-waiting"
            label="Menunggu balasan"
            busy={mailboxBusy}
            value={mailboxState === "error" ? "–" : String(waiting.count)}
            note={
              mailboxState === "error"
                ? "Kotak masuk gagal dimuat"
                : waiting.oldestAt
                  ? `Paling lama masuk ${formatPdktRelativeDay(waiting.oldestAt).toLowerCase()}`
                  : "Semua email sudah dibalas"
            }
          />
          <Stat
            testId="pdkt-stat-average"
            label="Skor rata-rata"
            busy={historyBusy}
            value={average ? String(average.score) : "–"}
            note={
              historyState === "error"
                ? "Riwayat gagal dimuat"
                : average
                  ? `Dari ${average.sessions} sesi terakhir yang sudah ditelaah`
                  : "Belum ada sesi yang ditelaah"
            }
          />
          <Stat
            testId="pdkt-stat-reviewing"
            label="Sedang ditelaah AI"
            busy={historyBusy}
            value={historyState === "error" ? "–" : String(reviewing)}
            note="Hasilnya muncul otomatis di riwayat"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="pdkt-unreplied-title"
          className="flex min-w-0 flex-[999_1_520px] flex-col gap-4"
        >
          <SectionHeader
            id="pdkt-unreplied-title"
            title="Belum dibalas"
            action={
              <Button
                type="button"
                variant="link"
                className="h-auto min-h-11 px-0 text-[13px]"
                onClick={() => onOpenMailbox()}
              >
                Buka kotak masuk
              </Button>
            }
          />
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
            {mailboxState === "error" ? (
              <LoadProblem
                message="Kotak masuk gagal dimuat."
                onRetry={onRetryMailbox}
              />
            ) : mailboxBusy ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                Memuat kotak masuk…
              </p>
            ) : unreplied.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                Tidak ada email yang menunggu balasan.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {unreplied.map((email) => (
                  <li key={email.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMailbox(email.id)}
                      className="flex min-h-11 w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-module-pdkt"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-semibold text-foreground">
                          {email.subject}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {email.meta}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                        {formatPdktRelativeDay(email.createdAt)}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section
          aria-labelledby="pdkt-focus-title"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-4"
        >
          <SectionHeader id="pdkt-focus-title" title="Fokus berikutnya" />
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-elevated p-6">
            {historyState === "error" ? (
              <LoadProblem
                message="Riwayat gagal dimuat."
                onRetry={onRetryHistory}
              />
            ) : historyBusy ? (
              <p className="text-[13px] text-muted-foreground">
                Memuat riwayat…
              </p>
            ) : focus && latestReviewed ? (
              <>
                <p className="text-foreground/80">
                  {reviewedCount > 1
                    ? `Dari ${reviewedCount} sesi terakhir`
                    : "Di sesi terakhir"}
                  , nilai paling rendah ada di aspek{" "}
                  <strong className="text-foreground">{focus.label}</strong>.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {focus.label}
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {focus.score}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-sunken">
                    <div
                      className="h-2 rounded-full bg-[var(--chart-orange)]"
                      style={{
                        width: `${Math.max(0, Math.min(100, focus.score))}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs leading-[18px] text-muted-foreground">
                  Pelajari catatan AI di sesi terakhir sebelum mencoba kasus
                  berikutnya.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => onOpenSession(latestReviewed)}
                >
                  Lihat catatan AI
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Fokus latihan muncul setelah ada balasan yang ditelaah AI.
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="pdkt-recent-title"
        className="flex flex-col gap-4"
      >
        <SectionHeader
          id="pdkt-recent-title"
          title="Hasil telaah terbaru"
          action={
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-11 px-0 text-[13px]"
              onClick={onOpenHistory}
            >
              Lihat semua riwayat
            </Button>
          }
        />
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-elevated">
          {historyState === "error" ? (
            <LoadProblem
              message="Riwayat gagal dimuat."
              onRetry={onRetryHistory}
            />
          ) : historyBusy ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              Memuat riwayat…
            </p>
          ) : recent.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              Belum ada hasil telaah. Kirim balasan di kotak masuk untuk
              mendapat telaah AI.
            </p>
          ) : (
            <table className="w-full min-w-[600px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Email
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Peserta
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Tanggal
                  </th>
                  <th className="border-b border-border px-5 py-3 text-right font-medium">
                    Skor
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:last-child)>td]:border-b [&>tr>td]:border-border">
                {recent.map((row) => (
                  <tr key={row.session.id} className="hover:bg-muted/60">
                    <td className="px-5 py-1">
                      <button
                        type="button"
                        onClick={() => onOpenSession(row.session)}
                        className="min-h-11 max-w-[42ch] truncate text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {row.subject}
                      </button>
                    </td>
                    <td className="px-5 py-1 text-foreground/80">
                      {row.subjectLabel}
                    </td>
                    <td className="px-5 py-1 whitespace-nowrap text-muted-foreground">
                      {formatPdktDate(row.timestamp)}
                    </td>
                    <td className="px-5 py-1 text-right font-mono font-bold tabular-nums text-foreground">
                      {row.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
