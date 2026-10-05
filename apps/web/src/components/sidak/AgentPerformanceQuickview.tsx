import {
  ChevronDown,
  Info,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useState, useId } from "react";
import type {
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
  SidakAgentRankQuickview,
  TiedPeerInfo,
} from "@trainers/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

const RANKING_BASIS_NOTE =
  "Peringkat 1 berarti temuan paling sedikit sepanjang tahun berjalan; peringkat terakhir berarti temuan terbanyak. Agen dengan jumlah temuan yang sama berbagi peringkat.";

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
  label: string;
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
        ? metric.scopeLabel
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
      className={`py-3 ${className}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Trophy aria-hidden="true" className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-outfit text-xl font-bold tracking-tight tabular-nums text-foreground">
          {hasRank ? `#${metric.rank}` : "—"}
        </span>
        {hasRank ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            dari {metric.total}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{supportingText}</p>
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
      <div role="group" aria-label="Forecast: belum tersedia" className="py-3">
        <p className="text-xs font-medium text-muted-foreground">
          Forecast 3 bulan
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-foreground">
          <Minus aria-hidden="true" className="size-5 text-muted-foreground" />
          <span className="font-outfit text-xl font-bold">—</span>
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
      className="py-3"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Forecast 3 bulan
      </p>
      <div className={`mt-1.5 flex items-center gap-2 ${className}`}>
        <Icon aria-hidden="true" className="size-5" />
        <span className="font-outfit text-lg font-bold tracking-tight">
          {forecast.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
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
      {scopeLabel ? (
        <h2 className="text-xs font-medium text-muted-foreground">
          Peringkat & forecast ·{" "}
          {scopeLabel.charAt(0).toUpperCase() + scopeLabel.slice(1)}
        </h2>
      ) : null}
      <div
        aria-label="Peringkat dan forecast"
        className="grid grid-cols-2 gap-x-4"
      >
        <RankMetric
          label="Tim Gabungan"
          metric={data.combinedTeam}
          className=""
        />
        <RankMetric
          label="Tim Leader"
          metric={data.leaderTeam}
          sameAsCombined={sameScope}
          className=""
        />
        <div className="col-span-2 border-t border-border">
          <ForecastMetric forecast={data.forecast} />
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="link"
              className="h-auto gap-1 px-0 py-1 text-xs font-medium text-muted-foreground"
            />
          }
        >
          <Info className="size-3.5" aria-hidden="true" />
          Cara membaca peringkat
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            {RANKING_BASIS_NOTE}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
