import { useState, useEffect, lazy, Suspense } from "react";
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
import { useTelefunWarning } from "../context/TelefunWarningContext";
import {
  APP_MODULES,
  isRoleAllowed,
  normalizeRoleLabel,
} from "../lib/app-config";
import { notify } from "../lib/toast";
import { sidakClient, adminClient, unwrapResponse } from "../lib/api";
import { FadeIn, StaggerList, StaggerItem } from "../components/motion";

const DashboardTrendPanel = lazy(
  () => import("./dashboard/DashboardTrendPanel"),
);

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
  const { hasTelefunAccess, openMaintenance } = useTelefunWarning();
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

  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial Fetching
  useEffect(() => {
    async function initDashboard() {
      setTrendLoading(true);

      try { const years = await (unwrapResponse(await sidakClient.dashboard["available-years"].$get()) as any); setAvailableYears(years || []); } catch (_) { /* degrade gracefully */ }
      try { const trends = await (unwrapResponse(await sidakClient.dashboard.trend.$get()) as any); setServiceTrendMap(trends.trendMap); } catch (_) { /* degrade gracefully */ }

      if (isManager) {
        setLogsLoading(true);
        try { const logs = await (unwrapResponse(await (adminClient["activity-logs"] as any).$get()) as any); setActivityLogs(logs || []); } catch (_) { /* degrade gracefully */ }
        setLogsLoading(false);
      }

      setTrendLoading(false);
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
      const data = await unwrapResponse(await sidakClient.dashboard.trend.$get({
        query: {
          year: String(year),
          ...(start !== null ? { startMonth: String(start) } : {}),
          ...(end !== null ? { endMonth: String(end) } : {}),
        },
      }));
      setLocalTrendData(data as any);
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
        await unwrapResponse(await (adminClient["activity-logs"] as any)[":id"].$delete({ param: { id } }));
        const logs = await (unwrapResponse(await (adminClient["activity-logs"] as any).$get()) as any);
        setActivityLogs(logs || []);
      } catch (err) {
        console.error("Delete activity error:", err);
        notify.error("Gagal menghapus log");
      }
    }
  };

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

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-6 py-10 lg:px-10 lg:py-14">
      {/* Background Radial Glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-full max-w-[1200px] -translate-x-1/2 rounded-full bg-primary/5 blur-[140px]" />

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800/30">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline font-medium"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      <StaggerList className="flex flex-col gap-12" stagger={0.05}>
        
        {/* Section 1: Hero & Quick Stats */}
        <StaggerItem className="flex flex-col lg:flex-row justify-between items-start gap-8 lg:gap-12">
          <div className="flex-1 max-w-2xl">
            <h2 className="font-display text-4xl font-bold tracking-tight text-fg mb-3">
              Halo, {displayName}.
            </h2>
            <p className="text-base text-fg2 font-normal leading-relaxed">
              Anda masuk sebagai <span className="font-semibold text-fg">{roleLabel}</span>.{" "}
              {roleLabel === "Agent"
                ? "Pelajari skenario latihan baru, ikuti simulasi interaktif, dan validasi skor capaian bulanan secara komprehensif."
                : "Pantau tren performa layanan utama, mengevaluasi aktivitas harian staf, dan kelola operasional dalam satu platform."}
            </p>
          </div>

          {/* Quick Stats right aligned */}
          <div className="flex shrink-0 gap-6 lg:gap-10 p-6 rounded-2xl bg-surface border border-border">
            {showAnalytics && serviceTrendMap ? (
              <>
                <div className="flex flex-col">
                  <span className="text-3xl font-display font-bold tracking-tight text-fg">
                    {localTrendData?.totalSummary.auditedAgents ?? serviceTrendMap.all.totalSummary.auditedAgents ?? 0}
                  </span>
                  <span className="text-xs text-fg3 font-medium uppercase tracking-wider mt-1">
                    Agen Diaudit
                  </span>
                </div>
                <div className="w-px bg-border"></div>
                <div className="flex flex-col">
                  <span className="text-3xl font-display font-bold tracking-tight text-fg">
                    {localTrendData?.totalSummary.totalDefects ?? serviceTrendMap.all.totalSummary.totalDefects ?? 0}
                  </span>
                  <span className="text-xs text-fg3 font-medium uppercase tracking-wider mt-1">
                    Temuan
                  </span>
                </div>
                <div className="w-px bg-border"></div>
                <div className="flex flex-col">
                  <span className="text-3xl font-display font-bold tracking-tight text-fg">
                    {localTrendData?.totalSummary.activeServiceCount ?? serviceTrendMap.all.totalSummary.activeServiceCount ?? 0}
                  </span>
                  <span className="text-xs text-fg3 font-medium uppercase tracking-wider mt-1">
                    Layanan
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-fg2">
                <Clock className="w-5 h-5 text-fg3" />
                <span className="text-sm font-medium">Sesi latihan Anda siap dimulai</span>
              </div>
            )}
          </div>
        </StaggerItem>

        {/* Section 2: Trainer Shortcuts (Prominent Top Placement) */}
        {isManager && (
          <StaggerItem>
            <div className="mb-4">
              <h3 className="text-sm font-bold text-fg tracking-tight">Pintasan Cepat</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {trainerShortcuts.slice(0, 3).map((shortcut) => (
                <Link
                  key={shortcut.href}
                  to={shortcut.href}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:border-fg/30 hover:bg-surface"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${shortcut.accentSoftClassName} ${shortcut.accentClassName}`}>
                    <shortcut.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg">
                      {shortcut.title}
                    </p>
                    <p className="text-xs text-fg3 truncate mt-0.5">
                      {shortcut.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-fg3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </StaggerItem>
        )}

        {/* Section 3: Workspace Terpadu */}
        <StaggerItem>
          <div className="mb-4">
            <h3 className="text-sm font-bold text-fg tracking-tight">Workspace Terpadu</h3>
            <p className="text-xs text-fg2 mt-1">Akses modul utama untuk pelatihan dan penilaian</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {visibleModules.map((module) => {
              const colors = getModuleColors(module.id);
              return (
                <Link
                  key={module.id}
                  to={module.href}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-surface p-5 transition-all hover:border-fg/30 hover:shadow-sm"
                  onClick={(e) => {
                    if (module.id === "telefun" && !hasTelefunAccess) {
                      e.preventDefault();
                      openMaintenance();
                    }
                  }}
                >
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.soft} ${colors.text}`}>
                        <module.icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-fg3 transition-transform group-hover:translate-x-1 group-hover:text-fg" />
                    </div>
                    <h4 className="text-sm font-semibold text-fg">
                      {module.title}
                    </h4>
                    <p className="mt-1.5 text-xs text-fg3 leading-relaxed">
                      {module.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </StaggerItem>

        {/* Section 4: Trend Panel */}
        {showAnalytics && serviceTrendMap && (
          <StaggerItem>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-fg tracking-tight">Tren Performa Kualitas</h3>
                <p className="text-xs text-fg2 mt-1">Visualisasi deviasi temuan bulanan</p>
              </div>
            </div>
            
            <div className="rounded-2xl border border-border bg-surface p-1 min-h-[360px]">
              <Suspense
                fallback={
                  <div className="w-full h-[360px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-fg3" />
                  </div>
                }
              >
                <DashboardTrendPanel
                  serviceTrendMap={serviceTrendMap}
                  availableYears={availableYears}
                  selectedYear={selectedYear}
                  trendStartMonth={trendStartMonth}
                  trendEndMonth={trendEndMonth}
                  trendLoading={trendLoading}
                  localTrendData={localTrendData}
                  onYearChange={handleYearChange}
                  onRangeChange={handleRangeChange}
                />
              </Suspense>
            </div>
          </StaggerItem>
        )}

        {/* Section 5: Activity Logs & Management (Two Columns if space permits) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activities */}
          {isManager && (
            <StaggerItem className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-fg tracking-tight">Aktivitas Terakhir</h3>
                </div>
                <Link
                  to="/dashboard/activities"
                  className="text-xs text-fg2 hover:text-fg hover:underline transition-colors"
                >
                  Lihat Semua
                </Link>
              </div>

              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-fg3" />
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {formattedLogs.length > 0 ? (
                      formattedLogs.slice(0, 5).map((log) => {
                        const isLogin = log.type === "login";
                        const isEdit = log.type === "edit";
                        const isAdd = log.type === "add";

                        return (
                          <div
                            key={log.id}
                            className="flex items-center justify-between p-4 hover:bg-surface-sunken transition-colors group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="relative flex items-center justify-center shrink-0">
                                <span className={`w-2 h-2 rounded-full ${
                                  isLogin ? "bg-blue-500" : isEdit ? "bg-purple-500" : isAdd ? "bg-emerald-500" : "bg-amber-500"
                                }`} />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-fg">
                                  {log.user}
                                </div>
                                <div className="text-xs text-fg2 mt-0.5">
                                  {log.action}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-[11px] font-mono text-fg3">
                                {log.time}
                              </span>
                              <button
                                onClick={() => handleDeleteActivity(log.id.toString())}
                                className="p-1 text-fg3 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                title="Hapus Log"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-10 text-center text-fg3 text-sm">
                        Belum ada aktivitas terbaru.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </StaggerItem>
          )}

          {/* Opsi Manajerial (Settings etc) */}
          <StaggerItem className="lg:col-span-1">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-fg tracking-tight">Opsi Manajerial</h3>
            </div>
            <div className="flex flex-col gap-3">
              {managementActions.map((action) => (
                <Link
                  key={action.href}
                  to={action.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-fg/30 hover:bg-surface"
                >
                  <action.icon className="h-4.5 w-4.5 text-fg2" />
                  <span className="text-sm font-medium text-fg">{action.title}</span>
                  <ArrowRight className="h-4 w-4 text-fg3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1 ml-auto" />
                </Link>
              ))}
              <Link
                to="/account"
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-fg/30 hover:bg-surface mt-2"
              >
                <UserCog className="h-4.5 w-4.5 text-fg2" />
                <span className="text-sm font-medium text-fg">Pengaturan Profil</span>
                <ArrowRight className="h-4 w-4 text-fg3 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1 ml-auto" />
              </Link>
            </div>
          </StaggerItem>
        </div>

      </StaggerList>
    </div>
  );
}
