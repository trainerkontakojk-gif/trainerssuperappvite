import {
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type {
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
  SidakAgentRankQuickview,
} from "@trainers/types";

const RANKING_BASIS_NOTE =
  "Semakin tinggi peringkat, semakin sedikit temuan YTD. Peringkat terakhir menunjukkan jumlah temuan terbanyak. Jumlah yang sama mendapat peringkat yang sama.";

const FORECAST_PRESENTATION: Record<
  SidakAgentForecastQuickview["status"],
  { Icon: LucideIcon; className: string }
> = {
  improving: {
    Icon: TrendingDown,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  declining: {
    Icon: TrendingUp,
    className: "text-rose-600 dark:text-rose-400",
  },
  stable: {
    Icon: Minus,
    className: "text-foreground",
  },
  insufficient_data: {
    Icon: ShieldAlert,
    className: "text-amber-600 dark:text-amber-400",
  },
};

interface AgentPerformanceQuickviewProps {
  data: SidakAgentQuickviewResponse | null;
  loading: boolean;
  error: string | null;
}

interface RankMetricProps {
  label: string;
  metric: SidakAgentRankQuickview | null;
  className: string;
  sameAsCombined?: boolean;
}

function RankMetric({
  label,
  metric,
  className,
  sameAsCombined = false,
}: RankMetricProps) {
  const hasRank = metric?.rank !== null && metric?.rank !== undefined;
  const supportingText = !metric
    ? "Ranking belum tersedia"
    : sameAsCombined
      ? "Cohort yang sama dengan Tim Gabungan"
      : hasRank
        ? metric.scopeLabel
        : metric.total > 0
          ? "Agent belum masuk ranking pada konteks ini"
          : "Belum ada agent pembanding";

  return (
    <div
      role="group"
      aria-label={`${label}: ${hasRank ? `peringkat ${metric.rank}` : "belum tersedia"}`}
      className={`px-4 py-4 sm:px-6 sm:py-5 ${className}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Trophy aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">
          {hasRank ? `#${metric.rank}` : "—"}
        </span>
        {hasRank ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            dari {metric.total}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{supportingText}</p>
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
      <div
        role="group"
        aria-label="Forecast: belum tersedia"
        className="px-4 py-4 sm:px-6 sm:py-5"
      >
        <p className="text-sm font-medium text-foreground">Forecast 3 bulan</p>
        <div className="mt-2 flex items-center gap-2 text-foreground">
          <Minus aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <span className="text-base font-semibold">—</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
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
      className="px-4 py-4 sm:px-6 sm:py-5"
    >
      <p className="text-sm font-medium text-foreground">Forecast 3 bulan</p>
      <div className={`mt-2 flex items-center gap-2 ${className}`}>
        <Icon aria-hidden="true" className="h-5 w-5" />
        <span className="text-base font-semibold">{forecast.label}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {forecast.supportingText}
      </p>
    </div>
  );
}

function QuickviewSkeleton() {
  return (
    <div className="border-t border-border">
      <section
        aria-label="Memuat quickview performa agent"
        className="grid grid-cols-1 md:grid-cols-3"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden="true"
            className={`px-4 py-4 sm:px-6 sm:py-5 ${
              index < 2
                ? "border-b border-border md:border-b-0 md:border-r"
                : ""
            }`}
          >
            <div className="h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-3 h-6 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-2 h-3 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        ))}
      </section>
      <div
        aria-hidden="true"
        className="border-t border-border px-4 py-2 sm:px-6"
      >
        <div className="h-3 w-full max-w-md animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export default function AgentPerformanceQuickview({
  data,
  loading,
  error,
}: AgentPerformanceQuickviewProps) {
  if (loading && !data) {
    return <QuickviewSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="border-t border-border px-4 py-4 sm:px-6">
        <p role="status" className="text-sm font-medium text-foreground">
          Quickview belum dapat dimuat
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Data ranking dan forecast tidak tersedia untuk sementara.
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const sameScope =
    data.combinedTeam?.scopeId !== null &&
    data.combinedTeam?.scopeId !== undefined &&
    data.combinedTeam.scopeId === data.leaderTeam?.scopeId;

  return (
    <div className="border-t border-border">
      <section
        aria-label="Quickview performa agent"
        className="grid grid-cols-1 md:grid-cols-3"
      >
        <RankMetric
          label="Tim Gabungan"
          metric={data.combinedTeam}
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <RankMetric
          label="Tim Leader"
          metric={data.leaderTeam}
          sameAsCombined={sameScope}
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <ForecastMetric forecast={data.forecast} />
      </section>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-6">
        {RANKING_BASIS_NOTE}
      </p>
    </div>
  );
}
