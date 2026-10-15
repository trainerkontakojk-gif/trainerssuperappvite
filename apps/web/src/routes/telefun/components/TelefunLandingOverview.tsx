import { ArrowRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import type { TelefunHistoryLoadState } from "../hooks/useTelefunHistory";
import type { CallRecord } from "../types";
import type { TelefunLandingSummary } from "../utils/landingSummary";
import {
  formatCallDuration,
  formatTelefunDate,
  formatTelefunScore,
} from "../utils/reviewDisplay";

interface TelefunLandingOverviewProps {
  summary: TelefunLandingSummary;
  historyState: TelefunHistoryLoadState;
  onRetryHistory: () => void;
  onOpenSession: (record: CallRecord) => void;
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

/** Bagian data di bawah hero halaman awal Telefun. */
export function TelefunLandingOverview({
  summary,
  historyState,
  onRetryHistory,
  onOpenSession,
  onOpenHistory,
}: TelefunLandingOverviewProps) {
  const busy = historyState === "loading";
  const failed = historyState === "error";
  const { callsThisMonth, average, analyzing, followUps, focus, recent } =
    summary;
  const latestReviewed = recent[0]?.record;
  const isNewUser =
    historyState === "ready" &&
    callsThisMonth === 0 &&
    followUps.length === 0 &&
    recent.length === 0 &&
    analyzing === 0;

  if (isNewUser) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-16">
        <section
          aria-labelledby="telefun-start-title"
          className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-elevated px-7 py-6"
        >
          <h2 id="telefun-start-title" className={headingClass}>
            Belum ada latihan
          </h2>
          <p className="max-w-[64ch] text-fg2">
            Setelah panggilan pertama Anda dinilai, halaman ini menampilkan
            panggilan yang perlu ditindaklanjuti, skor rata-rata, aspek suara
            yang perlu dilatih, dan hasil telaah terbaru.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-12 pb-16">
      <section
        aria-labelledby="telefun-progress-title"
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-6"
      >
        <h2 id="telefun-progress-title" className={headingClass}>
          Progres latihan
        </h2>
        {busy ? (
          <p className="text-sm text-fg2">Memuat riwayat…</p>
        ) : failed ? (
          <p className="text-sm text-fg2">Riwayat belum bisa dimuat</p>
        ) : (
          <p
            data-testid="telefun-progress-summary"
            className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg2"
          >
            <SummaryItem
              value={String(callsThisMonth)}
              label="panggilan bulan ini"
            />
            {average ? (
              <SummaryItem
                value={formatTelefunScore(average.score)}
                label={
                  average.calls === 1
                    ? "rata-rata skor dari panggilan terakhir"
                    : `rata-rata skor dari ${average.calls} panggilan terakhir`
                }
              />
            ) : (
              <span>Belum ada skor</span>
            )}
            {analyzing > 0 && (
              <SummaryItem
                value={String(analyzing)}
                label="sedang dianalisis"
              />
            )}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
        <section
          aria-labelledby="telefun-followup-title"
          className="flex min-w-0 flex-[999_1_520px] flex-col gap-4"
        >
          <SectionHeader
            id="telefun-followup-title"
            title="Perlu tindak lanjut"
            action={
              followUps.length > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  {followUps.length} panggilan
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
                Tidak ada analisis yang gagal atau rekaman yang hilang.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {followUps.map(({ record, meta, status, tone }) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(record)}
                      className="flex min-h-[44px] w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          tone === "failed"
                            ? "bg-chart-orange"
                            : "bg-destructive",
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 font-semibold text-foreground">
                          {record.scenarioTitle}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {meta} · {status}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                        {formatTelefunDate(record.date)}
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
          aria-labelledby="telefun-focus-title"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-4"
        >
          <SectionHeader id="telefun-focus-title" title="Fokus berikutnya" />
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
                  {average && average.calls > 1
                    ? `Dari ${average.calls} telaah terakhir`
                    : "Di telaah terakhir"}
                  , nilai terendah ada di{" "}
                  <strong className="text-foreground">{focus.label}</strong>.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {focus.label}
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {formatTelefunScore(focus.score)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-sunken">
                    <div
                      className="h-2 rounded-full bg-chart-orange"
                      style={{
                        width: `${Math.max(0, Math.min(100, focus.score * 10))}%`,
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
                Fokus latihan muncul setelah ada panggilan yang dinilai AI.
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="telefun-recent-title"
        className="flex flex-col gap-4"
      >
        <SectionHeader
          id="telefun-recent-title"
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
              Belum ada hasil telaah. Selesaikan panggilan, lalu skor suaranya
              muncul di sini setelah dianalisis AI.
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
                  <th className="hidden border-b border-border px-5 py-3 font-medium lg:table-cell">
                    Durasi
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
                  <tr key={row.record.id} className="hover:bg-muted/60">
                    <td className="px-5 py-1">
                      <button
                        type="button"
                        onClick={() => onOpenSession(row.record)}
                        className="min-h-[44px] max-w-[42ch] py-2 text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="line-clamp-2">
                          {row.record.scenarioTitle}
                        </span>
                      </button>
                      {/* Di HP kolom Peserta & Tanggal disembunyikan; isinya pindah ke sini. */}
                      <span className="block pb-2 text-xs text-muted-foreground sm:hidden">
                        {row.participant} · {formatTelefunDate(row.record.date)}
                      </span>
                    </td>
                    <td className="hidden px-5 py-1 text-fg2 sm:table-cell">
                      {row.participant}
                    </td>
                    <td className="hidden px-5 py-1 whitespace-nowrap text-muted-foreground sm:table-cell">
                      {formatTelefunDate(row.record.date)}
                    </td>
                    <td className="hidden px-5 py-1 whitespace-nowrap text-muted-foreground lg:table-cell">
                      {formatCallDuration(row.record.duration)}
                    </td>
                    <td className="hidden px-5 py-1 text-fg2 md:table-cell">
                      {row.lowestAspect ?? "-"}
                    </td>
                    <td className="px-5 py-1 text-right font-mono font-bold tabular-nums text-foreground">
                      {formatTelefunScore(row.score)}
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
