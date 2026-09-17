import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Minus,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  DashboardData,
  SidakAgentForecastEntry,
  SidakAgentForecastResponse,
  SidakForecastLookupResult,
} from "@trainers/types";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import ParamTrendChart from "../../components/sidak/ParamTrendChart";
import ForecastInsightPanel from "../../components/sidak/ForecastInsightPanel";
import DashboardFilters from "../../components/sidak/DashboardFilters";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { DEFAULT_SERVICE_FOLDER_MAP, SERVICE_LABELS } from "../../lib/scoring";
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
  return Number(value)
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function safeLabel(label?: string | null) {
  return label && label.trim().length > 0 ? label : "N/A";
}

function forecastMethodLabel(method?: string | null) {
  if (!method || method === "linear-regression") return "Regresi Linear";
  return safeLabel(method);
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
      tone: "text-emerald-700 dark:text-emerald-400",
      badge:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }
  if (direction === "up") {
    return {
      label: "Memburuk",
      hint: "Temuan diproyeksikan naik",
      icon: TrendingUp,
      tone: "text-rose-700 dark:text-rose-400",
      badge:
        "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
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
      icon: TrendingUp,
      tone: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (status === "declining") {
    return {
      label: "Memburuk",
      icon: TrendingDown,
      tone: "text-rose-700 dark:text-rose-400",
    };
  }
  if (status === "stable") {
    return {
      label: "Stabil/Stagnan",
      icon: Minus,
      tone: "text-foreground",
    };
  }
  return {
    label: "Pantauan",
    icon: ShieldAlert,
    tone: "text-amber-700 dark:text-amber-400",
  };
}

function confidenceMeta(confidence: "low" | "medium" | "high") {
  if (confidence === "high") {
    return {
      label: "Tinggi",
      tone: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (confidence === "medium") {
    return {
      label: "Sedang",
      tone: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    label: "Rendah",
    tone: "text-rose-700 dark:text-rose-400",
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
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ForecastLane({
  title,
  description,
  entries,
  emptyMessage,
  tone,
  showAgentContext,
}: {
  title: string;
  description: string;
  entries: SidakAgentForecastEntry[];
  emptyMessage: string;
  tone: "emerald" | "rose" | "amber" | "slate";
  showAgentContext: boolean;
}) {
  const titleTone =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-400"
        : tone === "amber"
          ? "text-amber-700 dark:text-amber-400"
          : "text-foreground";

  const dotTone =
    tone === "rose"
      ? "bg-destructive"
      : tone === "slate"
        ? "bg-muted-foreground"
        : "bg-primary";

  return (
    <section className="flex min-w-0 flex-col xl:px-5 first:pl-0 last:pr-0">
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-full", dotTone)}
            />
            <h3
              className={cn(
                "truncate font-heading text-sm font-semibold tracking-tight sm:text-base",
                titleTone,
              )}
            >
              {title}
            </h3>
          </div>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {description}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {entries.length} agent
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-48 items-center p-3">
          <QaStatePanel
            type="empty"
            compact
            title={emptyMessage}
            description="Filter yang dipilih belum menghasilkan cukup sinyal untuk lane ini."
          />
        </div>
      ) : (
        <ScrollArea
          role="region"
          aria-label={`Daftar agent ${title.toLocaleLowerCase("id-ID")}`}
          className="h-auto lg:max-h-[23rem]"
        >
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <AgentRow
                key={entry.agentId}
                entry={entry}
                showContext={showAgentContext}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}

function AgentRow({
  entry,
  showContext,
}: {
  entry: SidakAgentForecastEntry;
  showContext: boolean;
}) {
  const meta = statusMeta(entry.forecastStatus);
  const StatusIcon = meta.icon;
  const groupLabel = safeLabel(entry.batchName || entry.tim);
  const roleLabel =
    entry.jabatan && entry.jabatan.toLocaleLowerCase("id-ID") !== "agent"
      ? safeLabel(entry.jabatan)
      : null;
  const contextLabel = [groupLabel, roleLabel].filter(Boolean).join(" · ");

  return (
    <article className="flex items-start gap-2.5 p-3">
      <Avatar size="sm" className="rounded-lg bg-muted after:rounded-lg">
        {entry.foto_url ? (
          <AvatarImage
            src={entry.foto_url}
            alt={entry.nama}
            className="rounded-lg"
          />
        ) : null}
        <AvatarFallback className="rounded-lg font-heading text-xs font-semibold text-foreground">
          {agentInitials(entry.nama)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0">
            <h4 className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">
              {entry.nama}
            </h4>
            {showContext && contextLabel ? (
              <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
                {contextLabel}
              </p>
            ) : null}
          </div>

          <span
            aria-label={`Status ${meta.label}`}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold",
              meta.tone,
            )}
          >
            <StatusIcon aria-hidden="true" className="size-3.5" />
            <span>{meta.label}</span>
          </span>
        </div>

        <div className="mt-3 border-t border-border/70 pt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
            <p className="text-muted-foreground">
              <span>Skor </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatNumber(entry.latestScore, 1)}
                <span className="mx-1 text-muted-foreground" aria-hidden="true">
                  →
                </span>
                {formatNumber(entry.projectedScore, 1)}
              </span>
            </p>
            <p className="text-muted-foreground">
              <span>Temuan </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatSigned(entry.findingsSlope, 2)}/periode
              </span>
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
            <span>Kualitas {confidenceMeta(entry.confidence).label}</span>
            <span>{entry.sourcePointCount} titik</span>
            <span>{entry.latestPeriodLabel}</span>
            <span>
              Prediksi {formatNumber(entry.projectedFindings, 1)} temuan
            </span>
          </div>
        </div>
      </div>
    </article>
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
      if (
        selectedFolder === "ALL" ||
        normalizedFolders.length > allFolders.length
      ) {
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
  const canActivateMoreParams =
    visibleSeriesCount < MAX_VISIBLE_PARAMETER_SERIES;
  const canShowTotalTrend =
    showTotalTrend || visibleSeriesCount < MAX_VISIBLE_PARAMETER_SERIES;
  const shouldHideTotalLine = !showTotalTrend;
  const visibleServiceForecastResults = useMemo(() => {
    if (!showForecastPrediction || !serviceForecastSnapshot) {
      return [];
    }

    const parameterSeries = visibleParameterDatasets
      .map(
        (dataset) =>
          serviceForecastSnapshot.series.parameters[dataset.label] ?? null,
      )
      .filter(
        (series): series is NonNullable<typeof series> => series !== null,
      );

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
    [
      selectedYear,
      effectiveService,
      selectedFolder,
      startMonth,
      endMonth,
      selectedHorizon,
    ],
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
      if (
        !data ||
        (data.paramTrend.labels?.length ?? 0) < 2 ||
        !activeTotalDataset
      ) {
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
  }, [
    serviceLookupKey,
    loading,
    data,
    activeTotalDataset,
    requestServiceForecast,
  ]);

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

  const improvementLane = agentForecastResult?.improvingAgents ?? [];
  const decliningLane = agentForecastResult?.decliningAgents ?? [];
  const stableLane = agentForecastResult?.stableAgents ?? [];
  const watchlistLane = agentForecastResult?.watchlistAgents ?? [];
  const showAgentContext =
    new Set(
      [
        ...improvementLane,
        ...decliningLane,
        ...stableLane,
        ...watchlistLane,
      ].map((entry) => safeLabel(entry.batchName || entry.tim)),
    ).size > 1;
  const hasAgentForecast =
    (agentForecastResult?.summary.totalEligible ?? 0) > 0;
  const onlyWatchlist =
    hasAgentForecast &&
    (agentForecastResult?.summary.improvingCount ?? 0) +
      (agentForecastResult?.summary.decliningCount ?? 0) +
      (agentForecastResult?.summary.stableCount ?? 0) ===
      0 &&
    (agentForecastResult?.summary.watchlistCount ?? 0) > 0;
  const isRefreshing = serviceForecastLoading || agentForecastLoading;

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Forecast
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Gunakan filter untuk melihat proyeksi layanan dan menentukan
                agent yang perlu diprioritaskan.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="min-h-[44px] w-full sm:w-auto"
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(
                  isRefreshing && "animate-spin motion-reduce:animate-none",
                )}
                aria-hidden="true"
              />
              Perbarui
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section aria-labelledby="forecast-context-title" className="space-y-3">
          <div className="max-w-2xl">
            <h2
              id="forecast-context-title"
              className="font-heading text-base font-semibold tracking-tight text-foreground"
            >
              Filter forecast
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Pilih layanan, tim, periode data, dan rentang proyeksi.
            </p>
          </div>

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
            showHeader={false}
          />

          <div className="flex items-end border-t border-border pt-3">
            <div className="flex w-full flex-col gap-1.5 sm:w-40">
              <Label
                htmlFor="sidak-forecast-horizon"
                className="text-xs font-semibold text-muted-foreground"
              >
                Periode proyeksi
              </Label>
              <Select
                items={MONTH_OPTIONS.map((month) => ({
                  value: String(month),
                  label: `${month} bulan`,
                }))}
                value={String(selectedHorizon)}
                onValueChange={(value) => {
                  if (value !== null) setSelectedHorizon(Number(value));
                }}
              >
                <SelectTrigger
                  id="sidak-forecast-horizon"
                  aria-label="Periode proyeksi"
                  className="min-h-[44px] w-full rounded-lg border-border bg-background text-sm font-medium hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <SelectValue placeholder="Pilih horizon" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {MONTH_OPTIONS.map((month) => (
                      <SelectItem key={month} value={String(month)}>
                        {month} bulan
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section
              aria-labelledby="forecast-projection-title"
              className="min-w-0 border-y border-border py-4 sm:py-5"
            >
              <header className="pb-0">
                <h2
                  id="forecast-projection-title"
                  className="font-heading text-base font-semibold tracking-tight text-foreground"
                >
                  Proyeksi temuan
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {serviceDirection?.hint ??
                    "Arah temuan pada layanan yang dipilih."}
                </p>
              </header>

              <div className="flex flex-col gap-4 pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Rekomendasi
                    </p>
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-2 text-sm font-semibold",
                        serviceDirection?.tone ?? "text-foreground",
                      )}
                    >
                      {ServiceDirectionIcon ? (
                        <ServiceDirectionIcon
                          aria-hidden="true"
                          className="size-4"
                        />
                      ) : (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin motion-reduce:animate-none"
                        />
                      )}
                      {serviceDirection?.label ?? "Menunggu data"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <ForecastMetric
                    label="Titik data"
                    value={
                      serviceForecastSeries?.summary.sourcePointCount?.toString() ??
                      "0"
                    }
                    hint={forecastMethodLabel(
                      serviceForecastSeries?.summary.method,
                    )}
                  />
                  <ForecastMetric
                    label="Periode"
                    value={`${selectedHorizon} bulan`}
                    hint={serviceForecastSeries?.scope.label ?? "Total Temuan"}
                  />
                </div>

                <div className="pt-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Status data
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {serviceForecastLookup?.status === "fresh"
                      ? "Data terbaru siap dipakai."
                      : serviceForecastLookup?.status === "stale"
                        ? "Data berubah. Perbarui proyeksi."
                        : serviceForecastLookup?.status === "missing"
                          ? "Belum ada data proyeksi."
                          : "Menunggu data proyeksi."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {serviceForecastSeries
                      ? `Periode terakhir ${safeLabel(serviceForecastSeries.historical.at(-1)?.label)}`
                      : "Belum ada series forecast."}
                  </p>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="forecast-data-title"
              className="min-w-0 border-y border-border py-4 sm:py-5"
            >
              <header className="pb-0">
                <h2
                  id="forecast-data-title"
                  className="font-heading text-base font-semibold tracking-tight text-foreground"
                >
                  Kecukupan data
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agent yang memiliki cukup bukti untuk diproyeksikan.
                </p>
              </header>

              <div className="flex flex-col gap-4 pt-4">
                <div>
                  <ForecastMetric
                    label="Agent siap diproyeksikan"
                    value={String(
                      agentForecastResult?.summary.totalEligible ?? 0,
                    )}
                    hint={`Periode ${selectedHorizon} bulan · ${agentForecastResult?.summary.latestPeriodLabel ?? "N/A"}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <ForecastMetric
                    label="Membaik"
                    value={String(
                      agentForecastResult?.summary.improvingCount ?? 0,
                    )}
                  />
                  <ForecastMetric
                    label="Memburuk"
                    value={String(
                      agentForecastResult?.summary.decliningCount ?? 0,
                    )}
                  />
                  <ForecastMetric
                    label="Stabil/stagnan"
                    value={String(
                      agentForecastResult?.summary.stableCount ?? 0,
                    )}
                  />
                  <ForecastMetric
                    label="Pantauan"
                    value={String(
                      agentForecastResult?.summary.watchlistCount ?? 0,
                    )}
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="border-y border-border py-4 sm:py-5">
            <header className="flex flex-col gap-4 pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Tren layanan
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Tren temuan historis dan proyeksi untuk layanan terpilih.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {serviceForecastSnapshot ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() =>
                      setShowForecastPrediction((current) => !current)
                    }
                    aria-pressed={showForecastPrediction}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    {showForecastPrediction ? (
                      <EyeOff data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <Eye data-icon="inline-start" aria-hidden="true" />
                    )}
                    {showForecastPrediction
                      ? "Sembunyikan Prediksi"
                      : "Tampilkan Prediksi"}
                  </Button>
                ) : null}
              </div>
            </header>

            <div className="flex flex-col gap-4 pt-4">
              <fieldset className="flex flex-col gap-3 border-b border-border pb-3">
                <legend className="sr-only">
                  Seri grafik yang ditampilkan
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tampilkan
                  </span>
                  <Button
                    type="button"
                    variant={showTotalTrend ? "default" : "outline"}
                    size="lg"
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
                    className="min-h-[44px]"
                    title={
                      !canShowTotalTrend
                        ? "Maksimal 2 data tampil. Nonaktifkan salah satu parameter terlebih dahulu."
                        : undefined
                    }
                  >
                    {showTotalTrend ? "Total Temuan" : "Per Parameter"}
                  </Button>

                  <span className="ml-1 text-xs font-medium text-muted-foreground">
                    Parameter
                  </span>
                  {serviceParameterDatasets.map((dataset) => {
                    const isHidden = activeHiddenParams.has(dataset.label);
                    const disableActivation =
                      isHidden && !canActivateMoreParams;

                    return (
                      <Button
                        key={dataset.label}
                        type="button"
                        variant={isHidden ? "outline" : "default"}
                        size="lg"
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
                        aria-pressed={!isHidden}
                        className="min-h-[44px] max-w-48"
                        title={
                          disableActivation
                            ? "Maksimal 2 data tampil. Nonaktifkan salah satu terlebih dahulu."
                            : undefined
                        }
                      >
                        <span className="truncate">{dataset.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </fieldset>

              <p className="text-xs leading-5 text-muted-foreground">
                Total aktif menampilkan satu parameter. Matikan total untuk
                membandingkan dua parameter sekaligus.
              </p>
            </div>

            <div className="flex flex-col gap-4 pt-4">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => void refetch()}
                      className="min-h-[44px]"
                    >
                      <RefreshCw data-icon="inline-start" aria-hidden="true" />
                      Coba lagi
                    </Button>
                  }
                />
              ) : (data?.paramTrend.labels?.length ?? 0) < 2 ||
                !activeTotalDataset ? (
                <QaStatePanel
                  type="empty"
                  title="Data historis minimal 2 periode diperlukan."
                  description="Service forecast belum bisa dihitung untuk filter ini."
                />
              ) : serviceForecastLoading && !serviceForecastLookup ? (
                <div
                  className="flex flex-col gap-3"
                  aria-label="Memuat grafik forecast"
                >
                  <Skeleton className="h-[320px] rounded-lg motion-reduce:animate-none" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Skeleton className="h-20 rounded-lg motion-reduce:animate-none" />
                    <Skeleton className="h-20 rounded-lg motion-reduce:animate-none" />
                    <Skeleton className="h-20 rounded-lg motion-reduce:animate-none" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-[320px] rounded-lg border border-border bg-background p-2 sm:h-[360px]">
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
                </>
              )}
            </div>
          </section>

          <section
            aria-labelledby="forecast-agent-title"
            className="border-y border-border py-4 sm:py-5"
          >
            <header className="pb-0">
              <h2
                id="forecast-agent-title"
                className="font-heading text-base font-semibold tracking-tight text-foreground"
              >
                Prioritas agent
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Kelompokkan agent berdasarkan arah tren dan kecukupan data.
              </p>
            </header>

            <div className="pt-4">
              {agentForecastLoading && !agentForecastResult ? (
                <QaStatePanel
                  type="loading"
                  title="Memproses proyeksi agent"
                  description="Menghitung regresi skor, temuan, dan critical findings per agent."
                />
              ) : agentForecastError ? (
                <QaStatePanel
                  type="error"
                  title="Forecast agent gagal dimuat"
                  description={agentForecastError}
                />
              ) : onlyWatchlist ? (
                <QaStatePanel
                  type="empty"
                  title="Belum cukup periode audit untuk memproyeksikan agent."
                  description="Semua agent saat ini masuk watchlist karena jumlah periode yang tersedia masih terlalu sedikit."
                />
              ) : (
                <div
                  data-testid="forecast-agent-board"
                  className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border"
                >
                  <ForecastLane
                    title="Membaik"
                    description="Skor naik atau temuan turun."
                    entries={improvementLane}
                    emptyMessage="Belum ada agent yang diproyeksikan membaik."
                    tone="emerald"
                    showAgentContext={showAgentContext}
                  />
                  <ForecastLane
                    title="Memburuk"
                    description="Skor turun atau temuan naik."
                    entries={decliningLane}
                    emptyMessage="Belum ada agent yang diproyeksikan memburuk."
                    tone="rose"
                    showAgentContext={showAgentContext}
                  />
                  <ForecastLane
                    title="Stabil/Stagnan"
                    description="Perubahan belum signifikan."
                    entries={stableLane}
                    emptyMessage="Belum ada agent yang stabil/stagnan pada filter ini."
                    tone="slate"
                    showAgentContext={showAgentContext}
                  />
                  <ForecastLane
                    title="Watchlist"
                    description="Data belum cukup untuk proyeksi."
                    entries={watchlistLane}
                    emptyMessage="Belum ada agent watchlist."
                    tone="amber"
                    showAgentContext={showAgentContext}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
