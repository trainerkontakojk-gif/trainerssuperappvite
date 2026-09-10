import {
  AlertTriangle,
  ChevronRight,
  History,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SidakSimulationSummary } from "../../lib/api";
import {
  type SidakSimulationModuleFilter,
  useSidakAgentSimulations,
} from "../../hooks/useSidakAgentSimulations";
import { ReviewDetailModal } from "../../routes/monitoring/components/ReviewDetailModal";
import {
  formatDuration,
  getModuleBadgeClasses,
  getModuleIcon,
  getScoreColor,
  type UnifiedHistoryEntry,
} from "../../routes/monitoring/utils/formatting";
import { ReviewStatusBadge } from "../../routes/monitoring/components/ReviewStatusBadge";

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

function formatWibDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} WIB`;
}

function formatSimulationDuration(seconds: number | null): string {
  return seconds === null ? "Durasi —" : formatDuration(seconds);
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
  const actorLabel = [item.actor.email, item.actor.role]
    .filter(Boolean)
    .join(" · ");
  const scoreLabel =
    item.score === null ? "Nilai —" : `${item.score} / ${item.scoreScale}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="group grid w-full grid-cols-1 gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto] sm:items-center"
        aria-label={`Buka detail ${MODULE_LABELS[item.module]} ${item.scenarioTitle}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getModuleBadgeClasses(item.module)}`}
          >
            {getModuleIcon(item.module)}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${getModuleBadgeClasses(item.module)}`}
              >
                {MODULE_LABELS[item.module]}
              </span>
              <span className="truncate text-sm font-bold text-foreground">
                {item.scenarioTitle}
              </span>
            </span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {formatWibDate(item.occurredAt)}
              {actorLabel ? ` · Pelaksana ${actorLabel}` : ""}
            </span>
          </span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {formatSimulationDuration(item.durationSeconds)}
        </span>
        <span
          className={`text-sm font-black ${getScoreColor(item.score, item.scoreScale)}`}
        >
          {scoreLabel}
        </span>
        <ReviewStatusBadge status={item.reviewStatus} />
        <ChevronRight
          className="hidden h-4 w-4 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-label="Memuat riwayat simulasi" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/50 motion-reduce:animate-none"
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
        className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="sidak-simulation-history-title"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="sidak-simulation-history-title"
                className="font-outfit text-lg font-bold tracking-tight text-foreground"
              >
                Riwayat Simulasi
              </h2>
              <p className="text-xs text-muted-foreground">
                Sesi yang tercatat untuk peserta agent ini.
              </p>
            </div>
          </div>
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1"
            role="tablist"
            aria-label="Filter modul riwayat simulasi"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={module === filter.value}
                onClick={() => setModule(filter.value)}
                className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                  module === filter.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading && items.length === 0 && <HistorySkeleton />}

        {!loading && error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-foreground">
                Riwayat simulasi belum dapat dimuat
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm font-bold text-foreground">
              Belum ada riwayat simulasi
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tidak ada sesi {module === "all" ? "" : MODULE_LABELS[module]} untuk peserta ini.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <>
            <ul className="space-y-3" aria-label="Daftar riwayat simulasi">
              {items.map((item) => (
                <HistoryRow key={`${item.module}-${item.id}`} item={item} onOpen={openDetail} />
              ))}
            </ul>
            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs">
                <span className="text-destructive">{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="font-bold text-destructive underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                >
                  Coba lagi
                </button>
              </div>
            )}
            {nextCursor && !error && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {loadingMore && <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {loadingMore ? "Memuat…" : "Muat lebih banyak"}
              </button>
            )}
          </>
        )}
      </section>

      {selected && selectedEntry && (
        <ReviewDetailModal
          entry={selectedEntry}
          onClose={closeDetail}
          durationSeconds={selected.durationSeconds}
          reviewData={detail}
          reviewLoading={detailLoading}
          reviewError={detailError}
          onRetry={retryDetail}
        />
      )}
    </>
  );
}
