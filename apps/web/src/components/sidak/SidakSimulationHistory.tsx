import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, History, RefreshCw } from "lucide-react";
import type { SidakSimulationSummary } from "../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { ReviewStatusBadge } from "../../routes/monitoring/components/ReviewStatusBadge";
import {
  formatDuration,
  getModuleBadgeClasses,
  getModuleIcon,
  getScoreColor,
  type UnifiedHistoryEntry,
} from "../../routes/monitoring/utils/formatting";

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
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => onOpen(item)}
        className="group grid h-auto min-h-20 w-full grid-cols-1 gap-3 whitespace-normal rounded-xl bg-background p-4 text-left hover:border-foreground/20 hover:bg-muted/30 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto] sm:items-center"
        aria-label={`Buka detail ${MODULE_LABELS[item.module]} ${item.scenarioTitle}`}
      >
        <span className="flex min-w-0 items-start gap-3">
          <Badge
            variant="outline"
            aria-hidden="true"
            className={`mt-0.5 size-8 shrink-0 rounded-lg p-0 ${getModuleBadgeClasses(item.module)}`}
          >
            {getModuleIcon(item.module)}
          </Badge>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`h-auto rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${getModuleBadgeClasses(item.module)}`}
              >
                {MODULE_LABELS[item.module]}
              </Badge>
              <span className="break-words text-sm font-bold text-foreground">
                {item.scenarioTitle}
              </span>
            </span>
            <span className="mt-1 block break-words text-xs text-muted-foreground">
              {formatWibDate(item.occurredAt)}
              {actorLabel ? ` · Pelaksana ${actorLabel}` : ""}
            </span>
          </span>
        </span>
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
          className="hidden size-4 justify-self-end text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden="true"
        />
      </Button>
    </li>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Memuat riwayat simulasi" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton
          key={index}
          className="h-[92px] rounded-xl motion-reduce:animate-none"
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
      <Card
        className="gap-0 border-border bg-surface py-0 ring-0"
        aria-labelledby="sidak-simulation-history-title"
      >
        <CardHeader className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <Badge
              variant="outline"
              className="size-10 shrink-0 rounded-lg bg-muted p-0 text-muted-foreground"
            >
              <History className="size-5" aria-hidden="true" />
            </Badge>
            <div className="min-w-0">
              <CardTitle
                id="sidak-simulation-history-title"
                className="font-outfit text-lg font-bold tracking-tight text-foreground"
              >
                Riwayat Simulasi
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Sesi yang tercatat untuk peserta agent ini.
              </CardDescription>
            </div>
          </div>
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1"
            role="tablist"
            aria-label="Filter modul riwayat simulasi"
          >
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant={module === filter.value ? "default" : "ghost"}
                size="lg"
                role="tab"
                aria-selected={module === filter.value}
                onClick={() => setModule(filter.value)}
                className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold"
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {loading && items.length === 0 ? <HistorySkeleton /> : null}

          {!loading && error && items.length === 0 ? (
            <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Riwayat simulasi belum dapat dimuat</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
                  Tidak ada sesi {module === "all" ? "" : MODULE_LABELS[module]} untuk peserta ini.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {items.length > 0 ? (
            <>
              <ul className="flex flex-col gap-3" aria-label="Daftar riwayat simulasi">
                {items.map((item) => (
                  <HistoryRow
                    key={`${item.module}-${item.id}`}
                    item={item}
                    onOpen={openDetail}
                  />
                ))}
              </ul>
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
        </CardContent>
      </Card>

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
