import {
  ChevronDown,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useState, useId, type ReactNode } from "react";
import type {
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
  SidakAgentRankQuickview,
  TiedPeerInfo,
} from "@trainers/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Arah peringkat detail agen sengaja kebalikan halaman Ranking. */
const RANKING_BASIS_NOTE =
  "Peringkat 1 = temuan paling sedikit. Jumlah temuan sama berbagi peringkat.";

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
    className: "text-emerald-700 dark:text-emerald-400",
  },
  declining: {
    Icon: TrendingUp,
    className: "text-rose-700 dark:text-rose-400",
  },
  stable: {
    Icon: Minus,
    className: "text-foreground",
  },
  insufficient_data: {
    Icon: ShieldAlert,
    className: "text-amber-700 dark:text-amber-400",
  },
};

interface AgentPerformanceQuickviewProps {
  data: SidakAgentQuickviewResponse | null;
  loading: boolean;
  error: string | null;
  scopeLabel?: string;
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

function buildTieText(
  rank: number,
  peers: TiedPeerInfo[],
): { summary: string; disclosure: boolean } {
  if (peers.length === 1) {
    return {
      summary: `Berbagi peringkat ${rank} dengan ${peers[0].nama}`,
      disclosure: false,
    };
  }
  if (peers.length === 2) {
    return {
      summary: `Berbagi peringkat ${rank} dengan ${peers[0].nama} dan ${peers[1].nama}`,
      disclosure: false,
    };
  }
  // 3+ peers — collapsed
  return {
    summary: `Berbagi peringkat ${rank} dengan ${peers[0].nama} dan ${peers.length - 1} agen lain`,
    disclosure: true,
  };
}

function TieDisclosure({
  peers,
  rank,
}: {
  peers: TiedPeerInfo[];
  rank: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="mt-0.5">
      <span className="text-xs text-muted-foreground">
        Berbagi peringkat {rank} dengan {peers[0].nama} dan {peers.length - 1}{" "}
        agen lain
      </span>
      <Button
        type="button"
        variant="link"
        size="lg"
        aria-expanded={open}
        aria-controls={id}
        aria-label={
          open
            ? `Sembunyikan daftar agen yang berbagi peringkat ${rank}`
            : `Lihat semua agen yang berbagi peringkat ${rank}`
        }
        onClick={() => setOpen(!open)}
        className="ml-1 min-h-11 gap-0.5 px-1 text-xs font-medium text-primary"
      >
        {open ? "Sembunyikan" : "Lihat"}
        <ChevronDown
          aria-hidden="true"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <ul
          id={id}
          className="mt-1 flex flex-col gap-0.5 rounded bg-muted/50 px-2 py-1"
        >
          {peers.map((peer) => (
            <li key={peer.agentId} className="text-xs text-muted-foreground">
              • {peer.nama}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  // ── Tie info ──
  const tiedAgents = metric?.tiedAgents ?? null;
  const hasTieData = tiedAgents !== null && tiedAgents !== undefined;
  const tieCount = hasTieData ? tiedAgents.length : 0;
  const hasTie = tieCount > 0;
  const tieText =
    hasTie && metric?.rank != null
      ? buildTieText(metric.rank, tiedAgents!)
      : null;

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
      {hasTie && tieCount <= 2 && tieText ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tieText.summary}
        </p>
      ) : hasTie && tieCount >= 3 && metric?.rank != null ? (
        <TieDisclosure peers={tiedAgents!} rank={metric.rank} />
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
}: AgentPerformanceQuickviewProps) {
  if (loading && !data) {
    return <QuickviewSkeleton />;
  }

  if (error && !data) {
    return (
      <Alert
        role="status"
        className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5"
      >
        <ShieldAlert
          className="text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <AlertTitle className="text-sm font-medium text-foreground">
          Peringkat dan forecast belum dapat dimuat
        </AlertTitle>
        <AlertDescription className="mt-1 text-xs">
          Tekan Muat ulang di atas untuk mencoba lagi.
        </AlertDescription>
      </Alert>
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
    <section
      aria-label={scopeLabel ? `Performa ${scopeLabel}` : "Performa agen"}
      className="flex min-w-0 flex-col"
    >
      <div aria-label="Peringkat dan forecast" className="flex flex-col">
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
        {RANKING_BASIS_NOTE}
        {scopeLabel ? ` Cakupan ${scopeLabel}.` : null}
      </p>
    </section>
  );
}
