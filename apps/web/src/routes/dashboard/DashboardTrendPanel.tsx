import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SidakBatchForecastSnapshot,
  SidakForecastLookupStatus,
  SidakForecastLookupResult,
} from "@trainers/types";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  Target,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { MonthRangePicker } from "../../components/ui/MonthRangePicker";
import ForecastInsightPanel from "../../components/sidak/ForecastInsightPanel";
import { ForecastActionButton } from "../../components/sidak/ForecastActionButton";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";

interface TrendData {
  labels: string[];
  totalData: number[];
  serviceData: Record<string, number[]>;
  activeServices: string[];
  serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  >;
  totalSummary: {
    totalDefects: number;
    auditedAgents: number;
    activeServiceCount: number;
  };
  topParameters?: Record<string, { name: string; count: number }>;
}

const SERVICE_COLORS: Record<string, string> = {
  call: "#3B82F6",
  chat: "#10B981",
  email: "#F59E0B",
  cso: "#8B5CF6",
  pencatatan: "#EC4899",
  bko: "#06B6D4",
  slik: "#F97316",
};

const SERVICE_LABELS: Record<string, string> = {
  call: "Layanan Call",
  chat: "Layanan Chat",
  email: "Layanan Email",
  cso: "Layanan CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

const MONTH_FULL_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface DashboardTrendPanelProps {
  serviceTrendMap: Record<"3m" | "6m" | "all", TrendData>;
  availableYears: number[];
  selectedYear: number;
  trendStartMonth: number | null;
  trendEndMonth: number | null;
  trendLoading: boolean;
  localTrendData: TrendData | null;
  onYearChange: (year: number) => void;
  onRangeChange: (start: number | null, end: number | null) => void;
}

export default function DashboardTrendPanel({
  serviceTrendMap,
  availableYears,
  selectedYear,
  trendStartMonth,
  trendEndMonth,
  trendLoading,
  localTrendData,
  onYearChange,
  onRangeChange,
}: DashboardTrendPanelProps) {
  const [selectedService, setSelectedService] = useState<string>("all");
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastStatus, setForecastStatus] =
    useState<SidakForecastLookupStatus>("missing");
  const [forecastResult, setForecastResult] =
    useState<SidakBatchForecastSnapshot | null>(null);
  const [showForecastPrediction, setShowForecastPrediction] = useState(true);
  const forecastRequestId = useRef(0);

  const emptyTrend: TrendData = {
    labels: [],
    totalData: [],
    serviceData: {},
    activeServices: [],
    serviceSummary: {},
    totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
  };

  const activeTrend = localTrendData || serviceTrendMap?.all || emptyTrend;

  const forecastFilters = useMemo(
    () => ({
      year: selectedYear,
      serviceType: selectedService === "all" ? undefined : selectedService,
      startMonth: trendStartMonth ?? undefined,
      endMonth: trendEndMonth ?? undefined,
    }),
    [selectedYear, selectedService, trendStartMonth, trendEndMonth],
  );

  const requestForecast = async (options: {
    forceRefresh?: boolean;
    cacheOnly?: boolean;
  }) => {
    const requestId = ++forecastRequestId.current;
    const res = await sidakClient.dashboard.forecast.$post({
      json: {
        filters: forecastFilters,
        horizonMonths: 3,
        forceRefresh: options.forceRefresh ?? false,
        cacheOnly: options.cacheOnly ?? false,
      },
    });
    const result = (await unwrapResponse(res)) as SidakForecastLookupResult;
    if (requestId === forecastRequestId.current) {
      setForecastStatus(result.status);
      setForecastResult(result.snapshot);
    }
    return result;
  };

  const handleUpdateForecast = async () => {
    if (activeTrend.labels.length < 2) {
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
        labels: activeTrend.labels,
        data:
          selectedService === "all"
            ? activeTrend.totalData
            : (activeTrend.serviceData[selectedService] ?? []),
      }),
    [forecastFilters, activeTrend, selectedService],
  );

  useEffect(() => {
    if (activeTrend.labels.length < 2) {
      setForecastStatus("missing");
      setForecastResult(null);
      return;
    }
    setForecastStatus("missing");
    setForecastResult(null);
    void requestForecast({ cacheOnly: true }).catch((error) => {
      console.error("Forecast cache lookup error:", error);
    });
    // requestForecast intentionally derives from forecastLookupKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastLookupKey]);

  const totalForecast = forecastResult?.series.total ?? null;
  const visibleTotalForecast = showForecastPrediction ? totalForecast : null;

  useEffect(() => {
    if (!forecastResult) {
      setShowForecastPrediction(true);
    }
  }, [forecastResult]);

  const qaTrendPoints = useMemo(() => {
    const points = activeTrend.labels.map((label: string, i: number) => {
      const point: Record<string, string | number | null> = { name: label };
      if (selectedService === "all") {
        point.actual_Total = activeTrend.totalData[i];
        point.forecast_Total = null;
        Object.entries(activeTrend.serviceData).forEach(([svc, data]) => {
          const key = SERVICE_LABELS[svc] || svc;
          point[`actual_${key}`] = data[i];
          point[`forecast_${key}`] = null;
        });
      } else {
        const svcLabel = SERVICE_LABELS[selectedService] || selectedService;
        point[`actual_${svcLabel}`] =
          (activeTrend.serviceData[selectedService] || [])[i] || 0;
        point[`forecast_${svcLabel}`] = null;
      }
      return point;
    });

    if (visibleTotalForecast && points.length > 0) {
      const dataKey =
        selectedService === "all"
          ? "Total"
          : SERVICE_LABELS[selectedService] || selectedService;
      const lastHistoricalPoint = points[points.length - 1];
      lastHistoricalPoint[`forecast_${dataKey}`] =
        lastHistoricalPoint[`actual_${dataKey}`];

      const forecastPoints = visibleTotalForecast.forecast.map((f) => {
        const p: Record<string, string | number | null> = {
          name: f.label,
          isForecast: 1,
        };
        p[`actual_${dataKey}`] = null;
        p[`forecast_${dataKey}`] = f.value;
        return p;
      });
      return [...points, ...forecastPoints];
    }

    return points;
  }, [activeTrend, selectedService, visibleTotalForecast]);

  const totalFindings =
    selectedService === "all"
      ? activeTrend.totalSummary.totalDefects
      : (activeTrend.serviceSummary[selectedService]?.totalDefects ?? 0);
  const auditedAgents =
    selectedService === "all"
      ? activeTrend.totalSummary.auditedAgents
      : (activeTrend.serviceSummary[selectedService]?.auditedAgents ?? 0);
  const avgPerService =
    selectedService === "all"
      ? activeTrend.totalSummary.activeServiceCount > 0
        ? (totalFindings / activeTrend.totalSummary.activeServiceCount).toFixed(
            1,
          )
        : "0"
      : null;
  const avgPerAgent =
    auditedAgents > 0 ? (totalFindings / auditedAgents).toFixed(1) : "0";

  const trendDataPoints =
    selectedService === "all"
      ? activeTrend.totalData
      : activeTrend.serviceData[selectedService] ||
        activeTrend.labels.map(() => 0);
  const lastVal =
    trendDataPoints.length > 0
      ? trendDataPoints[trendDataPoints.length - 1]
      : 0;
  const prevVal =
    trendDataPoints.length > 1
      ? trendDataPoints[trendDataPoints.length - 2]
      : 0;
  const trendStatus =
    trendDataPoints.length < 2
      ? "Stagnan"
      : lastVal < prevVal
        ? "Membaik"
        : lastVal > prevVal
          ? "Memburuk"
          : "Stagnan";

  const timeframeLabel =
    trendStartMonth && trendEndMonth
      ? `periode ${MONTH_FULL_NAMES[trendStartMonth - 1]} - ${MONTH_FULL_NAMES[trendEndMonth - 1]} ${selectedYear}`
      : "semua periode";
  const prevTrendVal =
    trendDataPoints.length > 1
      ? trendDataPoints[trendDataPoints.length - 2]
      : null;
  const trendDelta =
    prevTrendVal !== null && prevTrendVal !== 0
      ? ((lastVal - prevTrendVal) / prevTrendVal) * 100
      : null;

  const topParameter =
    selectedService !== "all" && activeTrend.topParameters
      ? activeTrend.topParameters[selectedService]
      : null;

  const chartColor = "var(--primary)";

  const currentYear = new Date().getFullYear();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
      {/* Chart Panel */}
      <div className="lg:col-span-2 overflow-visible rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/5 text-primary rounded-lg border border-primary/10">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Tren Temuan QA
            </h2>
          </div>

          {/* Filtering Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={selectedService}
              onValueChange={(value) => setSelectedService(value || "all")}
            >
              <TabsList className="h-8 max-w-full overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger
                  value="all"
                  className="h-6 px-3 text-xs font-semibold normal-case whitespace-nowrap"
                >
                  Semua
                </TabsTrigger>
                {activeTrend.activeServices.map((svc) => (
                  <TabsTrigger
                    key={svc}
                    value={svc}
                    className="h-6 gap-1.5 px-3 text-xs font-semibold normal-case whitespace-nowrap"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{
                        backgroundColor: SERVICE_COLORS[svc] || "#ccc",
                      }}
                    />
                    {SERVICE_LABELS[svc] || svc}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Tahun:
              </span>
              <Select
                value={String(selectedYear)}
                onValueChange={(value) => {
                  if (value) onYearChange(Number(value));
                }}
              >
                <SelectTrigger
                  aria-label="Tahun tren"
                  className="h-8 w-[7rem] rounded-lg border-border bg-background text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(availableYears.length > 0
                    ? availableYears
                    : [currentYear]
                  ).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-4 w-px bg-border/40 hidden sm:block" />

            <MonthRangePicker
              selectedYear={selectedYear}
              startMonth={trendStartMonth}
              endMonth={trendEndMonth}
              onRangeChange={onRangeChange}
              variant="compact"
            />

            {forecastResult && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={showForecastPrediction}
                aria-label={
                  showForecastPrediction
                    ? "Sembunyikan Prediksi"
                    : "Tampilkan Prediksi"
                }
                onClick={() => setShowForecastPrediction((prev) => !prev)}
                className="h-8 gap-2 px-3 text-xs"
              >
                {showForecastPrediction ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {showForecastPrediction
                  ? "Sembunyikan Prediksi"
                  : "Tampilkan Prediksi"}
              </Button>
            )}

            <ForecastActionButton
              status={forecastStatus}
              loading={forecastLoading}
              disabled={forecastLoading || activeTrend.labels.length < 2}
              onClick={handleUpdateForecast}
              compact
            />
          </div>
        </div>

        <div className="h-[300px] w-full relative">
          {(trendLoading || forecastLoading) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-card/80">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {activeTrend.labels.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={qaTrendPoints}>
                <defs>
                  <linearGradient
                    id="colorFindings"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={chartColor}
                      stopOpacity={0.3}
                    />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  opacity={0.1}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fill: "currentColor",
                    opacity: 0.4,
                    fontWeight: 700,
                  }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fill: "currentColor",
                    opacity: 0.4,
                    fontWeight: 700,
                  }}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    color: "var(--foreground)",
                  }}
                  itemStyle={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    paddingTop: "2px",
                    paddingBottom: "2px",
                  }}
                  wrapperStyle={{ zIndex: 30 }}
                  formatter={(value: any, name: any, props: any) => {
                    const isForecastSeries = String(props.dataKey).startsWith(
                      "forecast_",
                    );
                    const isForecast = props.payload.isForecast === 1;
                    if (isForecastSeries && !isForecast) return null;
                    return [
                      <span key="val" className="flex items-center gap-1.5">
                        {value}{" "}
                        {isForecast && (
                          <span className="text-[9px] px-1 py-0.5 bg-primary/20 text-primary rounded">
                            Prediksi
                          </span>
                        )}
                      </span>,
                      name,
                    ];
                  }}
                />

                {/* Transition line between Actual and Forecast */}
                {visibleTotalForecast && (
                  <ReferenceLine
                    x={activeTrend.labels[activeTrend.labels.length - 1]}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    label={{
                      value: "PREDIKSI",
                      position: "top",
                      fill: "var(--primary)",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  />
                )}

                {selectedService === "all" && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="actual_Total"
                      name="Total Temuan"
                      stroke={chartColor}
                      fillOpacity={1}
                      fill="url(#colorFindings)"
                      strokeWidth={4}
                      animationDuration={1200}
                      dot={{
                        r: 4,
                        fill: "var(--card)",
                        strokeWidth: 2,
                        stroke: chartColor,
                      }}
                      activeDot={{ r: 6, fill: chartColor, strokeWidth: 0 }}
                    />
                    {visibleTotalForecast && (
                      <Area
                        type="monotone"
                        dataKey="forecast_Total"
                        name="Prediksi Total"
                        stroke={chartColor}
                        fill="transparent"
                        strokeWidth={4}
                        strokeDasharray="5 5"
                        animationDuration={1200}
                        dot={{
                          r: 3,
                          fill: "var(--card)",
                          strokeWidth: 1,
                          stroke: chartColor,
                        }}
                        activeDot={{ r: 5, fill: chartColor, strokeWidth: 0 }}
                      />
                    )}
                  </>
                )}

                {Object.entries(SERVICE_COLORS).map(([svc, color]) => {
                  const label = SERVICE_LABELS[svc] || svc;
                  const isSelected = selectedService === svc;
                  const shouldShow = selectedService === "all" || isSelected;

                  if (!shouldShow || !activeTrend.serviceData[svc]) return null;

                  return (
                    <g key={svc}>
                      <Area
                        type="monotone"
                        dataKey={`actual_${label}`}
                        name={label}
                        stroke={color}
                        fill={color}
                        fillOpacity={isSelected ? 0.3 : 0}
                        strokeWidth={isSelected ? 4 : 2}
                        dot={
                          isSelected
                            ? {
                                r: 4,
                                fill: "var(--card)",
                                strokeWidth: 2,
                                stroke: color,
                              }
                            : false
                        }
                        activeDot={{ r: 6, fill: color, strokeWidth: 0 }}
                        animationDuration={900}
                      />
                      {isSelected && visibleTotalForecast && (
                        <Area
                          type="monotone"
                          dataKey={`forecast_${label}`}
                          name={`Prediksi ${label}`}
                          stroke={color}
                          fill="transparent"
                          strokeWidth={4}
                          strokeDasharray="5 5"
                          dot={{
                            r: 3,
                            fill: "var(--card)",
                            strokeWidth: 1,
                            stroke: color,
                          }}
                          animationDuration={900}
                        />
                      )}
                    </g>
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
              Tidak ada data untuk periode ini.
            </div>
          )}
        </div>

        {showForecastPrediction && forecastResult && totalForecast && (
          <ForecastInsightPanel
            forecastResult={forecastResult}
            summary={totalForecast.summary}
            horizonMonths={totalForecast.forecast.length}
          />
        )}
      </div>

      {/* Performance Summary Panel */}
      <Card className="flex flex-col overflow-hidden border-border bg-surface-sunken p-6 text-fg animate-in fade-in slide-in-from-bottom-8 duration-700">
        <h2 className="mb-4 font-display text-lg font-bold tracking-tight text-fg">
          Ringkasan Performa
        </h2>
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">
                  Total Temuan
                </div>
                {trendDelta !== null && (
                  <Badge
                    variant="outline"
                    className={`h-7 gap-0.5 px-1.5 text-[10px] font-bold ${trendDelta <= 0 ? "border-chart-green/30 bg-chart-green/10 text-chart-green" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
                  >
                    {trendDelta <= 0 ? (
                      <TrendingDown aria-hidden="true" />
                    ) : (
                      <TrendingUp aria-hidden="true" />
                    )}
                    {Math.abs(Math.round(trendDelta))}%
                  </Badge>
                )}
              </div>
              <div className="text-4xl font-bold tracking-tight">
                {totalFindings}
              </div>
            </div>
          </div>

          {selectedService === "all" && (
            <div className="flex flex-wrap gap-2 pt-2 pb-4">
              {Object.entries(activeTrend.serviceSummary).map(
                ([svc, stats]) => (
                  <div
                    key={svc}
                    className="flex min-w-[70px] flex-col items-start gap-0.5 rounded-xl border border-border bg-surface/50 px-3 py-1.5"
                  >
                    <span className="text-[8px] uppercase tracking-tighter opacity-60 font-bold">
                      {SERVICE_LABELS[svc] || svc}
                    </span>
                    <span className="text-xs font-bold leading-none">
                      {(stats as { totalDefects: number }).totalDefects}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          {selectedService === "all" && (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">
                  Rata-rata / Layanan
                </div>
                <div className="text-4xl font-bold tracking-tight">
                  {avgPerService}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">
                Rata-rata / Agent
              </div>
              <div className="text-4xl font-bold tracking-tight">
                {avgPerAgent}
              </div>
            </div>
          </div>

          <div className="mt-2 p-4 rounded-2xl bg-surface/50 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium opacity-80">
                Status Saat Ini
              </span>
              <TrendingUp className="w-4 h-4 opacity-80" />
            </div>
            <div className="text-xl font-bold">{trendStatus}</div>
            <div className="text-[10px] opacity-60 mt-1">
              Berdasarkan data {timeframeLabel}
            </div>
          </div>

          {topParameter && (
            <div className="relative mt-2 overflow-hidden border-t border-border pt-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center border border-amber-400/20 shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mb-0.5">
                    Top Finding Issue
                  </div>
                  <div className="text-sm font-semibold leading-snug line-clamp-2 pr-2">
                    {topParameter.name}
                  </div>
                  <div className="text-[10px] opacity-60 mt-1 font-mono">
                    {topParameter.count} temuan terdeteksi
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
