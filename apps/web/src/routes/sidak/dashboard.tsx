import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import {
  VALID_SERVICE_TYPES,
  type DashboardData,
  type ServiceType,
  type SidakBatchForecastSnapshot,
  type SidakForecastLookupResult,
  type SidakForecastLookupStatus,
  type SidakForecastSeries,
} from "@trainers/types";
import { RefreshCw, Loader2, AlertTriangle, ArrowUp } from "lucide-react";
import KpiCard from "../../components/sidak/KpiCard";
import { buildKpiDelta } from "../../lib/sidak-kpi-delta";
import { SERVICE_LABELS, DEFAULT_SERVICE_FOLDER_MAP } from "../../lib/scoring";
import {
  findPrimarySidakFolderByName,
  normalizeSidakFolderOptions,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";
import { buildParetoViewModel } from "../../components/sidak/pareto-view-model";
import ParamTrendChart from "../../components/sidak/ParamTrendChart";
import TopAgentsTable from "../../components/sidak/TopAgentsTable";
import DashboardFilters from "../../components/sidak/DashboardFilters";
import SidakConditionSummary from "../../components/sidak/SidakConditionSummary";
import SidakDashboardHeatmap from "../../components/sidak/SidakDashboardHeatmap";
import SidakDashboardPanel from "../../components/sidak/SidakDashboardPanel";
import SidakParameterRanking from "../../components/sidak/SidakParameterRanking";
import { MONTH_SHORT } from "../../components/sidak/heatmap-insights";

function DashboardSkeleton() {
  return (
    <div
      data-testid="sidak-dashboard-skeleton"
      className="space-y-6 motion-safe:animate-pulse"
    >
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="h-[120px] rounded-xl bg-muted/40" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[170px] rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-full bg-muted/60" />
              <div className="h-8 w-20 rounded-full bg-muted/60" />
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-3 w-32 rounded-full bg-muted/60" />
              <div className="h-12 w-40 rounded-full bg-muted/60" />
              <div className="h-4 w-48 rounded-full bg-muted/60" />
            </div>
            <div className="mt-8 h-16 rounded-b-2xl bg-muted/40" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-[560px] rounded-2xl border border-border bg-surface" />
          <div className="h-[420px] rounded-2xl border border-border bg-surface" />
        </div>
        <div className="space-y-6">
          <div className="h-[520px] rounded-2xl border border-border bg-surface" />
          <div className="h-[360px] rounded-2xl border border-border bg-surface" />
          <div className="h-[320px] rounded-2xl border border-border bg-surface" />
        </div>
      </div>
    </div>
  );
}

export default function SidakDashboardPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const maxVisibleParameters = 2;
  const [selectedService, setSelectedService] = useState("call");
  const [selectedFolder, setSelectedFolder] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState<number | null>(1);
  const [endMonth, setEndMonth] = useState<number | null>(
    new Date().getMonth() + 1,
  );
  const [hiddenParams, setHiddenParams] = useState<Set<string> | null>(null);
  const [showTotalTrend, setShowTotalTrend] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastStatus, setForecastStatus] =
    useState<SidakForecastLookupStatus>("missing");
  const [forecastResult, setForecastResult] =
    useState<SidakBatchForecastSnapshot | null>(null);
  const [showForecastPrediction, setShowForecastPrediction] = useState(true);
  const forecastRequestId = useRef(0);
  const initialFolderSetRef = useRef(false);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(selectedYear));
    p.set("service_type", selectedService);
    if (selectedFolder !== "ALL") p.set("folder_ids", selectedFolder);
    if (startMonth !== null) p.set("startMonth", String(startMonth));
    if (endMonth !== null) p.set("endMonth", String(endMonth));
    return p.toString();
  }, [selectedService, selectedFolder, selectedYear, startMonth, endMonth]);

  const { data, loading, error, refetch } = useApi<DashboardData>(
    `/sidak/dashboard?${queryParams}`,
  );

  const [allFolders, setAllFolders] = useState<NormalizedSidakFolderOption[]>(
    [],
  );

  useEffect(() => {
    if (data?.folders) {
      const mapped = normalizeSidakFolderOptions(data.folders as any[]);
      if (selectedFolder === "ALL" || mapped.length > allFolders.length) {
        setAllFolders(mapped);
      }
    }
  }, [data?.folders, selectedFolder, allFolders.length]);

  const folders = allFolders;

  const paramTrendDatasets = data?.paramTrend?.datasets;
  const defaultHiddenParams = useMemo(() => {
    const next = new Set<string>();
    for (const ds of paramTrendDatasets ?? []) {
      if (!ds.isTotal) next.add(ds.label);
    }
    return next;
  }, [paramTrendDatasets]);

  const activeHiddenParams = hiddenParams ?? defaultHiddenParams;

  const forecastFilters = useMemo(
    () => ({
      year: selectedYear,
      serviceType: selectedService === "all" ? undefined : selectedService,
      folderIds: selectedFolder === "ALL" ? undefined : [selectedFolder],
      periodIds: (data?.periods ?? [])
        .filter(
          (period) =>
            period.year === selectedYear &&
            (!startMonth || period.month >= startMonth) &&
            (!endMonth || period.month <= endMonth),
        )
        .map((period) => period.id),
    }),
    [
      data?.periods,
      selectedYear,
      selectedService,
      selectedFolder,
      startMonth,
      endMonth,
    ],
  );

  const requestForecast = useCallback(
    async (options: { forceRefresh?: boolean; cacheOnly?: boolean }) => {
      if (!data || data.paramTrend.labels.length < 2) {
        setForecastResult(null);
        setForecastStatus("missing");
        return null;
      }
      const requestId = ++forecastRequestId.current;
      const response = await sidakClient.dashboard.forecast.$post({
        json: {
          filters: forecastFilters,
          horizonMonths: 3,
          forceRefresh: options.forceRefresh ?? false,
          cacheOnly: options.cacheOnly ?? false,
        },
      });
      const result = (await unwrapResponse(
        response,
      )) as SidakForecastLookupResult;
      if (requestId === forecastRequestId.current) {
        setForecastResult(result.snapshot);
        setForecastStatus(result.status);
      }
      return result;
    },
    [data, forecastFilters],
  );

  const handleUpdateForecast = async () => {
    if (!data || data.paramTrend.labels.length < 2) {
      notify.error("Data tidak cukup untuk melakukan prediksi.");
      return;
    }

    setForecastLoading(true);
    try {
      await requestForecast({ forceRefresh: true });
    } catch (err: any) {
      console.error("Forecast error:", err);
      notify.error(err.message || "Gagal memperbarui prediksi.");
    } finally {
      setForecastLoading(false);
    }
  };

  const forecastLookupKey = useMemo(
    () =>
      JSON.stringify({
        filters: forecastFilters,
        labels: data?.paramTrend.labels ?? [],
        datasets: (data?.paramTrend.datasets ?? []).map((dataset) => ({
          label: dataset.label,
          data: dataset.data,
        })),
      }),
    [forecastFilters, data?.paramTrend],
  );

  useEffect(() => {
    if (!data || data.paramTrend.labels.length < 2) {
      setForecastResult(null);
      setForecastStatus("missing");
      return;
    }
    setForecastResult(null);
    setForecastStatus("missing");
    void requestForecast({ cacheOnly: true }).catch((error) => {
      console.error("Forecast cache lookup error:", error);
    });
  }, [forecastLookupKey, data, requestForecast]);

  const visibleForecastParameters = useMemo(
    () =>
      (data?.paramTrend.datasets ?? []).filter(
        (dataset) => !dataset.isTotal && !activeHiddenParams.has(dataset.label),
      ),
    [data?.paramTrend.datasets, activeHiddenParams],
  );
  const totalParameterCount = useMemo(
    () =>
      (data?.paramTrend.datasets ?? []).filter((dataset) => !dataset.isTotal)
        .length,
    [data?.paramTrend.datasets],
  );
  const visibleParamCount = visibleForecastParameters.length;
  const visibleSeriesCount = visibleParamCount + (showTotalTrend ? 1 : 0);
  const canActivateMoreParams = visibleSeriesCount < maxVisibleParameters;
  const canShowTotalTrend =
    showTotalTrend || visibleSeriesCount < maxVisibleParameters;

  const selectedForecastSeries: SidakForecastSeries | null = useMemo(() => {
    if (!showForecastPrediction) return null;
    if (!forecastResult) return null;
    if (visibleForecastParameters.length === 1) {
      return (
        forecastResult.series.parameters[visibleForecastParameters[0].label] ??
        null
      );
    }
    return forecastResult.series.total;
  }, [forecastResult, showForecastPrediction, visibleForecastParameters]);
  const selectedForecastSeriesList = useMemo(() => {
    if (!showForecastPrediction) return [];
    if (!forecastResult) return [];
    if (visibleForecastParameters.length === 0 && showTotalTrend) {
      return [forecastResult.series.total];
    }
    const parameterSeries = visibleForecastParameters
      .map((dataset) => forecastResult.series.parameters[dataset.label] ?? null)
      .filter((series): series is SidakForecastSeries => series !== null);

    return showTotalTrend
      ? [forecastResult.series.total, ...parameterSeries]
      : parameterSeries;
  }, [
    forecastResult,
    showForecastPrediction,
    showTotalTrend,
    visibleForecastParameters,
  ]);
  const totalForecastSummary = forecastResult?.series.total.summary;
  const hasForecastPrediction = Boolean(forecastResult);

  const availableServices = useMemo(
    () => data?.availableServices ?? [],
    [data?.availableServices],
  );
  const availableYears = data?.availableYears ?? [new Date().getFullYear()];
  const heatmapServiceType = VALID_SERVICE_TYPES.find(
    (service): service is ServiceType => service === selectedService,
  );
  const heatmapServiceLabel = heatmapServiceType
    ? SERVICE_LABELS[heatmapServiceType] || heatmapServiceType
    : "Semua layanan";

  // Normalize invalid selections
  useEffect(() => {
    if (loading || !data) return;
    if (
      availableServices.length > 0 &&
      !(availableServices as string[]).includes(selectedService)
    ) {
      setSelectedService(availableServices[0]);
    }
  }, [availableServices, selectedService, loading, data]);

  useEffect(() => {
    if (loading || !data) return;
    if (folders.length > 0) {
      if (selectedFolder !== "ALL") {
        const valid = folders.some((f) => f.id === selectedFolder);
        if (!valid) setSelectedFolder("ALL");
      }

      // Default folder pairing on initial load when folders are fetched
      if (!initialFolderSetRef.current && selectedFolder === "ALL") {
        const targetFolderName = DEFAULT_SERVICE_FOLDER_MAP[selectedService];
        const matchedFolder = findPrimarySidakFolderByName(
          folders,
          targetFolderName,
        );
        if (matchedFolder) {
          setSelectedFolder(matchedFolder.id);
          initialFolderSetRef.current = true;
        }
      }
    }
  }, [folders, selectedFolder, loading, data, selectedService]);

  // Compute leader locked service
  const leaderLockedService = useMemo(() => {
    if (availableServices.length === 1) return availableServices[0];
    return null;
  }, [availableServices]);

  const shouldHideTotalLine = !showTotalTrend;

  useEffect(() => {
    setHiddenParams(null);
    setShowTotalTrend(true);
  }, [queryParams]);

  useEffect(() => {
    if (!forecastResult) {
      setShowForecastPrediction(true);
    }
  }, [forecastResult]);

  const handleReset = useCallback(() => {
    initialFolderSetRef.current = false;
    setSelectedService(leaderLockedService ?? "call");
    setSelectedFolder("ALL");
    setSelectedYear(new Date().getFullYear());
    setStartMonth(1);
    setEndMonth(new Date().getMonth() + 1);
    setHiddenParams(null);
    setShowTotalTrend(true);
  }, [leaderLockedService]);

  const summary = data?.summary;
  const hasSummary = summary && summary.totalAgents > 0;
  const hasNoData = !data && !loading;
  const hasNoPeriods = data && !hasSummary && !loading;

  const paretoViewModel = useMemo(
    () => buildParetoViewModel(data?.paretoData),
    [data?.paretoData],
  );

  const sparklines = data?.sparklines ?? {};
  const buildDelta = (
    id: string,
    unit: "relative-percent" | "percentage-point",
    lowerIsBetter: boolean,
  ) => {
    const points = sparklines[id];
    if (!points || points.length < 2) return null;
    const previous = points[points.length - 2];
    const current = points[points.length - 1];
    return buildKpiDelta({
      current: current.value,
      previous: previous.value,
      previousLabel: previous.label,
      unit,
      lowerIsBetter,
    });
  };

  const complianceLabel =
    startMonth !== endMonth ? "Rata-rata Kepatuhan" : "Tingkat Kepatuhan";

  const KPI_CARDS = [
    {
      id: "total-defects",
      label: "Total Temuan QA",
      value: summary?.totalDefects ?? 0,
      desc: "Kumulatif temuan parameter",
      deltaUnit: "relative-percent" as const,
      lowerIsBetter: true,
    },
    {
      id: "avg-defects",
      label: "Rata-rata Temuan per Agen",
      value: (summary?.avgDefectsPerAudit ?? 0).toFixed(1),
      desc: "Rasio temuan / sesi audit",
      deltaUnit: "relative-percent" as const,
      lowerIsBetter: true,
    },
    {
      id: "avg-score",
      label: "Rata-rata Skor",
      value: `${(summary?.avgAgentScore ?? 0).toFixed(1)}%`,
      desc: "Kualitas performa rata-rata",
      deltaUnit: "percentage-point" as const,
      lowerIsBetter: false,
    },
    {
      id: "compliance",
      label: complianceLabel,
      value: `${(summary?.complianceRate ?? 0).toFixed(1)}%`,
      desc:
        startMonth !== endMonth
          ? `${Math.round(summary?.complianceCount ?? 0)} agen dengan skor ≥ 95 (rata-rata per bulan)`
          : `${summary?.complianceCount ?? 0} agen dengan skor ≥ 95`,
      deltaUnit: "percentage-point" as const,
      lowerIsBetter: false,
    },
  ];

  const serviceLabel =
    SERVICE_LABELS[selectedService as keyof typeof SERVICE_LABELS] ||
    selectedService;
  const folderLabel =
    selectedFolder === "ALL"
      ? "Semua tim"
      : (folders.find((folder) => folder.id === selectedFolder)?.name ??
        "Tim terpilih");
  const monthRangeLabel =
    startMonth && endMonth
      ? startMonth === endMonth
        ? MONTH_SHORT[startMonth - 1]
        : `${MONTH_SHORT[startMonth - 1]}–${MONTH_SHORT[endMonth - 1]}`
      : "Sepanjang";
  const scopeLine = `${serviceLabel} · ${folderLabel} · ${monthRangeLabel} ${selectedYear}`;
  const chipClass = (active: boolean, disabled: boolean) =>
    `inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8 ${
      active
        ? "border-foreground bg-foreground text-background"
        : disabled
          ? "cursor-not-allowed border-border text-muted-foreground opacity-50"
          : "border-border text-fg2 hover:bg-muted hover:text-foreground"
    }`;

  return (
    <div className="bg-background min-h-full">
      <div className="@container/dashboard mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-outfit text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-balance text-foreground focus:outline-none"
            >
              Dashboard SIDAK
            </h1>
            <p className="mt-1 text-sm text-fg2">{scopeLine}</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`}
            />
            {loading ? "Memperbarui data…" : "Perbarui data"}
          </button>
        </header>

        {/* Filter Bar */}
        <DashboardFilters
          showHeader={false}
          selectedService={selectedService}
          onServiceChange={(svc) => {
            setSelectedService(svc);
            const matchedFolder = findPrimarySidakFolderByName(
              folders,
              DEFAULT_SERVICE_FOLDER_MAP[svc],
            );
            if (matchedFolder) {
              setSelectedFolder(matchedFolder.id);
            } else {
              setSelectedFolder("ALL");
            }
          }}
          selectedFolder={selectedFolder}
          onFolderChange={setSelectedFolder}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          startMonth={startMonth}
          endMonth={endMonth}
          onMonthRangeChange={(s, e) => {
            setStartMonth(s);
            setEndMonth(e);
          }}
          folders={folders}
          availableYears={availableYears}
          leaderLockedService={leaderLockedService}
          availableServices={availableServices}
        />

        {error && data && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">
                Pembaruan data gagal.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Data terakhir yang berhasil dimuat tetap ditampilkan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Coba lagi
            </button>
          </div>
        )}

        {/* Loading (initial) */}
        {loading && !data && <DashboardSkeleton />}

        {/* Error */}
        {hasNoData && (
          <div className="flex flex-col items-center justify-center py-32 bg-surface rounded-2xl border border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-outfit text-lg font-bold mb-2">
              Gagal memuat data
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm text-center px-6">
              Terjadi kesalahan. Silakan coba lagi.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-6 px-6 py-2.5 rounded-lg text-sm font-medium border border-border bg-transparent hover:bg-muted transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Coba Lagi
            </button>
          </div>
        )}

        {/* No Data */}
        {hasNoPeriods && (
          <div className="flex flex-col items-center justify-center py-32 bg-surface rounded-2xl border border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-outfit text-lg font-bold mb-2">
              Data Tidak Ditemukan
            </h2>
            <p className="text-muted-foreground text-sm max-w-sm text-center px-6">
              Tidak ada rekaman QA untuk filter yang Anda pilih.
            </p>
            <button
              onClick={handleReset}
              className="mt-6 px-6 py-2.5 rounded-lg text-sm font-medium border border-border bg-transparent hover:bg-muted transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Reset Filter
            </button>
          </div>
        )}

        {data && hasSummary && (
          <div className="space-y-5">
            {loading && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2
                  aria-hidden="true"
                  className="size-4 text-foreground motion-safe:animate-spin"
                />
                Memperbarui data…
              </p>
            )}

            <section
              aria-labelledby="sidak-kpi-title"
              className="rounded-xl border border-border bg-surface-elevated"
            >
              <h2 id="sidak-kpi-title" className="sr-only">
                Indikator utama
              </h2>
              <div className="grid grid-cols-2 @[1040px]/dashboard:grid-cols-4 [&>*]:border-border [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t @[1040px]/dashboard:[&>*:nth-child(n+2)]:border-l @[1040px]/dashboard:[&>*:nth-child(n+3)]:border-t-0">
                {KPI_CARDS.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    label={kpi.label}
                    value={kpi.value}
                    delta={buildDelta(kpi.id, kpi.deltaUnit, kpi.lowerIsBetter)}
                    desc={kpi.desc}
                    sparklineData={sparklines[kpi.id]}
                  />
                ))}
              </div>
            </section>

            <SidakConditionSummary
              data={data}
              forecast={{
                status: forecastStatus,
                loading: forecastLoading,
                summary: totalForecastSummary ?? null,
                horizonMonths:
                  forecastResult?.series.total.forecast.length ?? 3,
                hasEnoughPeriods: data.paramTrend.labels.length >= 2,
                onUpdate: handleUpdateForecast,
              }}
            />

            <div className="grid items-stretch gap-5 @[1040px]/dashboard:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
              <SidakDashboardPanel
                id="sidak-trend-title"
                title="Tren temuan"
                description="Jumlah temuan per periode, maksimal dua seri sekaligus"
                busy={forecastLoading}
              >
                {!data.paramTrend || !data.paramTrend.labels?.length ? (
                  <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-border">
                    <p className="text-sm text-muted-foreground">
                      Data tren tidak tersedia untuk filter ini
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        aria-pressed={showTotalTrend}
                        disabled={!canShowTotalTrend}
                        onClick={() => {
                          if (!canShowTotalTrend) return;
                          setShowTotalTrend((prev) => !prev);
                        }}
                        className={chipClass(
                          showTotalTrend,
                          !canShowTotalTrend,
                        )}
                        title={
                          !canShowTotalTrend
                            ? "Maksimal 2 data tampil. Nonaktifkan salah satu parameter terlebih dahulu."
                            : undefined
                        }
                      >
                        Total Temuan
                      </button>
                      {data.paramTrend.datasets
                        .filter((ds) => !ds.isTotal)
                        .map((ds) => {
                          const isHidden = activeHiddenParams.has(ds.label);
                          const disableActivation =
                            isHidden && !canActivateMoreParams;
                          return (
                            <button
                              key={ds.label}
                              type="button"
                              aria-pressed={!isHidden}
                              disabled={disableActivation}
                              onClick={() => {
                                if (disableActivation) return;
                                setHiddenParams((prev) => {
                                  const next = new Set(
                                    prev ?? defaultHiddenParams,
                                  );
                                  if (next.has(ds.label)) next.delete(ds.label);
                                  else next.add(ds.label);
                                  return next;
                                });
                              }}
                              className={chipClass(
                                !isHidden,
                                disableActivation,
                              )}
                              title={
                                disableActivation
                                  ? "Maksimal 2 parameter aktif. Nonaktifkan salah satu terlebih dahulu."
                                  : undefined
                              }
                            >
                              <span className="min-w-0 text-left whitespace-normal">
                                {ds.label}
                              </span>
                            </button>
                          );
                        })}
                      <button
                        type="button"
                        onClick={() => {
                          if (visibleSeriesCount > 0) {
                            setHiddenParams(defaultHiddenParams);
                            setShowTotalTrend(false);
                            return;
                          }
                          const firstVisibleLabels = new Set(
                            (data.paramTrend.datasets ?? [])
                              .filter((dataset) => !dataset.isTotal)
                              .slice(0, maxVisibleParameters)
                              .map((dataset) => dataset.label),
                          );
                          setHiddenParams(
                            new Set(
                              (data.paramTrend.datasets ?? [])
                                .filter(
                                  (dataset) =>
                                    !dataset.isTotal &&
                                    !firstVisibleLabels.has(dataset.label),
                                )
                                .map((dataset) => dataset.label),
                            ),
                          );
                        }}
                        className="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-fg2 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
                      >
                        {visibleSeriesCount > 0
                          ? "Sembunyikan Semua"
                          : totalParameterCount > maxVisibleParameters
                            ? "Tampilkan 2 Parameter"
                            : "Tampilkan Semua"}
                      </button>
                      {hasForecastPrediction && (
                        <button
                          type="button"
                          aria-pressed={showForecastPrediction}
                          onClick={() =>
                            setShowForecastPrediction((prev) => !prev)
                          }
                          className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 text-xs font-medium text-fg2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
                        >
                          <span
                            aria-hidden="true"
                            className={`w-5 border-t-2 border-dashed ${showForecastPrediction ? "border-foreground" : "border-fg3/50"}`}
                          />
                          Garis proyeksi
                        </button>
                      )}
                    </div>
                    <div className="relative mt-4 h-[300px] w-full">
                      {forecastLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-surface-elevated/80">
                          <Loader2
                            aria-hidden="true"
                            className="size-6 text-foreground motion-safe:animate-spin"
                          />
                        </div>
                      )}
                      <ParamTrendChart
                        labels={data.paramTrend.labels}
                        datasets={data.paramTrend.datasets}
                        showParameters={true}
                        hiddenKeys={activeHiddenParams}
                        hideTotal={shouldHideTotalLine}
                        forecastResult={selectedForecastSeries}
                        forecastResults={selectedForecastSeriesList}
                      />
                    </div>
                  </>
                )}
              </SidakDashboardPanel>
              <TopAgentsTable
                agents={data.topAgents}
                serviceType={selectedService}
                selectedYear={selectedYear}
              />
            </div>

            <div className="grid items-stretch gap-5 @[880px]/dashboard:grid-cols-2">
              <SidakParameterRanking
                viewModel={paretoViewModel}
                serviceLabel={serviceLabel}
              />
              <SidakDashboardHeatmap
                year={selectedYear}
                serviceType={heatmapServiceType}
                serviceLabel={heatmapServiceLabel}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          aria-label="Kembali ke atas"
          onClick={(event) => {
            const reducedMotion = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            headingRef.current?.focus({ preventScroll: true });
            event.currentTarget
              .closest<HTMLElement>('[aria-label="Konten halaman"]')
              ?.scrollTo({
                top: 0,
                behavior: reducedMotion ? "auto" : "smooth",
              });
          }}
          className="ml-auto flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-fg2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowUp aria-hidden="true" className="size-4" />
          Kembali ke atas
        </button>
      </div>
    </div>
  );
}
