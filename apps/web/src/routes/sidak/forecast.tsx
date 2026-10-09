import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  DashboardData,
  SidakAgentForecastResponse,
  SidakForecastLookupResult,
} from "@trainers/types";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import ParamTrendChart from "../../components/sidak/ParamTrendChart";
import ForecastInsightPanel from "../../components/sidak/ForecastInsightPanel";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import ForecastFilterBar from "../../components/sidak/forecast/ForecastFilterBar";
import ForecastLane from "../../components/sidak/forecast/ForecastLane";
import ForecastSummary from "../../components/sidak/forecast/ForecastSummary";
import SeriesControls from "../../components/sidak/forecast/SeriesControls";
import { useForecastSeries } from "../../components/sidak/forecast/useForecastSeries";
import { DEFAULT_SERVICE_FOLDER_MAP } from "../../lib/scoring";
import {
  findPrimarySidakFolderByName,
  normalizeSidakFolderOptions,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";
import {
  normalizeAvailableServices,
  safeLabel,
  toPeriodQueryParts,
} from "../../utils/forecastFormat";

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
  const series = useForecastSeries({
    datasets: data?.paramTrend.datasets,
    snapshot: serviceForecastSnapshot,
    resetKey: dashboardQuery,
  });
  const {
    showTotalTrend,
    showForecastPrediction,
    serviceTrendDatasets,
    serviceParameterDatasets,
    activeHiddenParams,
    canActivateMoreParams,
    visibleServiceForecastResults,
  } = series;

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
        setAgentForecastError(e?.message ?? "Gagal memuat forecast agen.");
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
  const agentSummary = agentForecastResult?.summary;
  const hasAgentForecast = (agentSummary?.totalEligible ?? 0) > 0;
  const onlyWatchlist =
    hasAgentForecast &&
    (agentSummary?.improvingCount ?? 0) +
      (agentSummary?.decliningCount ?? 0) +
      (agentSummary?.stableCount ?? 0) ===
      0 &&
    (agentSummary?.watchlistCount ?? 0) > 0;
  const isRefreshing = serviceForecastLoading || agentForecastLoading;

  const handleServiceChange = (value: string) => {
    const nextFolderName = DEFAULT_SERVICE_FOLDER_MAP[value] ?? null;
    const matchedFolder = findPrimarySidakFolderByName(folders, nextFolderName);
    setSelectedService(value);
    setSelectedFolder(matchedFolder?.id ?? "ALL");
    initialFolderSetRef.current = Boolean(matchedFolder);
  };

  const hasHistory =
    (data?.paramTrend.labels?.length ?? 0) >= 2 && Boolean(activeTotalDataset);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Forecast
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Lihat proyeksi layanan dan tentukan agen yang perlu diprioritaskan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-[44px] w-full sm:w-auto"
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
        </header>

        <ForecastFilterBar
          selectedService={selectedService}
          onServiceChange={handleServiceChange}
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
          horizon={selectedHorizon}
          onHorizonChange={setSelectedHorizon}
        />

        <section
          aria-labelledby="forecast-trend-title"
          className="border-y border-border py-4 sm:py-5"
        >
          <header>
            <h2
              id="forecast-trend-title"
              className="font-heading text-base font-semibold tracking-tight text-foreground"
            >
              Tren layanan
            </h2>
            <ForecastSummary
              lookup={serviceForecastLookup}
              horizonMonths={selectedHorizon}
            />
          </header>

          <div className="flex flex-col gap-4 pt-4">
            {hasHistory ? (
              <SeriesControls
                showTotal={showTotalTrend}
                canShowTotal={series.canShowTotalTrend}
                onToggleTotal={series.toggleTotal}
                parameterLabels={serviceParameterDatasets.map(
                  (dataset) => dataset.label,
                )}
                hiddenParams={activeHiddenParams}
                canActivateMore={canActivateMoreParams}
                limitReached={series.limitReached}
                onToggleParameter={series.toggleParameter}
                showPredictionToggle={Boolean(serviceForecastSnapshot)}
                showPrediction={showForecastPrediction}
                onTogglePrediction={series.togglePrediction}
              />
            ) : null}

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
                    className="h-[44px]"
                  >
                    <RefreshCw data-icon="inline-start" aria-hidden="true" />
                    Coba lagi
                  </Button>
                }
              />
            ) : !hasHistory ? (
              <QaStatePanel
                type="empty"
                title="Data historis minimal 2 periode diperlukan."
                description="Proyeksi layanan belum bisa dihitung untuk filter ini."
              />
            ) : serviceForecastLoading && !serviceForecastLookup ? (
              <div
                className="flex flex-col gap-3"
                aria-label="Memuat grafik forecast"
              >
                <Skeleton className="h-[320px] rounded-lg motion-reduce:animate-none" />
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
                    hideTotal={!showTotalTrend}
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
          <header>
            <h2
              id="forecast-agent-title"
              className="font-heading text-base font-semibold tracking-tight text-foreground"
            >
              Prioritas agen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {agentSummary
                ? `${agentSummary.totalEligible} agen siap diproyeksikan · periode ${selectedHorizon} bulan`
                : `Agen dikelompokkan berdasarkan arah tren · periode ${selectedHorizon} bulan`}
            </p>
          </header>

          <div className="pt-4">
            {agentForecastLoading && !agentForecastResult ? (
              <QaStatePanel
                type="loading"
                title="Memproses proyeksi agen"
                description="Menghitung regresi skor, temuan, dan critical findings per agen."
              />
            ) : agentForecastError ? (
              <QaStatePanel
                type="error"
                title="Forecast agen gagal dimuat"
                description={agentForecastError}
              />
            ) : onlyWatchlist ? (
              <QaStatePanel
                type="empty"
                title="Belum cukup periode audit untuk memproyeksikan agen."
                description="Semua agen saat ini masuk Pantauan karena jumlah periode yang tersedia masih terlalu sedikit."
              />
            ) : (
              <div
                data-testid="forecast-agent-board"
                className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border"
              >
                <ForecastLane
                  status="improving"
                  entries={improvementLane}
                  emptyMessage="Belum ada agen yang diproyeksikan membaik."
                  showAgentContext={showAgentContext}
                />
                <ForecastLane
                  status="declining"
                  entries={decliningLane}
                  emptyMessage="Belum ada agen yang diproyeksikan memburuk."
                  showAgentContext={showAgentContext}
                />
                <ForecastLane
                  status="stable"
                  entries={stableLane}
                  emptyMessage="Belum ada agen yang stabil/stagnan pada filter ini."
                  showAgentContext={showAgentContext}
                />
                <ForecastLane
                  status="watchlist"
                  entries={watchlistLane}
                  emptyMessage="Belum ada agen Pantauan."
                  showAgentContext={showAgentContext}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
