import {
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import type {
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
  SidakAgentRankQuickview,
} from "@trainers/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Arah peringkat detail agen sengaja kebalikan halaman Ranking. */
const RANKING_BASIS_NOTE =
  "Semakin tinggi peringkat, semakin sedikit temuan YTD. Bila jumlah temuan sama, yang lebih sedikit temuan kritikal lalu skor QA lebih tinggi berada di atas.";

/** Satu baris sidebar: label di kiri, nilai di kanan. */
function MetricRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-sm text-fg2">{label}</span>
      {children}
    </div>
  );
}

const FORECAST_PRESENTATION: Record<
  SidakAgentForecastQuickview["status"],
  { Icon: LucideIcon; className: string }
> = {
  improving: {
    Icon: TrendingDown,
    className: "text-success",
  },
  declining: {
    Icon: TrendingUp,
    className: "text-destructive-text",
  },
  stable: {
    Icon: Minus,
    className: "text-foreground",
  },
  insufficient_data: {
    Icon: ShieldAlert,
    className: "text-warning",
  },
};

interface AgentPerformanceQuickviewProps {
  data: SidakAgentQuickviewResponse | null;
  loading: boolean;
  error: string | null;
  scopeLabel?: string;
  onRetry: () => void;
}

interface RankMetricProps {
  /** Nama cohort untuk aria-label (dipertahankan untuk E2E dan pembaca layar). */
  label: string;
  /** Label baris yang terlihat, mis. "Peringkat tim gabungan". */
  rowLabel: string;
  metric: SidakAgentRankQuickview | null;
  className: string;
  sameAsCombined?: boolean;
}

function RankMetric({
  label,
  rowLabel,
  metric,
  className,
  sameAsCombined = false,
}: RankMetricProps) {
  const hasRank = metric?.rank !== null && metric?.rank !== undefined;
  const supportingText = !metric
    ? "Peringkat belum tersedia"
    : sameAsCombined
      ? "Cakupan sama dengan Tim Gabungan"
      : hasRank
        ? null
        : metric.total > 0
          ? "Belum masuk peringkat pada cakupan ini"
          : "Belum ada agen pembanding";

  return (
    <div
      role="group"
      aria-label={`${label}: ${hasRank ? `peringkat ${metric.rank}` : "belum tersedia"}`}
      className={`py-2.5 ${className}`}
    >
      <MetricRow label={rowLabel}>
        <span className="font-semibold tabular-nums text-foreground">
          {hasRank ? `${metric.rank} / ${metric.total}` : "—"}
        </span>
      </MetricRow>
      {supportingText ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{supportingText}</p>
      ) : null}
    </div>
  );
}

function ForecastMetric({
  forecast,
}: {
  forecast: SidakAgentForecastQuickview | null;
}) {
  if (!forecast) {
    return (
      <div role="group" aria-label="Forecast: belum tersedia" className="py-2.5">
        <MetricRow label="Forecast 3 bulan">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Minus aria-hidden="true" className="size-4 text-muted-foreground" />
            —
          </span>
        </MetricRow>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Forecast belum tersedia
        </p>
      </div>
    );
  }

  const { Icon, className } = FORECAST_PRESENTATION[forecast.status];

  return (
    <div
      role="group"
      aria-label={`Forecast: ${forecast.label}`}
      className="py-2.5"
    >
      <MetricRow label="Forecast 3 bulan">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${className}`}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span>{forecast.label}</span>
        </span>
      </MetricRow>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {forecast.supportingText}
      </p>
    </div>
  );
}

function QuickviewSkeleton() {
  return (
    <div>
      <section
        aria-label="Memuat peringkat dan forecast"
        className="flex flex-col divide-y divide-border"
      >
        {[0, 1, 2].map((index) => (
          <div key={index} aria-hidden="true" className="py-3">
            <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
            <Skeleton className="mt-3 h-6 w-20 motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-3 w-36 motion-reduce:animate-none" />
          </div>
        ))}
      </section>
    </div>
  );
}

export default function AgentPerformanceQuickview({
  data,
  loading,
  error,
  scopeLabel,
  onRetry,
}: AgentPerformanceQuickviewProps) {
  const sectionRef = useRef<HTMLElement>(null);
  if (!data && !loading && !error) return null;

  let content: ReactNode;
  if (data) {
    const sameScope =
      data.combinedTeam?.scopeId !== null &&
      data.combinedTeam?.scopeId !== undefined &&
      data.combinedTeam.scopeId === data.leaderTeam?.scopeId;
    content = (
      <>
        <div className="flex flex-col">
          <RankMetric
            label="Tim Gabungan"
            rowLabel="Peringkat tim gabungan"
            metric={data.combinedTeam}
            className=""
          />
          <RankMetric
            label="Tim Leader"
            rowLabel={`Peringkat ${data.leaderTeam?.scopeLabel ?? "tim leader"}`}
            metric={data.leaderTeam}
            sameAsCombined={sameScope}
            className=""
          />
          <ForecastMetric forecast={data.forecast} />
        </div>
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          {RANKING_BASIS_NOTE} Bila semua angka kinerja sama, nama A–Z lalu ID agen
          menentukan urutan; nama bukan ukuran kinerja.
          {scopeLabel ? ` Cakupan ${scopeLabel}.` : null}
        </p>
      </>
    );
  } else if (loading) {
    content = <QuickviewSkeleton />;
  } else {
    content = (
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-2 rounded-xl border border-border bg-card p-3">
        <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden="true" />
        <p role="status" className="text-sm font-medium text-foreground">
          Peringkat dan forecast belum dapat dimuat
        </p>
        <Button
          type="button"
          variant="outline"
          className="col-start-2 min-h-11 justify-self-start"
          onClick={() => {
            sectionRef.current?.focus({ preventScroll: true });
            onRetry();
          }}
        >
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={scopeLabel ? `Performa ${scopeLabel}` : "Performa agen"}
      className="flex min-w-0 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {content}
    </section>
  );
}
