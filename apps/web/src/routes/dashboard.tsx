import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Sparkles,
  Activity,
  Users,
  BarChart3,
  Shield,
  History,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Trash2,
  PlusCircle,
  Trophy,
  UserCog,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  APP_MODULES,
  isRoleAllowed,
  normalizeRoleLabel,
} from "../lib/app-config";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MonthRangePicker } from "../components/ui/MonthRangePicker";
import { notify } from "../lib/toast";

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

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${Math.max(1, seconds)} detik yang lalu`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit yang lalu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari yang lalu`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan yang lalu`;

  const years = Math.floor(months / 12);
  return `${years} tahun yang lalu`;
}

function normalizeActionText(action: string | null | undefined): string {
  if (!action) return "";
  return action
    .replace(/QA Analyzer/gi, "SIDAK")
    .replace(/Sidak/gi, "SIDAK")
    .replace(/Profiler/gi, "KTP");
}

const getModuleColors = (moduleId: string) => {
  switch (moduleId) {
    case "ketik":
      return {
        soft: "bg-emerald-600/10 dark:bg-emerald-500/10",
        text: "text-emerald-600 dark:text-emerald-400",
      };
    case "pdkt":
      return {
        soft: "bg-sky-600/10 dark:bg-sky-500/10",
        text: "text-sky-600 dark:text-sky-400",
      };
    case "telefun":
      return {
        soft: "bg-violet-600/10 dark:bg-violet-500/10",
        text: "text-violet-600 dark:text-violet-400",
      };
    case "profiler":
      return {
        soft: "bg-amber-600/10 dark:bg-amber-500/10",
        text: "text-amber-600 dark:text-amber-400",
      };
    case "qa-analyzer":
      return {
        soft: "bg-rose-600/10 dark:bg-rose-500/10",
        text: "text-rose-600 dark:text-rose-400",
      };
    default:
      return {
        soft: "bg-indigo-600/10 dark:bg-indigo-500/10",
        text: "text-indigo-600 dark:text-indigo-400",
      };
  }
};

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const displayName = profile?.full_name || "User";
  const userRole = profile?.role?.toLowerCase() || "";

  const isManager = userRole === "admin" || userRole === "trainer";
  const isLeader = userRole === "leader";
  const isAgent = userRole === "agent";
  const showAnalytics = isManager || isLeader;

  // Filter main modules for Workspace Terpadu
  const visibleModules = APP_MODULES.filter(
    (m) =>
      ["ketik", "pdkt", "telefun", "profiler", "qa-analyzer"].includes(m.id) &&
      isRoleAllowed(userRole, m.allowedRoles),
  );

  // States
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [trendStartMonth, setTrendStartMonth] = useState<number | null>(null);
  const [trendEndMonth, setTrendEndMonth] = useState<number | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [serviceTrendMap, setServiceTrendMap] = useState<Record<
    "3m" | "6m" | "all",
    TrendData
  > | null>(null);
  const [localTrendData, setLocalTrendData] = useState<TrendData | null>(null);
  const [selectedService, setSelectedService] = useState<string>("all");

  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial Fetching
  useEffect(() => {
    async function initDashboard() {
      try {
        setTrendLoading(true);
        // Fetch available years
        const yearsRes = await fetch("/api/v1/sidak/dashboard/available-years");
        const yearsJson = await yearsRes.json();
        if (yearsJson.success) {
          setAvailableYears(yearsJson.data || []);
        }

        // Fetch default trends
        const trendRes = await fetch("/api/v1/sidak/dashboard/trend");
        const trendJson = await trendRes.json();
        if (trendJson.success) {
          setServiceTrendMap(trendJson.data.trendMap);
        }

        // Fetch logs if role allows
        if (isManager) {
          setLogsLoading(true);
          const logsRes = await fetch("/api/v1/admin/activity-logs");
          const logsJson = await logsRes.json();
          if (logsJson.success) {
            setActivityLogs(logsJson.data || []);
          }
          setLogsLoading(false);
        }
      } catch (err) {
        console.error("Init dashboard error:", err);
        setError("Gagal memuat data dashboard.");
      } finally {
        setTrendLoading(false);
      }
    }

    initDashboard();
  }, [userRole]);

  // Fetch trend by range helper
  const fetchTrendDataByRange = async (
    year: number,
    start: number | null,
    end: number | null,
  ) => {
    setTrendLoading(true);
    try {
      const startParam = start !== null ? `&startMonth=${start}` : "";
      const endParam = end !== null ? `&endMonth=${end}` : "";
      const res = await fetch(
        `/api/v1/sidak/dashboard/trend?year=${year}${startParam}${endParam}`,
      );
      const json = await res.json();
      if (json.success) {
        setLocalTrendData(json.data);
      } else {
        console.error("Failed to fetch trend:", json.error);
      }
    } catch (err) {
      console.error("Fetch trend range error:", err);
    } finally {
      setTrendLoading(false);
    }
  };

  const handleYearChange = async (year: number) => {
    setSelectedYear(year);
    setTrendStartMonth(null);
    setTrendEndMonth(null);
    await fetchTrendDataByRange(year, 1, 12);
  };

  const handleRangeChange = async (
    start: number | null,
    end: number | null,
  ) => {
    let targetStart = start;
    let targetEnd = end;

    if (targetStart === null && targetEnd !== null) targetStart = 1;
    else if (targetStart !== null && targetEnd === null)
      targetEnd = new Date().getMonth() + 1;

    setTrendStartMonth(targetStart);
    setTrendEndMonth(targetEnd);

    if (
      targetStart !== null &&
      targetEnd !== null &&
      targetEnd >= targetStart
    ) {
      await fetchTrendDataByRange(selectedYear, targetStart, targetEnd);
    } else if (targetStart === null && targetEnd === null) {
      setLocalTrendData(null);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (confirm("Hapus log aktivitas ini?")) {
      try {
        const res = await fetch(`/api/v1/admin/activity-logs/${id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (json.success) {
          const logsRes = await fetch("/api/v1/admin/activity-logs");
          const logsJson = await logsRes.json();
          if (logsJson.success) {
            setActivityLogs(logsJson.data || []);
          }
        } else {
          notify.error(json.error?.message || "Gagal menghapus log");
        }
      } catch (err) {
        console.error("Delete activity error:", err);
        notify.error("Gagal menghapus log");
      }
    }
  };

  // Derive trends variables
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

  // Management Shortcuts/Opsi
  const managementActions = [
    {
      href: "/dashboard/users",
      title: "User Management",
      description:
        "Kelola peran pengguna dan atur akses operasional setiap individu di tim Anda.",
      icon: Shield,
      allowed: isManager,
    },
    {
      href: "/monitoring",
      title: "Monitoring",
      description:
        "Pantau log aktivitas layanan secara ringkas untuk menjamin kualitas operasional berjalan konsisten.",
      icon: Activity,
      allowed: isManager || isLeader,
    },
    {
      href: "/dashboard/activities",
      title: "Activity Logs",
      description:
        "Riwayat rekam jejak untuk menelusuri aktivitas yang dilakukan pengguna kapan saja.",
      icon: History,
      allowed: isManager,
    },
  ].filter((item) => item.allowed);

  const trainerShortcuts = [
    {
      id: "qa-input",
      href: "/sidak/input",
      title: "Input Temuan",
      expandedTitle: "Input Temuan QA",
      description: "Catat hasil evaluasi QA terbaru",
      icon: PlusCircle,
      accentSoftClassName: "bg-indigo-600/10 dark:bg-indigo-500/10",
      accentClassName: "text-indigo-600 dark:text-indigo-400",
    },
    {
      id: "qa-agents",
      href: "/sidak/agents",
      title: "Analisis Individu",
      expandedTitle: "Analisis Performa Agen",
      description: "Laporan performa QA agen",
      icon: Users,
      accentSoftClassName: "bg-emerald-600/10 dark:bg-emerald-500/10",
      accentClassName: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "qa-ranking",
      href: "/sidak/ranking",
      title: "Ranking Agen",
      expandedTitle: "Papan Peringkat Agen",
      description: "Papan peringkat performa auditan",
      icon: Trophy,
      accentSoftClassName: "bg-amber-600/10 dark:bg-amber-500/10",
      accentClassName: "text-amber-600 dark:text-amber-400",
    },
    {
      id: "account",
      href: "/account",
      title: "Pengaturan Profil",
      expandedTitle: "Pengaturan Akun",
      description: "Preferensi dan keamanan akun Anda",
      icon: UserCog,
      accentSoftClassName: "bg-slate-600/10 dark:bg-slate-500/10",
      accentClassName: "text-slate-600 dark:text-slate-400",
    },
  ];

  const shortcutsToDisplay = isManager
    ? trainerShortcuts
    : visibleModules.slice(0, 4);
  const roleLabel = normalizeRoleLabel(userRole);

  const formattedLogs = activityLogs.map((act) => ({
    id: act.id,
    user: act.user_name || "Pengguna internal",
    action: normalizeActionText(act.action),
    time: formatTimeAgo(act.created_at),
    type: act.type,
  }));

  const chartColor = "var(--primary)";

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 py-8 lg:px-10 lg:py-10">
      {/* Background Radial Glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-full max-w-[1200px] -translate-x-1/2 rounded-full bg-primary/6 blur-[140px]" />

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800/30">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Hero Card */}
      <section className="overflow-hidden rounded-[2rem] border border-border/50 bg-card/40 shadow-xl shadow-black/5 backdrop-blur-xl">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left Column */}
          <div className="flex flex-col justify-center p-8 lg:p-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Pusat Kendali
            </div>
            <div className="mt-6 space-y-4">
              <h2 className="font-display text-4xl font-bold tracking-tight text-balance lg:text-5xl">
                Halo, {displayName}.
              </h2>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground lg:text-lg">
                Anda memiliki akses untuk{" "}
                {roleLabel === "Agent"
                  ? "mempelajari skenario latihan baru dan memvalidasi skor capaian bulanan secara komprehensif"
                  : "memantau tren performa layanan utama, mengevaluasi aktivitas harian staf, dan menggunakan perangkat manajemen"}{" "}
                dalam satu platform.
              </p>
            </div>

            {managementActions.length > 0 && (
              <div className="mt-10 lg:mt-12">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                  Opsi Manajerial
                </p>
                <div className="flex flex-wrap gap-3">
                  {managementActions.map((action) => (
                    <Link
                      key={action.href}
                      to={action.href}
                      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-5 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-md"
                    >
                      <action.icon className="h-4 w-4 text-primary/70" />
                      <span className="text-sm font-semibold text-foreground/90">
                        {action.title}
                      </span>
                      <ArrowRight className="h-4 w-4 text-primary/40 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="flex flex-col justify-center border-t border-border/40 bg-muted/20 p-8 lg:border-l lg:border-t-0 lg:p-12">
            <p className="mb-6 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Pintasan Modul
            </p>
            <div className="flex flex-col gap-3">
              {shortcutsToDisplay.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  to={shortcut.href}
                  className="group flex items-center gap-4 rounded-3xl border border-background/50 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background hover:shadow-sm"
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${shortcut.accentSoftClassName} ${shortcut.accentClassName}`}
                  >
                    <shortcut.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-sm font-semibold tracking-tight text-foreground/90">
                      {shortcut.title}
                    </p>
                    <p className="text-[11px] font-medium leading-4 text-muted-foreground">
                      {shortcut.expandedTitle || shortcut.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground pr-2">
                      {shortcut.description}
                    </p>
                  </div>
                  <div className="mr-2 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Workspace Modules Showcase */}
      <section className="space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            Workspace Terpadu
          </p>
          <h3 className="font-display mt-2 text-2xl font-semibold tracking-tight lg:text-[2.1rem]">
            Lebih mudah berpindah dari satu modul ke modul yang lain
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {visibleModules.map((module, idx) => {
            const colors = getModuleColors(module.id);
            return (
              <div
                key={module.id}
                className="animate-in fade-in slide-in-from-bottom-4"
                style={{
                  animationDuration: "400ms",
                  animationFillMode: "both",
                  animationDelay: `${idx * 80}ms`,
                }}
              >
                <Link
                  to={module.href}
                  className="group flex h-full flex-col rounded-[2rem] border border-border/50 bg-card/70 p-5 backdrop-blur-md transition hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg hover:shadow-black/5"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors.soft} ${colors.text}`}
                    >
                      <module.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                  <h4 className="text-lg font-semibold tracking-tight">
                    {module.title}
                  </h4>
                  <p className="mt-1 text-sm font-medium leading-5 text-muted-foreground">
                    {module.expandedTitle}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {module.description}
                  </p>
                  <div className="mt-auto pt-5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                    Buka Modul
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* QA Trend Analytics Chart Section (Only for Manager or Leader) */}
      {showAnalytics && serviceTrendMap && (
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
                      handleYearChange(Number(event.target.value))
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
                        value={new Date().getFullYear()}
                        className="bg-card text-foreground"
                      >
                        {new Date().getFullYear()}
                      </option>
                    )}
                  </select>
                </div>

                <div className="h-4 w-px bg-border/40 hidden sm:block" />

                <MonthRangePicker
                  selectedYear={selectedYear}
                  startMonth={trendStartMonth}
                  endMonth={trendEndMonth}
                  onRangeChange={handleRangeChange}
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
          <div className="rounded-[2rem] border border-primary/20 bg-primary/95 text-primary-foreground p-6 flex flex-col shadow-2xl shadow-primary/10 relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <h2 className="font-display text-lg font-bold tracking-tight mb-4 relative z-10">
              Ringkasan Performa
            </h2>
            <div className="flex-1 flex flex-col justify-center gap-4 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <Activity className="w-6 h-6" />
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
                        className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex flex-col items-start gap-0.5 min-w-[70px]"
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
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
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
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
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

              <div className="mt-2 p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
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
                <div className="mt-2 pt-4 border-t border-white/10 relative overflow-hidden">
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
      )}

      {/* Activity Logs Section (Only for Admin or Trainer) */}
      {isManager && (
        <div className="rounded-[2rem] border border-border/40 bg-card/40 backdrop-blur-sm p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">
                Aktivitas Terakhir
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Rekam jejak kegiatan operasional tim
              </p>
            </div>
            <Link
              to="/dashboard/activities"
              className="text-[10px] font-mono uppercase tracking-widest text-primary hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 transition-colors"
            >
              Lihat Semua
            </Link>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formattedLogs.length > 0 ? (
                formattedLogs.slice(0, 6).map((log) => {
                  const isLogin = log.type === "login";
                  const isEdit = log.type === "edit";
                  const isAdd = log.type === "add";

                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/30 hover:border-primary/30 transition-all group relative"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                            isLogin
                              ? "bg-blue-500/10 text-blue-500"
                              : isEdit
                                ? "bg-purple-500/10 text-purple-500"
                                : isAdd
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-orange-500/10 text-orange-500"
                          }`}
                        >
                          {isLogin ? (
                            <Users className="w-5 h-5" />
                          ) : isEdit ? (
                            <Activity className="w-5 h-5" />
                          ) : isAdd ? (
                            <Target className="w-5 h-5" />
                          ) : (
                            <Clock className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold tracking-tight">
                            {log.user}
                          </div>
                          <div className="text-xs text-foreground/50 font-light mt-0.5 leading-relaxed">
                            {log.action}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {log.time}
                        </span>
                        <button
                          onClick={() =>
                            handleDeleteActivity(log.id.toString())
                          }
                          className="p-2 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Hapus Log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full py-8 text-center text-foreground/50 text-sm border border-dashed border-border/40 rounded-2xl bg-background/30">
                  Belum ada aktivitas terbaru.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
