import { ArrowRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import type { SessionHistory } from "../utils/sessionHistory";
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
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="min-h-[44px]"
      >
        Coba lagi
      </Button>
    </div>
  );
}

/** Satu bagian ringkasan progres: angka tebal lalu keterangannya. */
function SummaryItem({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <strong className="font-mono font-bold tabular-nums text-foreground">
        {value}
      </strong>{" "}
      {label}
    </span>
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
  // Pengguna baru: belum ada email yang menunggu dan belum ada sesi sama sekali.
  const isNewUser =
    historyState === "ready" &&
    mailboxState === "ready" &&
    waiting.count === 0 &&
    unreplied.length === 0 &&
    reviewing === 0 &&
    recent.length === 0 &&
    !average;

  if (isNewUser) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-16">
        <section
          aria-labelledby="pdkt-start-title"
          className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-xl border border-border bg-surface-elevated px-7 py-6"
        >
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
            <h2 id="pdkt-start-title" className={headingClass}>
              Belum ada latihan
            </h2>
            <p className="max-w-[64ch] text-fg2">
              Setelah balasan pertama Anda ditelaah, halaman ini menampilkan
              email yang belum dibalas, skor rata-rata, aspek yang perlu
              dilatih, dan hasil telaah terbaru.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] px-4 text-[13px]"
            onClick={() => onOpenMailbox()}
          >
            Buka kotak masuk
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-12 pb-16">
      <section
        aria-labelledby="pdkt-progress-title"
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-6"
      >
        <h2 id="pdkt-progress-title" className={headingClass}>
          Progres latihan
        </h2>
        <p
          data-testid="pdkt-progress-summary"
          aria-busy={historyBusy || mailboxBusy}
          className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg2"
        >
          {mailboxBusy ? (
            <span>Memuat kotak masuk…</span>
          ) : mailboxState === "error" ? (
            <span>Kotak masuk belum bisa dimuat</span>
          ) : (
            <SummaryItem
              value={String(waiting.count)}
              label="email belum dibalas"
            />
          )}
          {historyBusy ? (
            <span>Memuat riwayat…</span>
          ) : historyState === "error" ? (
            <span>Riwayat belum bisa dimuat</span>
          ) : (
            <>
              {average ? (
                <SummaryItem
                  value={String(average.score)}
                  label={
                    average.sessions === 1
                      ? "rata-rata skor dari sesi terakhir"
                      : `rata-rata skor dari ${average.sessions} sesi terakhir`
                  }
                />
              ) : (
                <span>Belum ada skor</span>
              )}
              {reviewing > 0 && (
                <SummaryItem
                  value={String(reviewing)}
                  label="sedang ditelaah AI"
                />
              )}
            </>
          )}
        </p>
      </section>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
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
                className="h-auto min-h-[44px] px-0 text-[13px]"
                onClick={() => onOpenMailbox()}
              >
                Buka kotak masuk
              </Button>
            }
          />
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
            {mailboxState === "error" ? (
              <LoadProblem
                message="Kotak masuk belum bisa dimuat."
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
                      className="flex min-h-[44px] w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-module-pdkt"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 font-semibold text-foreground">
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
                message="Riwayat belum bisa dimuat."
                onRetry={onRetryHistory}
              />
            ) : historyBusy ? (
              <p className="text-[13px] text-muted-foreground">
                Memuat riwayat…
              </p>
            ) : focus && latestReviewed ? (
              <>
                <p className="text-fg2">
                  {reviewedCount > 1
                    ? `Dari ${reviewedCount} sesi terakhir`
                    : "Di sesi terakhir"}
                  , skor terendah ada di aspek{" "}
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
                      className="h-2 rounded-full bg-chart-orange"
                      style={{
                        width: `${Math.max(0, Math.min(100, focus.score))}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs leading-[18px] text-muted-foreground">
                  Buka telaah terakhir untuk melihat catatan aspek ini.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => onOpenSession(latestReviewed)}
                >
                  Buka telaah terakhir
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
              className="h-auto min-h-[44px] px-0 text-[13px]"
              onClick={onOpenHistory}
            >
              Lihat semua riwayat
            </Button>
          }
        />
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-elevated">
          {historyState === "error" ? (
            <LoadProblem
              message="Riwayat belum bisa dimuat."
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
            <table className="w-full border-collapse text-[13px] sm:min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Email
                  </th>
                  <th className="hidden border-b border-border px-5 py-3 font-medium sm:table-cell">
                    Peserta
                  </th>
                  <th className="hidden border-b border-border px-5 py-3 font-medium sm:table-cell">
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
                        className="min-h-[44px] max-w-[42ch] py-2 text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="line-clamp-2">{row.subject}</span>
                      </button>
                      {/* Di HP kolom Peserta & Tanggal disembunyikan; isinya pindah ke sini. */}
                      <span className="block pb-2 text-xs text-muted-foreground sm:hidden">
                        {row.subjectLabel} · {formatPdktDate(row.timestamp)}
                      </span>
                    </td>
                    <td className="hidden px-5 py-1 text-fg2 sm:table-cell">
                      {row.subjectLabel}
                    </td>
                    <td className="hidden px-5 py-1 whitespace-nowrap text-muted-foreground sm:table-cell">
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
