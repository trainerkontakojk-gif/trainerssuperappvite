import { ArrowRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { KetikSessionHistoryItem } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { cn } from "cn";
import type { KetikLandingSummary } from "../utils/landingSummary";
import { formatKetikDate } from "../utils/reviewDisplay";

export type KetikLoadState = "loading" | "ready" | "error";

interface KetikLandingOverviewProps {
  summary: KetikLandingSummary;
  historyState: KetikLoadState;
  onRetryHistory: () => void;
  onOpenSession: (session: KetikSessionHistoryItem) => void;
  onOpenHistory: () => void;
}

const headingClass =
  "font-display text-xl leading-7 font-bold tracking-tight text-foreground";

function SectionHeader({
  id,
  title,
  action,
}: {
  id: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id={id} className={headingClass}>
        {title}
      </h2>
      {action}
    </div>
  );
}

function LoadProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-foreground"
    >
      Riwayat belum bisa dimuat.
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

function Loading() {
  return (
    <p className="px-5 py-4 text-[13px] text-muted-foreground">
      Memuat riwayat…
    </p>
  );
}

/** Satu bagian ringkasan progres: angka tebal lalu keterangannya. */
function SummaryItem({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong className="font-mono font-bold tabular-nums text-foreground">
        {value}
      </strong>{" "}
      {label}
    </span>
  );
}

/** Bagian data di bawah hero halaman awal KETIK. */
export function KetikLandingOverview({
  summary,
  historyState,
  onRetryHistory,
  onOpenSession,
  onOpenHistory,
}: KetikLandingOverviewProps) {
  const busy = historyState === "loading";
  const failed = historyState === "error";
  const { sessionsThisMonth, average, reviewing, followUps, focus, recent } =
    summary;
  const latestReviewed = recent[0]?.session;
  const isNewUser =
    historyState === "ready" &&
    sessionsThisMonth === 0 &&
    followUps.length === 0 &&
    recent.length === 0 &&
    reviewing === 0;

  if (isNewUser) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-16">
        <section
          aria-labelledby="ketik-start-title"
          className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-elevated px-7 py-6"
        >
          <h2 id="ketik-start-title" className={headingClass}>
            Belum ada latihan
          </h2>
          <p className="max-w-[64ch] text-fg2">
            Setelah chat pertama Anda ditelaah, halaman ini menampilkan sesi
            yang perlu ditindaklanjuti, skor rata-rata, aspek yang perlu
            dilatih, dan hasil telaah terbaru.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-12 pb-16">
      <section
        aria-labelledby="ketik-progress-title"
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-6"
      >
        <h2 id="ketik-progress-title" className={headingClass}>
          Progres latihan
        </h2>
        {busy ? (
          <p className="text-sm text-fg2">Memuat riwayat…</p>
        ) : failed ? (
          <p className="text-sm text-fg2">Riwayat belum bisa dimuat</p>
        ) : (
          <p
            data-testid="ketik-progress-summary"
            className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg2"
          >
            <SummaryItem value={sessionsThisMonth} label="sesi bulan ini" />
            {average ? (
              <SummaryItem
                value={average.score}
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
              <SummaryItem value={reviewing} label="sedang ditelaah AI" />
            )}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
        <section
          aria-labelledby="ketik-followup-title"
          className="flex min-w-0 flex-[999_1_520px] flex-col gap-4"
        >
          <SectionHeader
            id="ketik-followup-title"
            title="Perlu tindak lanjut"
            action={
              followUps.length > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  {followUps.length} sesi
                </span>
              )
            }
          />
          <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
            {failed ? (
              <LoadProblem onRetry={onRetryHistory} />
            ) : busy ? (
              <Loading />
            ) : followUps.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted-foreground">
                Semua sesi sudah ditelaah.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {followUps.map(({ session, meta, status }) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(session)}
                      className="flex min-h-[44px] w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          status === "Telaah gagal"
                            ? "bg-chart-orange"
                            : "bg-module-ketik",
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 font-semibold text-foreground">
                          {session.scenarioTitle}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {meta} · {status}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                        {formatKetikDate(session.date)}
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
          aria-labelledby="ketik-focus-title"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-4"
        >
          <SectionHeader id="ketik-focus-title" title="Fokus berikutnya" />
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-elevated p-6">
            {failed ? (
              <LoadProblem onRetry={onRetryHistory} />
            ) : busy ? (
              <p className="text-[13px] text-muted-foreground">
                Memuat riwayat…
              </p>
            ) : focus && latestReviewed ? (
              <>
                <p className="text-fg2">
                  {average && average.sessions > 1
                    ? `Dari ${average.sessions} sesi terakhir`
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
                Fokus latihan muncul setelah ada chat yang ditelaah AI.
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="ketik-recent-title"
        className="flex flex-col gap-4"
      >
        <SectionHeader
          id="ketik-recent-title"
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
          {failed ? (
            <LoadProblem onRetry={onRetryHistory} />
          ) : busy ? (
            <Loading />
          ) : recent.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              Belum ada hasil telaah. Akhiri chat lalu jalankan telaah AI untuk
              melihat skornya di sini.
            </p>
          ) : (
            <table className="w-full border-collapse text-[13px] sm:min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Skenario
                  </th>
                  <th className="hidden border-b border-border px-5 py-3 font-medium sm:table-cell">
                    Peserta
                  </th>
                  <th className="hidden border-b border-border px-5 py-3 font-medium sm:table-cell">
                    Tanggal
                  </th>
                  <th className="hidden border-b border-border px-5 py-3 font-medium md:table-cell">
                    Aspek terendah
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
                        <span className="line-clamp-2">
                          {row.session.scenarioTitle}
                        </span>
                      </button>
                      {/* Di HP kolom Peserta & Tanggal disembunyikan; isinya pindah ke sini. */}
                      <span className="block pb-2 text-xs text-muted-foreground sm:hidden">
                        {row.subjectLabel} · {formatKetikDate(row.session.date)}
                      </span>
                    </td>
                    <td className="hidden px-5 py-1 text-fg2 sm:table-cell">
                      {row.subjectLabel}
                    </td>
                    <td className="hidden px-5 py-1 whitespace-nowrap text-muted-foreground sm:table-cell">
                      {formatKetikDate(row.session.date)}
                    </td>
                    <td className="hidden px-5 py-1 text-fg2 md:table-cell">
                      {row.lowestAspect ?? "-"}
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
