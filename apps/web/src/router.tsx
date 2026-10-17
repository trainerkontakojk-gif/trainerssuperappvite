import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  isRedirect,
} from "@tanstack/react-router";
import { lazy } from "react";
import { DashboardLayout } from "./components/Layout";
import {
  can,
  LEADER_APPROVAL_MODULE,
  VALID_SERVICE_TYPES,
  type Capability,
  type ServiceType,
} from "@trainers/types";
import { supabase } from "./lib/supabase";
import { fetchAuthProfile } from "./lib/fetchAuthProfile";
import { fetchApi } from "./hooks/useApi";
import {
  validateSidakScopeSearch,
  type SidakScopeSearch,
} from "./hooks/useSidakScope";
import { validateAgentDetailSearch } from "./components/sidak/sidak-agent-detail-tabs.constants";

const IndexPage = lazy(() => import("./routes/index"));
const DashboardPage = lazy(() => import("./routes/dashboard"));
const DashboardUsers = lazy(() => import("./routes/dashboard/users"));
const DashboardAccessGroups = lazy(
  () => import("./routes/dashboard/access-groups"),
);
const DashboardAccessApproval = lazy(
  () => import("./routes/dashboard/access-approval"),
);
const DashboardActivities = lazy(() => import("./routes/dashboard/activities"));
const SidakIndexRedirect = lazy(() => import("./routes/sidak/index"));
const SidakDashboard = lazy(() => import("./routes/sidak/dashboard"));
const SidakForecast = lazy(() => import("./routes/sidak/forecast"));
const SidakInput = lazy(() => import("./routes/sidak/input"));
const SidakHeatmap = lazy(() => import("./routes/sidak/heatmap"));
const SidakRanking = lazy(() => import("./routes/sidak/ranking"));
const SidakSettings = lazy(() => import("./routes/sidak/settings"));
const SidakPeriods = lazy(() => import("./routes/sidak/periods"));
const SidakJadwalShifting = lazy(
  () => import("./routes/sidak/jadwal-shifting"),
);
const SidakAgents = lazy(() => import("./routes/sidak/agents"));
const SidakAgentDetail = lazy(() => import("./routes/sidak/agents.$id"));
const SidakReportsData = lazy(() => import("./routes/sidak/reports-data"));
const KetikLanding = lazy(() => import("./routes/ketik/index"));
const KetikHistory = lazy(() => import("./routes/ketik/history"));
const PdktLanding = lazy(() => import("./routes/pdkt/index"));
const PdktHistory = lazy(() => import("./routes/pdkt/history"));
const MonitoringPage = lazy(() => import("./routes/monitoring"));
const TelefunLanding = lazy(() => import("./routes/telefun/index"));
const TelefunHistory = lazy(() => import("./routes/telefun/history"));
const AccountPage = lazy(() => import("./routes/account"));
const AuthCallbackPage = lazy(() => import("./routes/auth-callback"));
const NotFoundPage = lazy(() => import("./routes/not-found"));
const UnauthorizedPage = lazy(() => import("./routes/unauthorized"));
const WaitingApprovalPage = lazy(() => import("./routes/waiting-approval"));
const ResetPasswordPage = lazy(() => import("./routes/reset-password"));
const ProfilerLanding = lazy(() => import("./routes/profiler/index"));

const rootRoute = createRootRoute({
  component: DashboardLayout,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
  beforeLoad: requireAuth(),
});

const dashboardUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/users",
  component: DashboardUsers,
  beforeLoad: requireCapability("admin.users"),
});

const dashboardAccessGroupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/access-groups",
  component: DashboardAccessGroups,
  beforeLoad: requireCapability("admin.accessGroups"),
});

const dashboardAccessApprovalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/access-approval",
  component: DashboardAccessApproval,
  beforeLoad: requireCapability("admin.leaderAccess"),
});

const dashboardActivitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/activities",
  component: DashboardActivities,
  beforeLoad: requireCapability("admin.activityLogs.read"),
});

