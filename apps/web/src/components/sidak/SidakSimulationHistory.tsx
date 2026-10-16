import { useMemo, useState } from "react";
import { AlertTriangle, History, RefreshCw } from "lucide-react";
import type { SidakSimulationSummary } from "../../lib/api";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type SidakSimulationModuleFilter,
  useSidakAgentSimulations,
} from "../../hooks/useSidakAgentSimulations";
import { ReviewDetailModal } from "../../routes/monitoring/components/ReviewDetailModal";
import { type UnifiedHistoryEntry } from "../../routes/monitoring/utils/formatting";
import { cn } from "cn";
import { SIDAK_SCORE_FILL } from "../../utils/sidakScoreStatus";

const FILTERS: Array<{
  value: SidakSimulationModuleFilter;
  label: string;
}> = [
  { value: "all", label: "Semua" },
  { value: "ketik", label: "KETIK" },
  { value: "pdkt", label: "PDKT" },
  { value: "telefun", label: "Telefun" },
];

const MODULE_LABELS: Record<SidakSimulationSummary["module"], string> = {
  ketik: "KETIK",
  pdkt: "PDKT",
  telefun: "Telefun",
};

const MODULE_DOT: Record<SidakSimulationSummary["module"], string> = {
  ketik: "bg-[var(--chart-blue)]",
  pdkt: "bg-[var(--chart-violet)]",
  telefun: "bg-[var(--chart-amber)]",
};

const REVIEW_LABELS: Record<
  SidakSimulationSummary["reviewStatus"],
  { label: string; dot: string }
> = {
  completed: { label: "Selesai", dot: SIDAK_SCORE_FILL.ok },
  processing: { label: "Memproses", dot: SIDAK_SCORE_FILL.warn },
  pending: { label: "Memproses", dot: SIDAK_SCORE_FILL.warn },
  failed: { label: "Gagal", dot: SIDAK_SCORE_FILL.bad },
  not_started: { label: "Belum ditelaah", dot: "bg-muted-foreground" },
};

const SCORE_FORMAT = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

function formatWibDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toMonitoringEntry(item: SidakSimulationSummary): UnifiedHistoryEntry {
  return {
    id: item.id,
    user_id: item.actor.userId ?? "",
    module: item.module,
    scenario_title: item.scenarioTitle,
    created_at: item.occurredAt,
    duration_seconds: item.durationSeconds ?? 0,
    score: item.score,
    history: null,
    user_email: item.actor.email ?? undefined,
    user_role: item.actor.role ?? undefined,
    review_status: item.reviewStatus,
    simulationSubject: item.simulationSubject,
  };
}

