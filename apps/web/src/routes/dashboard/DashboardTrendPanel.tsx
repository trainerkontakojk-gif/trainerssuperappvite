import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SidakBatchForecastSnapshot,
  SidakForecastLookupStatus,
  SidakForecastLookupResult,
} from "@trainers/types";
import { TrendingUp, TrendingDown, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
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
import { cn } from "cn";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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

  const legendItems: {
    key: string;
    label: string;
    color: string;
    dashed?: boolean;
  }[] = [];
  if (selectedService === "all") {
    legendItems.push({
      key: "total",
      label: "Total Temuan",
      color: chartColor,
    });
    Object.entries(SERVICE_COLORS).forEach(([svc, color]) => {
      if (activeTrend.serviceData[svc]) {
        legendItems.push({ key: svc, label: SERVICE_LABELS[svc] || svc, color });
      }
    });
  } else {
    legendItems.push({
      key: selectedService,
      label: SERVICE_LABELS[selectedService] || selectedService,
      color: SERVICE_COLORS[selectedService] || chartColor,
    });
  }
  if (visibleTotalForecast) {
    legendItems.push({
      key: "forecast",
      label:
        selectedService === "all"
          ? "Prediksi Total"
          : `Prediksi ${SERVICE_LABELS[selectedService] || selectedService}`,
      color: chartColor,
      dashed: true,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Chart and controls */}
      <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/5 text-primary rounded-lg border border-primary/10">
              <TrendingUp aria-hidden="true" className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Tren Temuan QA
            </h2>
          </div>

          {/* Forecast controls */}
          <div className="flex flex-wrap items-center gap-2">
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
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
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

        {/* Filtering Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Layanan
            </span>
            <Tabs
              value={selectedService}
              onValueChange={(value) => setSelectedService(value || "all")}
            >
              <TabsList className="h-auto w-full max-w-full flex-wrap overflow-visible p-1">
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
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Tahun
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

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Rentang bulan
              </span>
              <MonthRangePicker
                selectedYear={selectedYear}
                startMonth={trendStartMonth}
                endMonth={trendEndMonth}
                onRangeChange={onRangeChange}
                variant="compact"
              />
            </div>
          </div>
        </div>

        <div className="relative h-[300px] w-full">
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
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                    fontWeight: 700,
                  }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
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
                          <span className="text-xs px-1 py-0.5 bg-primary/20 text-primary rounded">
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
                      fontSize: 11,
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

        {legendItems.length > 0 && activeTrend.labels.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {legendItems.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-1.5 text-xs text-fg2"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-block w-4 shrink-0 border-t-2",
                    item.dashed && "border-dashed",
                  )}
                  style={{ borderColor: item.color }}
                />
                <span>{item.label}</span>
                {item.dashed && (
                  <span className="text-muted-foreground">(prediksi)</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {showForecastPrediction && forecastResult && totalForecast && (
          <ForecastInsightPanel
            forecastResult={forecastResult}
            summary={totalForecast.summary}
            horizonMonths={totalForecast.forecast.length}
          />
        )}
      </div>

      {/* Performance Summary Panel */}
      <section
        aria-labelledby="trend-summary-title"
        className="flex min-w-0 flex-col gap-4 lg:col-span-1 lg:border-l lg:border-border lg:pl-6"
      >
        <h2
          id="trend-summary-title"
          className="font-display text-base font-bold tracking-tight text-fg"
        >
          Ringkasan Performa
        </h2>

        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Total Temuan
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-fg">
              {totalFindings}
            </p>
          </div>
          {trendDelta !== null && (
            <Badge
              variant="outline"
              className={`h-7 gap-0.5 px-1.5 text-xs font-bold ${trendDelta <= 0 ? "border-chart-green/30 bg-chart-green/10 text-chart-green" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
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

        <dl className="flex flex-col border-y border-border">
          {selectedService === "all" && (
            <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
              <dt className="text-xs text-fg2">Rata-rata / Layanan</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">
                {avgPerService}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
            <dt className="text-xs text-fg2">Rata-rata / Agent</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">
              {avgPerAgent}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-xs text-fg2">Status Saat Ini</dt>
            <dd className="text-sm font-semibold text-fg">{trendStatus}</dd>
          </div>
        </dl>
        <p className="-mt-1 text-xs text-muted-foreground">
          Berdasarkan data {timeframeLabel}
        </p>

        {selectedService === "all" && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">
              Temuan per layanan
            </h3>
            <dl className="flex flex-col divide-y divide-border/70">
              {Object.entries(activeTrend.serviceSummary).map(
                ([svc, stats]) => (
                  <div
                    key={svc}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <dt className="min-w-0 truncate text-xs text-fg2">
                      {SERVICE_LABELS[svc] || svc}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-fg">
                      {(stats as { totalDefects: number }).totalDefects}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </div>
        )}

        {topParameter && (
          <div className="flex items-start gap-2.5 border-t border-border pt-3">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Top Finding Issue
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-fg">
                {topParameter.name}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {topParameter.count} temuan terdeteksi
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
