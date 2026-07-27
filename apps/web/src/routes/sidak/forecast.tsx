import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeAlert,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import type {
  DashboardData,
  SidakAgentForecastEntry,
  SidakAgentForecastResponse,
  SidakForecastLookupResult,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import ParamTrendChart from "../../components/sidak/ParamTrendChart";
import ForecastInsightPanel from "../../components/sidak/ForecastInsightPanel";
import DashboardFilters from "../../components/sidak/DashboardFilters";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import {
  DEFAULT_SERVICE_FOLDER_MAP,
  SERVICE_LABELS,
} from "../../lib/scoring";
import {
  findPrimarySidakFolderByName,
  normalizeSidakFolderOptions,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";

const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const MAX_VISIBLE_PARAMETER_SERIES = 2;

function normalizeAvailableServices(services: string[] | undefined): string[] {
  const aliases: Record<string, string> = {
    chat: "chat",
    "digital chat": "chat",
    digital_chat: "chat",
  };
  const seen = new Set<string>();
  return (services ?? Object.keys(SERVICE_LABELS)).flatMap((raw) => {
    const key = raw.trim().toLowerCase();
    const service = aliases[key] ?? key;
    if (!service || seen.has(service)) return [];
    seen.add(service);
    return service;
  });
}

function toPeriodQueryParts(params: {
  year: number;
  serviceType: string;
  folderId: string;
  startMonth: number | null;
  endMonth: number | null;
}) {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  query.set("service_type", params.serviceType);
  if (params.folderId !== "ALL") {
    query.set("folder_ids", params.folderId);
  }
  if (params.startMonth != null) {
    query.set("startMonth", String(params.startMonth));
  }
  if (params.endMonth != null) {
    query.set("endMonth", String(params.endMonth));
  }
  return query.toString();
}

function formatSigned(value: number, digits = 1) {
  const normalized = Number.isFinite(value) ? value : 0;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatNumber(normalized, digits)}`;
}

function formatNumber(value: number, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function safeLabel(label?: string | null) {
  return label && label.trim().length > 0 ? label : "N/A";
}

function agentInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function forecastDirectionMeta(direction: "up" | "down" | "stable") {
  if (direction === "down") {
    return {
      label: "Membaik",
      hint: "Temuan diproyeksikan turun",
      icon: TrendingDown,
      tone: "text-emerald-600 dark:text-emerald-400",
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (direction === "up") {
    return {
      label: "Memburuk",
      hint: "Temuan diproyeksikan naik",
      icon: TrendingUp,
      tone: "text-rose-600 dark:text-rose-400",
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  }
  return {
    label: "Stabil/Stagnan",
    hint: "Perubahan belum signifikan",
    icon: Minus,
    tone: "text-foreground",
    badge: "border-border bg-muted/40 text-foreground",
  };
}

function statusMeta(status: SidakAgentForecastEntry["forecastStatus"]) {
  if (status === "improving") {
    return {
      label: "Membaik",
      icon: ArrowUpRight,
      tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (status === "declining") {
    return {
      label: "Memburuk",
      icon: ArrowDownRight,
      tone: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  }
  if (status === "stable") {
    return {
      label: "Stabil/Stagnan",
      icon: Minus,
      tone: "border-border bg-muted/40 text-foreground",
    };
  }
  return {
    label: "Pantauan",
    icon: ShieldAlert,
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
}

function confidenceMeta(confidence: "low" | "medium" | "high") {
  if (confidence === "high") {
    return {
      label: "Tinggi",
      tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (confidence === "medium") {
    return {
      label: "Sedang",
      tone: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "Rendah",
    tone: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
}

function ForecastMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ForecastLane({
  title,
  description,
  entries,
  emptyMessage,
  tone,
  compact = false,
}: {
  title: string;
  description: string;
  entries: SidakAgentForecastEntry[];
  emptyMessage: string;
  tone: "emerald" | "rose" | "amber" | "slate";
  compact?: boolean;
}) {
  const titleTone =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";

  const iconTone =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className={`h-4 w-4 ${iconTone}`} />
            <h3 className={`font-outfit text-base font-bold tracking-tight ${titleTone}`}>
              {title}
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {entries.length}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-4 py-6 sm:px-5">
          <QaStatePanel
            type="empty"
            compact={compact}
            title={emptyMessage}
            description="Filter yang dipilih belum menghasilkan cukup sinyal untuk lane ini."
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry, index) => (
            <AgentRow key={entry.agentId} entry={entry} rank={index + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgentRow({
  entry,
  rank,
}: {
  entry: SidakAgentForecastEntry;
  rank: number;
}) {
  const meta = statusMeta(entry.forecastStatus);
  const StatusIcon = meta.icon;
  return (
    <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-xs font-bold text-foreground">
        {entry.foto_url ? (
          <img
            src={entry.foto_url}
            alt={entry.nama}
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          agentInitials(entry.nama)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                #{rank}
              </span>
              <h4 className="truncate font-outfit text-sm font-bold tracking-tight text-foreground">
                {entry.nama}
              </h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {safeLabel(entry.tim)} · {safeLabel(entry.batchName)}
              {entry.jabatan ? ` · ${entry.jabatan}` : ""}
            </p>
          </div>

          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Skor
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatNumber(entry.latestScore, 1)}
              <span className="mx-1 text-muted-foreground">→</span>
              {formatNumber(entry.projectedScore, 1)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tren Temuan
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatSigned(entry.findingsSlope, 2)}/periode
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Confidence
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {confidenceMeta(entry.confidence).label}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            {entry.latestPeriodLabel}
          </span>
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            {entry.sourcePointCount} titik data
          </span>
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            Skor akhir {formatNumber(entry.latestScore, 1)}
          </span>
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            Temuan akhir {formatNumber(entry.latestFindingsCount, 0)}
          </span>
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            Tren temuan {formatSigned(entry.findingsSlope, 2)}/periode
          </span>
          <span className="rounded-full border border-border bg-bg px-2 py-1">
            Prediksi temuan {formatNumber(entry.projectedFindings, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SidakForecastPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedService, setSelectedService] = useState("call");
  const [selectedFolder, setSelectedFolder] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [startMonth, setStartMonth] = useState<number | null>(1);
  const [endMonth, setEndMonth] = useState<number | null>(currentMonth);
  const [selectedHorizon, setSelectedHorizon] = useState(3);
  const [serviceForecastLookup, setServiceForecastLookup] =
    useState<SidakForecastLookupResult | null>(null);
  const [serviceForecastLoading, setServiceForecastLoading] = useState(false);
  const [showForecastPrediction, setShowForecastPrediction] = useState(true);
  const [hiddenParams, setHiddenParams] = useState<Set<string> | null>(null);
  const [showTotalTrend, setShowTotalTrend] = useState(true);
  const [agentForecastLoading, setAgentForecastLoading] = useState(false);
  const [agentForecastResult, setAgentForecastResult] =
    useState<SidakAgentForecastResponse | null>(null);
  const [agentForecastError, setAgentForecastError] = useState<string | null>(
    null,
  );
  const [allFolders, setAllFolders] = useState<NormalizedSidakFolderOption[]>(
    [],
  );
  const forecastRequestId = useRef(0);
  const agentRequestId = useRef(0);
  const initialFolderSetRef = useRef(false);

  const dashboardQuery = useMemo(
    () =>
      toPeriodQueryParts({
        year: selectedYear,
        serviceType: selectedService,
        folderId: selectedFolder,
        startMonth,
        endMonth,
      }),
    [selectedYear, selectedService, selectedFolder, startMonth, endMonth],
  );

  const { data, loading, error, refetch } = useApi<DashboardData>(
    `/sidak/dashboard?${dashboardQuery}`,
  );

  const normalizedFolders = useMemo(
    () => normalizeSidakFolderOptions(data?.folders ?? []),
    [data?.folders],
  );
  useEffect(() => {
    if (data?.folders) {
      if (selectedFolder === "ALL" || normalizedFolders.length > allFolders.length) {
        setAllFolders(normalizedFolders);
      }
    }
  }, [data?.folders, normalizedFolders, selectedFolder, allFolders.length]);

  const folders = allFolders;
  const availableYears = useMemo(
    () => (data?.availableYears?.length ? data.availableYears : [currentYear]),
    [data, currentYear],
  );
  const availableServices = useMemo(
    () => normalizeAvailableServices(data?.availableServices),
    [data?.availableServices],
  );
  const leaderLockedService =
    availableServices.length === 1 ? String(availableServices[0]) : undefined;
  const effectiveService = leaderLockedService ?? selectedService;
  const selectedServiceLabel =
    SERVICE_LABELS[effectiveService as keyof typeof SERVICE_LABELS] ??
    effectiveService;
  const activeTotalDataset = useMemo(
    () => data?.paramTrend.datasets.find((dataset) => dataset.isTotal) ?? null,
    [data?.paramTrend.datasets],
  );
  const serviceForecastSnapshot = serviceForecastLookup?.snapshot ?? null;
  const serviceForecastSeries = serviceForecastSnapshot?.series.total ?? null;
  const serviceTrendDatasets = useMemo(
    () =>
      (data?.paramTrend.datasets ?? []).filter(
        (dataset) => showTotalTrend || !dataset.isTotal,
      ),
    [data?.paramTrend.datasets, showTotalTrend],
  );
  const serviceParameterDatasets = useMemo(
    () => serviceTrendDatasets.filter((dataset) => !dataset.isTotal),
    [serviceTrendDatasets],
  );
  const defaultHiddenParams = useMemo(() => {
    const next = new Set<string>();
    for (const dataset of serviceParameterDatasets) {
      next.add(dataset.label);
    }
    return next;
  }, [serviceParameterDatasets]);
  const activeHiddenParams = hiddenParams ?? defaultHiddenParams;
  const visibleParameterDatasets = useMemo(
    () =>
      serviceParameterDatasets.filter(
        (dataset) => !activeHiddenParams.has(dataset.label),
      ),
    [activeHiddenParams, serviceParameterDatasets],
  );
  const visibleSeriesCount =
    visibleParameterDatasets.length + (showTotalTrend ? 1 : 0);
  const canActivateMoreParams = visibleSeriesCount < MAX_VISIBLE_PARAMETER_SERIES;
  const canShowTotalTrend =
    showTotalTrend || visibleSeriesCount < MAX_VISIBLE_PARAMETER_SERIES;
  const shouldHideTotalLine = !showTotalTrend;
  const visibleServiceForecastResults = useMemo(() => {
    if (!showForecastPrediction || !serviceForecastSnapshot) {
      return [];
    }

    const parameterSeries = visibleParameterDatasets
      .map((dataset) =>
        serviceForecastSnapshot.series.parameters[dataset.label] ?? null,
      )
      .filter((series): series is NonNullable<typeof series> => series !== null);

    return showTotalTrend
      ? [serviceForecastSnapshot.series.total, ...parameterSeries]
      : parameterSeries;
  }, [
    serviceForecastSnapshot,
    showForecastPrediction,
    showTotalTrend,
    visibleParameterDatasets,
  ]);

  useEffect(() => {
    setShowForecastPrediction(true);
  }, [serviceForecastSnapshot]);

  useEffect(() => {
    setHiddenParams(null);
    setShowTotalTrend(true);
  }, [dashboardQuery]);

  useEffect(() => {
    if (!data) return;
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, data, selectedYear]);

  useEffect(() => {
    if (!data) return;
    if (
      availableServices.length > 0 &&
      !availableServices.includes(selectedService)
    ) {
      setSelectedService(String(availableServices[0]));
    }
  }, [availableServices, data, selectedService]);

  useEffect(() => {
    if (!folders.length) return;

    if (selectedFolder !== "ALL") {
      const isValid = folders.some((folder) => folder.id === selectedFolder);
      if (!isValid) {
        setSelectedFolder("ALL");
      }
    }

    if (!initialFolderSetRef.current && selectedFolder === "ALL") {
      const matchedFolder = findPrimarySidakFolderByName(
        folders,
        DEFAULT_SERVICE_FOLDER_MAP[effectiveService] ?? null,
      );
      if (matchedFolder) {
        setSelectedFolder(matchedFolder.id);
        initialFolderSetRef.current = true;
      }
    }
  }, [folders, selectedFolder, effectiveService]);

  const serviceForecastFilters = useMemo(
    () => ({
      year: selectedYear,
      serviceType: effectiveService as any,
      folderIds: selectedFolder === "ALL" ? undefined : [selectedFolder],
      startMonth: startMonth ?? undefined,
      endMonth: endMonth ?? undefined,
    }),
    [selectedYear, effectiveService, selectedFolder, startMonth, endMonth],
  );

  const agentForecastBody = useMemo(
    () => ({
      year: selectedYear,
      serviceType: effectiveService as any,
      folderIds: selectedFolder === "ALL" ? undefined : [selectedFolder],
      startMonth: startMonth ?? undefined,
      endMonth: endMonth ?? undefined,
      horizonMonths: selectedHorizon,
    }),
    [selectedYear, effectiveService, selectedFolder, startMonth, endMonth, selectedHorizon],
  );

  const serviceLookupKey = useMemo(
    () =>
      JSON.stringify({
        filters: serviceForecastFilters,
        labels: data?.paramTrend.labels ?? [],
        datasets: (data?.paramTrend.datasets ?? []).map((dataset) => ({
          label: dataset.label,
          data: dataset.data,
          isTotal: dataset.isTotal,
        })),
      }),
    [serviceForecastFilters, data?.paramTrend],
  );

  const agentLookupKey = useMemo(
    () =>
      JSON.stringify({
        filters: agentForecastBody,
        periods: (data?.periods ?? []).map((period) => period.id),
      }),
    [agentForecastBody, data?.periods],
  );

  const requestServiceForecast = useCallback(
    async (options: { forceRefresh?: boolean; cacheOnly?: boolean }) => {
      if (!data || (data.paramTrend.labels?.length ?? 0) < 2 || !activeTotalDataset) {
        setServiceForecastLookup(null);
        return null;
      }

      const requestId = ++forecastRequestId.current;
      setServiceForecastLoading(true);
      try {
        const response = await sidakClient.dashboard.forecast.$post({
          json: {
            filters: serviceForecastFilters,
            horizonMonths: selectedHorizon,
            forceRefresh: options.forceRefresh ?? false,
            cacheOnly: options.cacheOnly ?? false,
          },
        });
        const result = (await unwrapResponse(
          response,
        )) as SidakForecastLookupResult;
        if (requestId === forecastRequestId.current) {
          setServiceForecastLookup(result);
        }
        return result;
      } finally {
        if (requestId === forecastRequestId.current) {
          setServiceForecastLoading(false);
        }
      }
    },
    [activeTotalDataset, data, serviceForecastFilters, selectedHorizon],
  );

  const requestAgentForecast = useCallback(async () => {
    if (!data) {
      setAgentForecastResult(null);
      setAgentForecastError(null);
      return null;
    }

    const requestId = ++agentRequestId.current;
    setAgentForecastLoading(true);
    setAgentForecastError(null);
    try {
      const response = await sidakClient.forecast.agents.$post({
        json: agentForecastBody,
      });
      const result = (await unwrapResponse(
        response,
      )) as SidakAgentForecastResponse;
      if (requestId === agentRequestId.current) {
        setAgentForecastResult(result);
      }
      return result;
    } catch (e: any) {
      if (requestId === agentRequestId.current) {
        setAgentForecastError(e?.message ?? "Gagal memuat forecast agent.");
        setAgentForecastResult(null);
      }
      return null;
    } finally {
      if (requestId === agentRequestId.current) {
        setAgentForecastLoading(false);
      }
    }
  }, [agentForecastBody, data]);

  useEffect(() => {
    setServiceForecastLookup(null);
    if (loading || !data) return;

    if ((data.paramTrend.labels?.length ?? 0) < 2 || !activeTotalDataset) {
      return;
    }

    void requestServiceForecast({ cacheOnly: true }).catch((err: any) => {
      console.error("Service forecast lookup error:", err);
    });
  }, [serviceLookupKey, loading, data, activeTotalDataset, requestServiceForecast]);

  useEffect(() => {
    setAgentForecastResult(null);
    setAgentForecastError(null);
    if (loading || !data) return;

    void requestAgentForecast().catch((err: any) => {
      console.error("Agent forecast lookup error:", err);
    });
  }, [agentLookupKey, loading, data, requestAgentForecast]);

  const handleRefresh = async () => {
    if (!data) return;

    if ((data.paramTrend.labels?.length ?? 0) < 2 || !activeTotalDataset) {
      notify.error("Data historis minimal 2 periode diperlukan.");
      return;
    }

    try {
      await Promise.all([
        requestServiceForecast({ forceRefresh: true }),
        requestAgentForecast(),
      ]);
    } catch (err: any) {
      notify.error(err?.message || "Gagal memperbarui forecast.");
    }
  };

  const serviceSummary = serviceForecastSeries?.summary;
  const serviceDirection = serviceSummary
    ? forecastDirectionMeta(serviceSummary.direction)
    : null;
  const ServiceDirectionIcon = serviceDirection?.icon;
  const confidence = serviceSummary
    ? confidenceMeta(serviceSummary.confidence)
    : null;
  const improvementLane = agentForecastResult?.improvingAgents ?? [];
  const decliningLane = agentForecastResult?.decliningAgents ?? [];
  const stableLane = agentForecastResult?.stableAgents ?? [];
  const watchlistLane = agentForecastResult?.watchlistAgents ?? [];
  const hasAgentForecast =
    (agentForecastResult?.summary.totalEligible ?? 0) > 0;
  const onlyWatchlist =
    hasAgentForecast &&
    (agentForecastResult?.summary.improvingCount ?? 0) +
      (agentForecastResult?.summary.decliningCount ?? 0) +
      (agentForecastResult?.summary.stableCount ?? 0) ===
      0 &&
    (agentForecastResult?.summary.watchlistCount ?? 0) > 0;

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              SIDAK / Forecast
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <h1 className="font-outfit text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  Forecast
                </h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Lihat proyeksi layanan, baca sinyal cepat untuk coaching, dan
                  prioritaskan agent yang akan membaik atau memburuk dalam horizon
                  yang dipilih.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" />
                Perbarui
              </button>
            </div>
          </motion.div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
          className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <DashboardFilters
            selectedService={selectedService}
            onServiceChange={(value) => {
              const nextFolderName = DEFAULT_SERVICE_FOLDER_MAP[value] ?? null;
              const matchedFolder = findPrimarySidakFolderByName(
                folders,
                nextFolderName,
              );
              setSelectedService(value);
              setSelectedFolder(matchedFolder?.id ?? "ALL");
              initialFolderSetRef.current = Boolean(matchedFolder);
            }}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
            startMonth={startMonth}
            endMonth={endMonth}
            onMonthRangeChange={(start, end) => {
              setStartMonth(start);
              setEndMonth(end);
            }}
            folders={folders}
            availableYears={availableYears}
            leaderLockedService={leaderLockedService}
            availableServices={availableServices as string[]}
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Horizon
              </label>
              <select
                value={selectedHorizon}
                onChange={(e) => setSelectedHorizon(Number(e.target.value))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-foreground"
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month} value={month}>
                    {month} bulan
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm text-muted-foreground">
              <ChevronRight className="h-4 w-4 rotate-90" />
              <span>{selectedServiceLabel}</span>
            </div>

            <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {selectedFolder === "ALL"
                  ? "Semua tim"
                  : safeLabel(
                      folders.find((folder) => folder.id === selectedFolder)?.name,
                    )}
              </span>
            </div>
          </div>
        </motion.section>

        <div className="mt-6 space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: 0.08 }}
            className="grid gap-4 lg:grid-cols-2"
          >
            <section className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2">
                  <BadgeAlert className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-outfit text-base font-bold tracking-tight text-foreground">
                    Keputusan Cepat
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {serviceDirection?.hint ??
                    "Gunakan panel ini untuk membaca arah layanan dalam satu layar."}
                </p>
              </div>

              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Rekomendasi
                    </p>
                    <p className={`mt-1 flex items-center gap-2 text-sm font-semibold ${serviceDirection?.tone ?? "text-foreground"}`}>
                      {ServiceDirectionIcon ? (
                        <ServiceDirectionIcon className="h-4 w-4" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {serviceDirection?.label ?? "Menunggu data"}
                    </p>
                  </div>
                  {confidence ? (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confidence.tone}`}>
                      Confidence {confidence.label}
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ForecastMetric
                    label="Periode"
                    value={serviceForecastSeries?.summary.sourcePointCount?.toString() ?? "0"}
                    hint={serviceForecastSeries?.summary.method ?? "linear-regression"}
                  />
                  <ForecastMetric
                    label="Horizon"
                    value={`${selectedHorizon} bulan`}
                    hint={serviceForecastSeries?.scope.label ?? "Total Temuan"}
                  />
                </div>

                <div className="rounded-xl border border-border bg-bg px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status Snapshot
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {serviceForecastLookup?.status === "fresh"
                      ? "Snapshot terbaru siap dipakai."
                      : serviceForecastLookup?.status === "stale"
                        ? "Data baru terdeteksi. Refresh disarankan."
                        : serviceForecastLookup?.status === "missing"
                          ? "Belum ada snapshot tersimpan."
                          : "Menunggu lookup snapshot."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {serviceForecastSeries
                      ? `Latest period ${safeLabel(serviceForecastSeries.historical.at(-1)?.label)}`
                      : "Belum ada series forecast."}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-outfit text-base font-bold tracking-tight text-foreground">
                    Confidence & Coverage
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Coverage menilai seberapa banyak agent yang bisa diproyeksikan.
                </p>
              </div>

              <div className="grid gap-3 px-4 py-4 sm:px-5">
                <ForecastMetric
                  label="Agent Eligible"
                  value={String(agentForecastResult?.summary.totalEligible ?? 0)}
                  hint={`Horizon ${selectedHorizon} bulan · ${agentForecastResult?.summary.latestPeriodLabel ?? "N/A"}`}
                />
                <div className="grid grid-cols-2 gap-3">
                  <ForecastMetric
                    label="Membaik"
                    value={String(agentForecastResult?.summary.improvingCount ?? 0)}
                  />
                  <ForecastMetric
                    label="Memburuk"
                    value={String(agentForecastResult?.summary.decliningCount ?? 0)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ForecastMetric
                    label="Stabil/Stagnan"
                    value={String(agentForecastResult?.summary.stableCount ?? 0)}
                  />
                  <ForecastMetric
                    label="Pantauan"
                    value={String(agentForecastResult?.summary.watchlistCount ?? 0)}
                  />
                </div>
              </div>
            </section>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: 0.08 }}
            className="rounded-2xl border border-border bg-surface"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-outfit text-base font-bold tracking-tight text-foreground">
                    Forecast Layanan
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reuse trendline dashboard untuk layanan terpilih. Penurunan temuan
                  dibaca sebagai perbaikan.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {serviceForecastSnapshot ? (
                  <button
                    type="button"
                    onClick={() => setShowForecastPrediction((current) => !current)}
                    aria-pressed={showForecastPrediction}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {showForecastPrediction ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    {showForecastPrediction ? "Sembunyikan Prediksi" : "Tampilkan Prediksi"}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2">
                  <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => {
                      if (!canShowTotalTrend) return;
                      if (
                        showTotalTrend &&
                        visibleParameterDatasets.length === 0 &&
                        serviceParameterDatasets.length > 0
                      ) {
                        const [firstParameter] = serviceParameterDatasets;
                        setHiddenParams((prev) => {
                          const next = new Set(prev ?? defaultHiddenParams);
                          next.delete(firstParameter.label);
                          return next;
                        });
                      }
                      setShowTotalTrend((current) => !current);
                    }}
                    aria-pressed={showTotalTrend}
                    disabled={!canShowTotalTrend}
                    className={`rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                      showTotalTrend
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    title={
                      !canShowTotalTrend
                        ? "Maksimal 2 data tampil. Nonaktifkan salah satu parameter terlebih dahulu."
                        : undefined
                    }
                  >
                    {showTotalTrend ? "Total Temuan" : "Per Parameter"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Parameter
                  </span>
                  {serviceParameterDatasets.map((dataset) => {
                    const isHidden = activeHiddenParams.has(dataset.label);
                    const disableActivation = isHidden && !canActivateMoreParams;

                    return (
                      <button
                        key={dataset.label}
                        type="button"
                        disabled={disableActivation}
                        onClick={() => {
                          if (disableActivation) return;
                          setHiddenParams((prev) => {
                            const next = new Set(prev ?? defaultHiddenParams);
                            if (next.has(dataset.label)) {
                              next.delete(dataset.label);
                            } else {
                              next.add(dataset.label);
                            }
                            return next;
                          });
                        }}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                          isHidden
                            ? disableActivation
                              ? "border-border/60 bg-bg text-muted-foreground/60 opacity-60"
                              : "border-border bg-bg text-muted-foreground hover:bg-muted"
                            : "border-foreground bg-foreground text-background"
                        }`}
                        title={
                          disableActivation
                            ? "Maksimal 2 data tampil. Nonaktifkan salah satu terlebih dahulu."
                            : undefined
                        }
                      >
                        <span className="max-w-[150px] truncate">
                          {dataset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Total aktif menampilkan satu parameter. Matikan total untuk
                membandingkan dua parameter sekaligus.
              </p>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              {loading && !data ? (
                <QaStatePanel
                  type="loading"
                  title="Memuat data layanan"
                  description="Menarik periode, folder, dan trend dasar SIDAK."
                />
              ) : error ? (
                <QaStatePanel
                  type="error"
                  title="Data dashboard gagal dimuat"
                  description="Periksa koneksi atau scope akses Anda."
                  action={
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Coba lagi
                    </button>
                  }
                />
              ) : (data?.paramTrend.labels?.length ?? 0) < 2 || !activeTotalDataset ? (
                <QaStatePanel
                  type="empty"
                  title="Data historis minimal 2 periode diperlukan."
                  description="Service forecast belum bisa dihitung untuk filter ini."
                />
              ) : serviceForecastLoading && !serviceForecastLookup ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-[320px] rounded-2xl border border-border bg-bg" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="h-20 rounded-xl border border-border bg-bg" />
                    <div className="h-20 rounded-xl border border-border bg-bg" />
                    <div className="h-20 rounded-xl border border-border bg-bg" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-[320px] rounded-2xl border border-border bg-bg p-2">
                    <ParamTrendChart
                      labels={data?.paramTrend.labels ?? []}
                      datasets={serviceTrendDatasets}
                      showParameters={true}
                      hiddenKeys={activeHiddenParams}
                      forecastResults={visibleServiceForecastResults}
                      hideTotal={shouldHideTotalLine}
                      colorMap={{ "Total Temuan": "var(--foreground)" }}
                    />
                  </div>

                  {showForecastPrediction &&
                  showTotalTrend &&
                  serviceForecastSnapshot &&
                  serviceSummary ? (
                    <ForecastInsightPanel
                      forecastResult={serviceForecastSnapshot}
                      summary={serviceSummary}
                      horizonMonths={selectedHorizon}
                    />
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-3">
                    <ForecastMetric
                      label="Arah"
                      value={
                        serviceDirection
                          ? serviceDirection.label
                          : "Belum tersedia"
                      }
                      hint={
                        serviceDirection
                          ? serviceDirection.hint
                          : "Menunggu lookup forecast."
                      }
                    />
                    <ForecastMetric
                      label="Perubahan"
                      value={
                        serviceSummary
                          ? `${formatSigned(serviceSummary.projectedChange, 1)} (${serviceSummary.projectedChangePercent == null ? "N/A" : `${formatSigned(serviceSummary.projectedChangePercent, 1)}%`})`
                          : "N/A"
                      }
                      hint="Delta negatif berarti lebih sedikit temuan."
                    />
                    <ForecastMetric
                      label="Confidence"
                      value={confidence?.label ?? "N/A"}
                      hint={
                        serviceForecastLookup?.snapshot?.cache.status
                          ? `Cache ${serviceForecastLookup.snapshot.cache.status}`
                          : "Belum ada snapshot"
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </motion.section>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-outfit text-base font-bold tracking-tight text-foreground">
                Forecast Agent
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Agent dengan tren positif diprioritaskan untuk scaling. Tren negatif
              diprioritaskan untuk coaching.
            </p>
          </div>

          {agentForecastLoading && !agentForecastResult ? (
            <div className="px-4 py-5 sm:px-5">
              <QaStatePanel
                type="loading"
                title="Memproses proyeksi agent"
                description="Menghitung regresi skor, temuan, dan critical findings per agent."
              />
            </div>
          ) : agentForecastError ? (
            <div className="px-4 py-5 sm:px-5">
              <QaStatePanel
                type="error"
                title="Forecast agent gagal dimuat"
                description={agentForecastError}
              />
            </div>
          ) : onlyWatchlist ? (
            <div className="px-4 py-5 sm:px-5">
              <QaStatePanel
                type="empty"
                title="Belum cukup periode audit untuk memproyeksikan agent."
                description="Semua agent saat ini masuk watchlist karena jumlah periode yang tersedia masih terlalu sedikit."
              />
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              <div className="grid gap-6 xl:grid-cols-2">
                <ForecastLane
                  title="Membaik"
                  description="Agent dengan skor naik atau temuan turun."
                  entries={improvementLane}
                  emptyMessage="Belum ada agent yang diproyeksikan membaik."
                  tone="emerald"
                />
                <ForecastLane
                  title="Memburuk"
                  description="Agent dengan skor turun, temuan naik, atau critical naik."
                  entries={decliningLane}
                  emptyMessage="Belum ada agent yang diproyeksikan memburuk."
                  tone="rose"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <ForecastLane
                  title="Stabil/Stagnan"
                  description="Perubahan belum cukup kuat untuk masuk lane prioritas."
                  entries={stableLane}
                  emptyMessage="Belum ada agent yang stabil/stagnan pada filter ini."
                  tone="slate"
                  compact
                />
                <ForecastLane
                  title="Watchlist"
                  description="Agent dengan data kurang dari 2 periode."
                  entries={watchlistLane}
                  emptyMessage="Belum ada agent watchlist."
                  tone="amber"
                  compact
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