function HistoryRow({
  item,
  onOpen,
}: {
  item: SidakSimulationSummary;
  onOpen: (item: SidakSimulationSummary) => void;
}) {
  const review = REVIEW_LABELS[item.reviewStatus] ?? REVIEW_LABELS.not_started;
  const actionLabel =
    item.reviewStatus === "completed" ? "Lihat telaah" : "Lihat sesi";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="whitespace-nowrap px-3 py-2">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", MODULE_DOT[item.module])}
          />
          {MODULE_LABELS[item.module]}
        </span>
      </td>
      <th scope="row" className="min-w-[12rem] px-3 py-2 font-medium text-foreground">
        {item.scenarioTitle}
      </th>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg2">
        {formatWibDate(item.occurredAt)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span aria-hidden="true" className={cn("size-2 rounded-full", review.dot)} />
          {review.label}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-foreground">
        {item.score === null
          ? <span className="text-muted-foreground">—</span>
          : `${SCORE_FORMAT.format(item.score)} / ${item.scoreScale}`}
      </td>
      <td className="whitespace-nowrap px-3 py-1 text-right">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpen(item)}
          aria-label={`${actionLabel} ${item.scenarioTitle}`}
          className="min-h-[44px]"
        >
          {actionLabel}
        </Button>
      </td>
    </tr>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="Memuat riwayat simulasi" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton
          key={index}
          className="h-12 rounded-lg motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export default function SidakSimulationHistory({ agentId }: { agentId: string }) {
  const [module, setModule] = useState<SidakSimulationModuleFilter>("all");
  const {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    retry,
    loadMore,
    selected,
    detail,
    detailLoading,
    detailError,
    openDetail,
    closeDetail,
    retryDetail,
  } = useSidakAgentSimulations(agentId, module);

  const selectedEntry = useMemo(
    () => (selected ? toMonitoringEntry(selected) : null),
    [selected],
  );

  return (
    <>
      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby="sidak-simulation-history-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="sidak-simulation-history-title"
              className="font-display text-lg font-bold tracking-tight text-foreground"
            >
              Riwayat simulasi
            </h2>
            <p className="text-sm text-fg2">
              Sesi KETIK, PDKT, dan Telefun milik agen ini. Tahun dan layanan
              audit tidak berlaku di sini.
            </p>
          </div>
          <div
            className="inline-flex max-w-full self-start overflow-x-auto rounded-lg border border-border p-0.5"
            role="group"
            aria-label="Filter modul riwayat simulasi"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={module === filter.value}
                onClick={() => setModule(filter.value)}
                className={cn(
                  "min-h-[44px] shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                  module === filter.value
                    ? "bg-foreground text-background"
                    : "text-fg2 hover:bg-muted hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

          {loading && items.length === 0 ? <HistorySkeleton /> : null}

          {!loading && error && items.length === 0 ? (
            <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Riwayat simulasi belum dapat dimuat</AlertTitle>
              <AlertDescription>
                Periksa koneksi, lalu coba lagi.
              </AlertDescription>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={retry}
                className="mt-2 min-h-11 w-fit"
              >
                <RefreshCw data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                Coba lagi
              </Button>
            </Alert>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <Empty className="border border-dashed border-border px-6 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
                  <History className="size-4" aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Belum ada riwayat simulasi</EmptyTitle>
                <EmptyDescription>
                  {module === "all"
                    ? "Agen ini belum punya sesi simulasi yang tercatat."
                    : `Agen ini belum punya sesi ${MODULE_LABELS[module]} yang tercatat.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {items.length > 0 ? (
            <>
              <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
                <table
                  aria-label="Riwayat simulasi"
                  className="w-full border-collapse text-left text-sm"
                >
                  <thead>
                    <tr className="border-b border-border">
                      {["Modul", "Skenario", "Tanggal", "Telaah"].map((label) => (
                        <th
                          key={label}
                          className="px-3 py-2 text-xs font-semibold text-muted-foreground"
                        >
                          {label}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                        Skor
                      </th>
                      <th className="px-3 py-2">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <HistoryRow
                        key={`${item.module}-${item.id}`}
                        item={item}
                        onOpen={openDetail}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-fg2">
                &ldquo;Lihat telaah&rdquo; membuka telaah yang sama dengan
                Monitoring dan tidak menjalankan AI. Skala skor mengikuti
                modulnya (KETIK/PDKT 0–100, Telefun 0–10).
              </p>
              {error ? (
                <Alert variant="destructive" className="bg-destructive/5">
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-destructive">
                    <span>{error}</span>
                    <Button
                      type="button"
                      variant="link"
                      size="lg"
                      onClick={retry}
                      className="min-h-11 px-1 font-bold text-destructive"
                    >
                      Coba lagi
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {nextCursor && !error ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-h-11 w-full"
                >
                  {loadingMore ? (
                    <RefreshCw
                      data-icon="inline-start"
                      className="size-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : null}
                  {loadingMore ? "Memuat…" : "Muat lebih banyak"}
                </Button>
              ) : null}
            </>
          ) : null}
      </section>

      {selected && selectedEntry ? (
        <ReviewDetailModal
          entry={selectedEntry}
          onClose={closeDetail}
          durationSeconds={selected.durationSeconds}
          reviewData={detail}
          reviewLoading={detailLoading}
          reviewError={detailError}
          onRetry={retryDetail}
        />
      ) : null}
    </>
  );
}