/**
 * Statistik, Slide, dan Ekspor kini tab di workspace `/profiler`
 * (`?view=`). Route lama tetap ada sebagai deep link dan diteruskan ke tab
 * yang sesuai. `searchStr` dibaca mentah supaya nama batch tidak di-parse
 * ulang menjadi angka/JSON.
 */
const redirectToProfilerView =
  (view: "statistik" | "slide" | "ekspor") =>
  ({ location }: { location: { searchStr: string } }) => {
    const params = new URLSearchParams(location.searchStr);
    const batch = params.get("batch");
    const participant = params.get("participant");
    const search: Record<string, string> = {};
    if (batch) {
      search.batch = batch;
      search.view = view;
      if (view === "slide" && participant) search.participant = participant;
    }
    throw redirect({ to: "/profiler", search, replace: true });
  };

const profilerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler",
  component: ProfilerLanding,
  beforeLoad: requireCapability("profiler.landing"),
});

/** Daftar peserta kini satu: tab Peserta di workspace, mode Tabel. */
const profilerTableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/table",
  beforeLoad: ({ location }: { location: { searchStr: string } }) => {
    const batch = new URLSearchParams(location.searchStr).get("batch");
    throw redirect({
      to: "/profiler",
      search: batch ? { batch, layout: "tabel" } : {},
      replace: true,
    });
  },
});

const profilerSlidesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/slides",
  beforeLoad: redirectToProfilerView("slide"),
});

const profilerAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/analytics",
  beforeLoad: redirectToProfilerView("statistik"),
});

const profilerExportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/export",
  beforeLoad: redirectToProfilerView("ekspor"),
});

/**
 * Tambah, Impor, dan Kelola tim kini dibuka di dalam workspace `/profiler`
 * (`?view=tambah`, `?view=impor`, `?tim=1`); route lama tetap jalan.
 */
const redirectToProfilerTask =
  (task: "tambah" | "impor") =>
  ({ location }: { location: { searchStr: string } }) => {
    const batch = new URLSearchParams(location.searchStr).get("batch");
    throw redirect({
      to: "/profiler",
      search: batch ? { batch, view: task } : { view: task },
      replace: true,
    });
  };

const profilerAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/add",
  beforeLoad: redirectToProfilerTask("tambah"),
});

const profilerImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/import",
  beforeLoad: redirectToProfilerTask("impor"),
});

const profilerTeamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/teams",
  beforeLoad: () => {
    throw redirect({ to: "/profiler", search: { tim: 1 }, replace: true });
  },
});

const sidakRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak",
  component: SidakIndexRedirect,
  validateSearch: validateSidakScopeSearch,
  beforeLoad: requireCapability("sidak.landing"),
});

const sidakDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/dashboard",
  component: SidakDashboard,
  validateSearch: validateSidakScopeSearch,
  beforeLoad: requireCapability("sidak.view"),
});

const sidakForecastRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/forecast",
  component: SidakForecast,
  validateSearch: validateSidakScopeSearch,
  beforeLoad: requireCapability("sidak.view"),
});

const sidakInputRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/input",
  component: SidakInput,
  beforeLoad: requireCapability("sidak.config.manage"),
});

const sidakRankingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/ranking",
  component: SidakRanking,
  // Cakupan bersama SIDAK (`layanan`, `tahun`, `dari`, `sampai`, `tim`).
  // Tautan lama memakai `service_type`/`year`; keduanya dipetakan ke kunci
  // cakupan lalu dibuang supaya URL hanya punya satu bentuk.
  validateSearch: (search: Record<string, unknown>): SidakScopeSearch =>
    validateSidakScopeSearch({
      layanan: search.service_type,
      tahun: search.year,
      ...search,
    }),
  beforeLoad: requireCapability("sidak.view"),
});

const sidakSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/settings",
  component: SidakSettings,
  beforeLoad: requireCapability("sidak.config.manage"),
});

const sidakPeriodsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/periods",
  component: SidakPeriods,
  beforeLoad: requireCapability("sidak.config.manage"),
});

const sidakHeatmapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/heatmap",
  component: SidakHeatmap,
  validateSearch: validateSidakScopeSearch,
  // Admin/trainer (semua data) + leader (hanya scope tim-nya). Leader tetap
  // harus punya modul SIDAK disetujui — tiga lapis: nav, beforeLoad, backend.
  beforeLoad: requireCapability("sidak.view"),
});

const sidakJadwalShiftingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/jadwal-shifting",
  component: SidakJadwalShifting,
  // `validateSearch` memindahkan parameter dari URL ke state halaman supaya
  // deep link bisa dibagikan dan di-back-forward.
  //
  // Dua format tampilan disimpan terpisah: `date`+`channel` untuk format
  // "hari ini", `month`+`section` untuk kalender. Masing-masing divalidasi
  // bentuknya di sini — nilai yang tidak dikenal DIABAIKAN, bukan diteruskan
  // apa adanya ke state, supaya URL yang diedit tangan tidak bisa memasukkan
  // bentuk yang tidak pernah divalidasi lagi di halaman.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    date?: string;
    view?: "today" | "calendar";
    channel?: string;
    month?: string;
    section?: string;
  } => {
    const validated: {
      date?: string;
      view?: "today" | "calendar";
      channel?: string;
      month?: string;
      section?: string;
    } = {};

    if (
      typeof search.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(search.date)
    ) {
      validated.date = search.date;
    }
    if (search.view === "calendar" || search.view === "today") {
      // `today` tidak ditulis balik ke URL: itu nilai default, jadi URL
      // tetap pendek tanpa kehilangan apa pun.
      if (search.view === "calendar") validated.view = "calendar";
    }
    const slug = /^[a-z][a-z-]{0,23}$/;
    if (typeof search.channel === "string" && slug.test(search.channel)) {
      validated.channel = search.channel;
    }
    if (typeof search.section === "string" && slug.test(search.section)) {
      validated.section = search.section;
    }
    if (
      typeof search.month === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
    ) {
      validated.month = search.month;
    }

    return validated;
  },
  // Hanya `admin` + `trainer`. Guard ini untuk navigasi/UX; penegakan yang
  // sebenarnya ada di backend `requireCapability("telefun.use")`.
  beforeLoad: requireCapability("sidak.schedule.read"),
});

const sidakAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/agents",
  component: SidakAgents,
  validateSearch: validateSidakScopeSearch,
  beforeLoad: requireCapability("sidak.view"),
});

const sidakAgentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/agents/$id",
  component: SidakAgentDetail,
  validateSearch: validateAgentDetailSearch,
  beforeLoad: requireCapability("sidak.view"),
});

const sidakReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/reports",
  beforeLoad: () => {
    throw redirect({ to: "/sidak/reports-data", replace: true });
  },
});

const sidakReportsDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/reports-data",
  component: SidakReportsData,
  validateSearch: validateSidakScopeSearch,
  beforeLoad: requireCapability("sidak.reports.view"),
});

const sidakReportsAiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sidak/reports-ai",
  beforeLoad: () => {
    throw redirect({ to: "/sidak/reports-data", replace: true });
  },
});

const ketikRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ketik",
  component: KetikLanding,
  validateSearch: (
    search: Record<string, unknown>,
  ): { sesi?: string; tahap?: "telaah" | "chat" } => ({
    ...(typeof search.sesi === "string" && search.sesi
      ? { sesi: search.sesi }
      : {}),
    ...(search.tahap === "telaah"
      ? { tahap: "telaah" as const }
      : search.tahap === "chat"
        ? { tahap: "chat" as const }
        : {}),
  }),
  beforeLoad: requireAuth(),
});

const ketikSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ketik/simulation",
  beforeLoad: () => {
    throw redirect({ to: "/ketik", search: {}, replace: true });
  },
});

const ketikHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ketik/history",
  component: KetikHistory,
  beforeLoad: requireAuth(),
});

const pdktRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pdkt",
  component: PdktLanding,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    sesi?: string;
    ruang?: 1;
    email?: string;
    dari?: "riwayat";
    tahap?: "telaah";
  } => ({
    ...(typeof search.sesi === "string" && search.sesi
      ? { sesi: search.sesi }
      : {}),
    ...(search.ruang === 1 || search.ruang === "1" ? { ruang: 1 } : {}),
    ...(typeof search.email === "string" && search.email
      ? { email: search.email }
      : {}),
    ...(search.dari === "riwayat" ? { dari: "riwayat" } : {}),
    ...(search.tahap === "telaah" ? { tahap: "telaah" } : {}),
  }),
  beforeLoad: requireCapability("pdkt.use"),
});

const pdktSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pdkt/simulation",
  beforeLoad: () => {
    throw redirect({ to: "/pdkt", search: {}, replace: true });
  },
});

const pdktHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pdkt/history",
  component: PdktHistory,
  beforeLoad: requireCapability("pdkt.use"),
});

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/monitoring",
  beforeLoad: requireCapability("monitoring.read"),
  component: MonitoringPage,
});

const telefunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/telefun",
  component: TelefunLanding,
  validateSearch: (
    search: Record<string, unknown>,
  ): { sesi?: string; tahap?: "telaah" } => ({
    ...(typeof search.sesi === "string" && search.sesi
      ? { sesi: search.sesi }
      : {}),
    ...(search.tahap === "telaah" ? { tahap: "telaah" } : {}),
  }),
  beforeLoad: requireAuth(),
});

const telefunHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/telefun/history",
  component: TelefunHistory,
  beforeLoad: requireAuth(),
});

// Halaman replay lama digabung ke tahap Telaah; tautan lama tetap berfungsi.
const telefunReplayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/telefun/replay/$id",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/telefun",
      search: { sesi: params.id, tahap: "telaah" },
      replace: true,
    });
  },
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: AccountPage,
  beforeLoad: requireAuth(),
});

export function guardWaitingApproval() {
  return async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const profile = await fetchAuthProfile(session.user.id);
    if (profile?.is_deleted || profile?.status === "inactive") {
      throw redirect({ to: "/" });
    }
    if (profile?.status === "active") {
      throw redirect({ to: "/dashboard" });
    }
  };
}

export function guardResetPassword() {
  return async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/" });
    }
  };
}

const waitingApprovalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/waiting-approval",
  component: WaitingApprovalPage,
  beforeLoad: guardWaitingApproval(),
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
  beforeLoad: guardResetPassword(),
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallbackPage,
});

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/unauthorized",
  component: UnauthorizedPage,
});

function requireAuth() {
  return async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/" });
    }
  };
}

export function requireCapability(capability: Capability) {
  return async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/" });
    try {
      const profile = await fetchAuthProfile(session.user.id);
      if (!profile) throw redirect({ to: "/" });
      if (profile.is_deleted || profile.status === "inactive")
        throw redirect({ to: "/waiting-approval" });
      if (!can(profile.role, capability))
        throw redirect({ to: "/unauthorized" });
      const module = LEADER_APPROVAL_MODULE[capability];
      if (module && profile.role === "leader") {
        const access =
          await fetchApi<Record<string, { status: string }>>(
            "/me/access-status",
          );
        if (access[module]?.status !== "approved")
          throw redirect({ to: module === "ktp" ? "/profiler" : "/sidak" });
      }
    } catch (error: unknown) {
      if (isRedirect(error)) throw error;
      console.error("Auth revalidation error:", error);
      throw redirect({ to: "/unauthorized" });
    }
  };
}

// Legacy Compatibility Redirect Routes
const qaAnalyzerRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/qa-analyzer",
  beforeLoad: () => {
    throw redirect({ to: "/sidak" });
  },
});

const qaAnalyzerWildcardRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/qa-analyzer/$",
  beforeLoad: ({ params }) => {
    throw redirect({ to: `/sidak/${(params as any)._splat}` as any });
  },
});

const dashboardMonitoringRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/monitoring",
  beforeLoad: () => {
    throw redirect({ to: "/monitoring" });
  },
});

const profilerDownloadRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profiler/download",
  beforeLoad: redirectToProfilerView("ekspor"),
});

const pendingRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pending",
  beforeLoad: () => {
    throw redirect({ to: "/waiting-approval" });
  },
});

const previewProfilerSlidesRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/preview/profiler-slides",
  beforeLoad: redirectToProfilerView("slide"),
});

const tnaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tna",
  component: lazy(() => import("./routes/tna/index")),
  validateSearch: (search: Record<string, unknown>) => ({
    service: VALID_SERVICE_TYPES.includes(search.service as ServiceType)
      ? (search.service as ServiceType)
      : ("call" as ServiceType),
    period: typeof search.period === "string" ? search.period : "",
    compare: Math.min(6, Math.max(1, Number(search.compare) || 2)),
    all: search.all === true || search.all === "true",
  }),
  beforeLoad: requireCapability("tna.read"),
});
const tnaParameterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tna/parameter",
  component: lazy(() => import("./routes/tna/parameter")),
  validateSearch: (search: Record<string, unknown>) => ({
    service: VALID_SERVICE_TYPES.includes(search.service as ServiceType)
      ? (search.service as ServiceType)
      : ("call" as ServiceType),
    period: typeof search.period === "string" ? search.period : "",
    indicator: typeof search.indicator === "string" ? search.indicator : "",
    compare: Math.min(6, Math.max(1, Number(search.compare) || 2)),
    ...(typeof search.previous_plan === "string" && search.previous_plan
      ? { previous_plan: search.previous_plan }
      : {}),
  }),
  beforeLoad: requireCapability("tna.read"),
});
const tnaNeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tna/kebutuhan/$id",
  component: lazy(() => import("./routes/tna/need")),
  beforeLoad: requireCapability("tna.read"),
});
const tnaPlanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tna/rencana/$id",
  component: lazy(() => import("./routes/tna/plan")),
  beforeLoad: requireCapability("tna.read"),
});

const routeTree = rootRoute.addChildren([
  tnaRoute,
  tnaParameterRoute,
  tnaNeedRoute,
  tnaPlanRoute,
  indexRoute,
  dashboardRoute,
  dashboardUsersRoute,
  dashboardAccessGroupsRoute,
  dashboardAccessApprovalRoute,
  dashboardActivitiesRoute,
  profilerRoute,
  profilerTableRoute,
  profilerSlidesRoute,
  profilerAnalyticsRoute,
  profilerExportRoute,
  profilerAddRoute,
  profilerImportRoute,
  profilerTeamsRoute,
  sidakRoute,
  sidakDashboardRoute,
  sidakForecastRoute,
  sidakInputRoute,
  sidakRankingRoute,
  sidakSettingsRoute,
  sidakPeriodsRoute,
  sidakHeatmapRoute,
  sidakJadwalShiftingRoute,
  sidakAgentsRoute,
  sidakAgentDetailRoute,
  sidakReportsRoute,
  sidakReportsDataRoute,
  sidakReportsAiRoute,
  ketikRoute,
  ketikSimulationRoute,
  ketikHistoryRoute,
  pdktRoute,
  pdktSimulationRoute,
  pdktHistoryRoute,
  telefunRoute,
  telefunHistoryRoute,
  telefunReplayRoute,
  monitoringRoute,
  accountRoute,
  authCallbackRoute,
  waitingApprovalRoute,
  resetPasswordRoute,
  unauthorizedRoute,
  qaAnalyzerRedirectRoute,
  qaAnalyzerWildcardRedirectRoute,
  dashboardMonitoringRedirectRoute,
  profilerDownloadRedirectRoute,
  pendingRedirectRoute,
  previewProfilerSlidesRedirectRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
