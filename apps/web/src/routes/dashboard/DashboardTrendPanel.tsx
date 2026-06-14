import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  Target,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MonthRangePicker } from "../../components/ui/MonthRangePicker";

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

  const emptyTrend: TrendData = {
    labels: [],
    totalData: [],
    serviceData: {},
    activeServices: [],
    serviceSummary: {},
    totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
  };

  const activeTrend = localTrendData || serviceTrendMap?.all || emptyTrend;

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

  const qaTrendPoints = activeTrend.labels.map((label: string, i: number) => {
    const point: Record<string, string | number> = { name: label };
    if (selectedService === "all") {
      point.Total = activeTrend.totalData[i];
      Object.entries(activeTrend.serviceData).forEach(([svc, data]) => {
        point[SERVICE_LABELS[svc] || svc] = data[i];
      });
    } else {
      const svcLabel = SERVICE_LABELS[selectedService] || selectedService;
      point[svcLabel] =
        (activeTrend.serviceData[selectedService] || [])[i] || 0;
    }
    return point;
  });

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
      <div className="lg:col-span-2 rounded-[2rem] border border-border/40 bg-card/30 backdrop-blur-sm p-8 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-background/50 border border-border/40 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSelectedService("all")}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  selectedService === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-foreground/5 text-foreground/50"
                }`}
              >
                Semua
              </button>
              {activeTrend.activeServices.map((svc) => (
                <button
                  key={svc}
                  onClick={() =>
                    setSelectedService(
                      selectedService === svc ? "all" : svc,
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                    selectedService === svc
                      ? "bg-foreground/10 text-foreground shadow-sm"
                      : "hover:bg-foreground/5 text-foreground/50"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: SERVICE_COLORS[svc] || "#ccc",
                    }}
                  />
                  {SERVICE_LABELS[svc] || svc}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-background/50 border border-border/40 rounded-xl px-3 py-1.5 gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Tahun:
              </span>
              <select
                value={selectedYear}
                onChange={(event) =>
                  onYearChange(Number(event.target.value))
                }
                className="bg-transparent text-[9px] font-black uppercase tracking-widest focus:outline-none cursor-pointer"
              >
                {availableYears.length > 0 ? (
                  availableYears.map((year) => (
                    <option
                      key={year}
                      value={year}
                      className="bg-card text-foreground"
                    >
                      {year}
                    </option>
                  ))
                ) : (
                  <option
                    value={currentYear}
                    className="bg-card text-foreground"
                  >
                    {currentYear}
                  </option>
                )}
              </select>
            </div>

            <div className="h-4 w-px bg-border/40 hidden sm:block" />

            <MonthRangePicker
              selectedYear={selectedYear}
              startMonth={trendStartMonth}
              endMonth={trendEndMonth}
              onRangeChange={onRangeChange}
              className="mb-0 !gap-0"
            />
          </div>
        </div>

        <div className="h-[300px] w-full relative">
          {trendLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/50 backdrop-blur-[1px] rounded-2xl">
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
                    <stop
                      offset="95%"
                      stopColor={chartColor}
                      stopOpacity={0}
                    />
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
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    color: "var(--foreground)",
                  }}
                />

                {selectedService === "all" && (
                  <Area
                    type="monotone"
                    dataKey="Total"
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
                )}

                {Object.entries(SERVICE_COLORS).map(([svc, color]) => {
                  const label = SERVICE_LABELS[svc] || svc;
                  const isSelected = selectedService === svc;
                  const shouldShow =
                    selectedService === "all" || isSelected;

                  if (!shouldShow || !activeTrend.serviceData[svc])
                    return null;

                  return (
                    <Area
                      key={svc}
                      type="monotone"
                      dataKey={label}
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
      </div>

      {/* Performance Summary Panel */}
      <div className="rounded-[2rem] border border-border bg-surface-sunken text-fg p-6 flex flex-col shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <h2 className="font-display text-lg font-bold tracking-tight mb-4 relative z-10 text-fg">
          Ringkasan Performa
        </h2>
        <div className="flex-1 flex flex-col justify-center gap-4 relative z-10">
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
                  <div
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${trendDelta <= 0 ? "bg-emerald-400/20 text-emerald-400" : "bg-rose-400/20 text-rose-400"}`}
                  >
                    {trendDelta <= 0 ? (
                      <TrendingDown className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingUp className="w-2.5 h-2.5" />
                    )}
                    {Math.abs(Math.round(trendDelta))}%
                  </div>
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
                    className="px-3 py-1.5 rounded-xl bg-surface/50 border border-border flex flex-col items-start gap-0.5 min-w-[70px]"
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
            <div className="mt-2 pt-4 border-t border-border relative overflow-hidden">
              <div className="flex items-start gap-3 relative z-10">
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
      </div>
    </div>
  );
}
