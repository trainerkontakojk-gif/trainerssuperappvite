import { useState, useMemo, useCallback, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import type { DashboardData } from "@trainers/types";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  AlertTriangle,
  LineChart,
  ArrowRight,
  PieChart,
  Search,
  Target,
  Sparkles,
  ArrowUp,
} from "lucide-react";
import KpiCard from "../../components/sidak/KpiCard";
import { buildKpiDelta } from "../../lib/sidak-kpi-delta";
import { SERVICE_LABELS } from "../../lib/scoring";
import { buildParetoViewModel } from "../../components/sidak/pareto-view-model";
import ParamTrendChart from "../../components/sidak/ParamTrendChart";
import ParetoChart from "../../components/sidak/ParetoChart";
import FatalDonutChart from "../../components/sidak/FatalDonutChart";
import TopAgentsTable from "../../components/sidak/TopAgentsTable";
import DashboardFilters from "../../components/sidak/DashboardFilters";

function DashboardSkeleton() {
  return (
    <div
      data-testid="sidak-dashboard-skeleton"
      className="space-y-6 animate-pulse"
    >
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="h-[120px] rounded-xl bg-muted/40" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[286px] rounded-2xl border border-border bg-surface p-6"
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
  const [selectedService, setSelectedService] = useState("call");
  const [selectedFolder, setSelectedFolder] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState<number | null>(1);
  const [endMonth, setEndMonth] = useState<number | null>(
    new Date().getMonth() + 1,
  );
  const [hiddenParams, setHiddenParams] = useState<Set<string> | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(selectedYear));
    p.set("service_type", selectedService);
    if (selectedFolder !== "ALL") p.set("folder_ids", selectedFolder);
    if (startMonth !== null) p.set("startMonth", String(startMonth));
    if (endMonth !== null) p.set("endMonth", String(endMonth));
    return p.toString();
  }, [selectedService, selectedFolder, selectedYear, startMonth, endMonth]);

  const { data, loading, refetch } = useApi<DashboardData>(
    `/sidak/dashboard?${queryParams}`,
  );

  const availableServices = data?.availableServices ?? [];
  const availableYears = data?.availableYears ?? [new Date().getFullYear()];
  const folders = (data?.folders ?? []).map((f: any) => ({
    id: f.id ?? "",
    nama: f.name ?? f.nama ?? "",
  }));

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
    if (selectedFolder !== "ALL" && folders.length > 0) {
      const valid = folders.some((f) => f.id === selectedFolder);
      if (!valid) setSelectedFolder("ALL");
    }
  }, [folders, selectedFolder, loading, data]);

  // Compute leader locked service
  const leaderLockedService = useMemo(() => {
    if (availableServices.length === 1) return availableServices[0];
    return null;
  }, [availableServices]);

  const paramTrendDatasets = data?.paramTrend?.datasets;
  const defaultHiddenParams = useMemo(() => {
    const next = new Set<string>();
    for (const ds of paramTrendDatasets ?? []) {
      if (!ds.isTotal) next.add(ds.label);
    }
    return next;
  }, [paramTrendDatasets]);

  const activeHiddenParams = hiddenParams ?? defaultHiddenParams;

  const isAllShown = activeHiddenParams.size === 0;

  const hasVisibleParam =
    data?.paramTrend?.datasets?.some(
      (ds) => !ds.isTotal && !activeHiddenParams.has(ds.label),
    ) ?? false;

  useEffect(() => {
    setHiddenParams(null);
  }, [queryParams]);

  const handleReset = useCallback(() => {
    setSelectedService("call");
    setSelectedFolder("ALL");
    setSelectedYear(new Date().getFullYear());
    setStartMonth(1);
    setEndMonth(new Date().getMonth() + 1);
    setHiddenParams(null);
  }, []);

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
      icon: Search,
      color: "orange" as const,
      desc: "Kumulatif temuan parameter",
      deltaUnit: "relative-percent" as const,
      lowerIsBetter: true,
    },
    {
      id: "avg-defects",
      label: "Rata-rata Temuan per Agen",
      value: (summary?.avgDefectsPerAudit ?? 0).toFixed(1),
      icon: Target,
      color: "red" as const,
      desc: "Rasio temuan / sesi audit",
      deltaUnit: "relative-percent" as const,
      lowerIsBetter: true,
    },
    {
      id: "avg-score",
      label: "Rata-rata Skor",
      value: `${(summary?.avgAgentScore ?? 0).toFixed(1)}%`,
      icon: BarChart3,
      color: "blue" as const,
      desc: "Kualitas performa rata-rata",
      deltaUnit: "percentage-point" as const,
      lowerIsBetter: false,
    },
    {
      id: "compliance",
      label: complianceLabel,
      value: `${(summary?.complianceRate ?? 0).toFixed(1)}%`,
      icon: Sparkles,
      color: "emerald" as const,
      desc:
        startMonth !== endMonth
          ? `${Math.round(summary?.complianceCount ?? 0)} agen dengan skor ≥ 95 (rata-rata per bulan)`
          : `${summary?.complianceCount ?? 0} agen dengan skor ≥ 95`,
      deltaUnit: "percentage-point" as const,
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="bg-background min-h-full overflow-x-hidden">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        {/* Filter Bar */}
        <DashboardFilters
          selectedService={selectedService}
          onServiceChange={setSelectedService}
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

        {/* Loading (initial) */}
        {loading && !data && <DashboardSkeleton />}

        {/* Error */}
        {hasNoData && (
          <div className="flex flex-col items-center justify-center py-32 bg-surface rounded-2xl border border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-outfit text-lg font-bold mb-2">Gagal memuat data</h2>
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
            <h2 className="font-outfit text-lg font-bold mb-2">Data Tidak Ditemukan</h2>
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
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Loading overlay during re-fetch */}
            {loading && data && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Memperbarui data...
                </span>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {KPI_CARDS.map((kpi) => (
                <KpiCard
                  key={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  color={kpi.color}
                  delta={buildDelta(kpi.id, kpi.deltaUnit, kpi.lowerIsBetter)}
                  desc={kpi.desc}
                  sparklineData={sparklines[kpi.id]}
                />
              ))}
            </div>

            {/* Top Agents & Severity Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
              {/* Top Agents (2/3 span) */}
              <div className="lg:col-span-2">
                <div className="bg-surface p-4 rounded-2xl border border-border h-full">
                  <TopAgentsTable
                    agents={data.topAgents.slice(0, 5)}
                    serviceType={selectedService}
                    selectedYear={selectedYear}
                  />
                </div>
              </div>
              {/* Severity Donut (1/3 span) */}
              <div className="bg-surface p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-3 mb-6">
                  <PieChart className="w-5 h-5 shrink-0 text-muted-foreground" />
                  <div>
                    <h3 className="font-outfit text-base font-bold text-foreground">
                      Komposisi Severity
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Parameter Kritikal vs Non-Kritikal
                    </p>
                  </div>
                </div>
                {data.donutData && data.donutData.total > 0 ? (
                  <FatalDonutChart
                    critical={data.donutData.critical}
                    nonCritical={data.donutData.nonCritical}
                    total={data.donutData.total}
                  />
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 grayscale opacity-60">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <PieChart className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Belum Ada Data
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Workspace (Full Width Stack) */}
            <div className="space-y-6 lg:space-y-8">
              {/* Trend Section */}
              <div className="bg-surface p-4 rounded-2xl border border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <LineChart className="w-5 h-5 shrink-0 text-muted-foreground" />
                    <div>
                      <h2 className="font-outfit text-lg font-bold">
                        Tren Kualitas & Parameter
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Fluktuasi temuan berdasarkan parameter QA
                      </p>
                    </div>
                  </div>
                </div>

                {!data.paramTrend || !data.paramTrend.labels?.length ? (
                  <div className="h-[400px] flex flex-col items-center justify-center bg-muted/20 rounded-xl border border-dashed">
                    <p className="text-sm text-muted-foreground font-medium">
                      Data tren tidak tersedia untuk filter ini
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 pb-2">
                      <span className="text-[11px] font-semibold text-muted-foreground mr-2 uppercase tracking-wide">
                        Parameter:
                      </span>
                      {data.paramTrend.datasets
                        .filter((ds) => !ds.isTotal)
                        .map((ds) => {
                          const isHidden = activeHiddenParams.has(ds.label);
                          return (
                            <button
                              key={ds.label}
                              onClick={() => {
                                setHiddenParams((prev) => {
                                  const next = new Set(
                                    prev ?? defaultHiddenParams,
                                  );
                                  if (next.has(ds.label))
                                    next.delete(ds.label);
                                  else next.add(ds.label);
                                  return next;
                                  });
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                                isHidden
                                  ? "bg-transparent border-border/60 text-muted-foreground hover:bg-muted"
                                  : "bg-foreground text-background border-foreground scale-105 z-10"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${isHidden ? "bg-muted-foreground/30" : "bg-background"}`}
                              />
                              <span className="max-w-[120px] truncate">
                                {ds.label}
                              </span>
                            </button>
                          );
                        })}
                      <button
                        onClick={() =>
                          setHiddenParams(isAllShown ? null : new Set())
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-primary hover:bg-primary/5 transition-colors uppercase tracking-widest ml-auto"
                      >
                        {isAllShown ? "Sembunyikan Semua" : "Tampilkan Semua"}{" "}
                        <ArrowRight
                          className={`w-3 h-3 transition-transform duration-200 ${isAllShown ? "rotate-90" : ""}`}
                        />
                      </button>
                    </div>
                    <div className="h-[360px] w-full mt-2">
                      <ParamTrendChart
                        labels={data.paramTrend.labels}
                        datasets={data.paramTrend.datasets}
                        showParameters={true}
                        hiddenKeys={activeHiddenParams}
                        hideTotal={hasVisibleParam}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Pareto */}
              <div className="bg-surface p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-3 mb-6">
                  <BarChart3 className="w-5 h-5 shrink-0 text-muted-foreground" />
                  <div>
                    <h2 className="font-outfit text-lg font-bold text-foreground">Root Cause Analysis</h2>
                    <p className="text-sm text-muted-foreground">
                      Prinsip Pareto: 80% temuan biasanya berasal dari 20%
                      kategori utama
                    </p>
                  </div>
                </div>
                {paretoViewModel.chartData.length > 0 ? (
                  <ParetoChart
                    data={paretoViewModel.chartData}
                    insight={paretoViewModel.insight}
                    serviceLabel={
                      SERVICE_LABELS[
                        selectedService as keyof typeof SERVICE_LABELS
                      ] || selectedService
                    }
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center bg-muted/20 rounded-xl border border-dashed">
                    <p className="text-sm text-muted-foreground font-medium">
                      Data kategori temuan belum tersedia
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-[100] md:hidden w-14 h-14 rounded-2xl bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-all"
      >
        <ArrowUp className="w-6 h-6" />
      </button>
    </div>
  );
}
