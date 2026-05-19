import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';
import { DashboardLayout } from './components/Layout';
import IndexPage from './routes/index';
import DashboardPage from './routes/dashboard';
import SidakLanding from './routes/sidak/index';
import SidakDashboard from './routes/sidak/dashboard';
import SidakInput from './routes/sidak/input';
import SidakRanking from './routes/sidak/ranking';
import SidakSettings from './routes/sidak/settings';
import SidakPeriods from './routes/sidak/periods';
import SidakAgents from './routes/sidak/agents';
import SidakAgentDetail from './routes/sidak/agents.$id';
import KetikLanding from './routes/ketik/index';
import KetikSimulation from './routes/ketik/simulation';
import KetikHistory from './routes/ketik/history';
import PdktLanding from './routes/pdkt/index';
import PdktSimulation from './routes/pdkt/simulation';
import PdktHistory from './routes/pdkt/history';
import MonitoringPage from './routes/monitoring';
import TelefunLanding from './routes/telefun/index';
import AccountPage from './routes/account';
import NotFoundPage from './routes/not-found';
import WaitingApprovalPage from './routes/waiting-approval';
import ResetPasswordPage from './routes/reset-password';
import ProfilerLanding from './routes/profiler/index';
import ProfilerTable from './routes/profiler/table';
import ProfilerSlides from './routes/profiler/slides';
import ProfilerAnalytics from './routes/profiler/analytics';
import ProfilerExport from './routes/profiler/export';
import ProfilerAdd from './routes/profiler/add';
import ProfilerImport from './routes/profiler/import';
import ProfilerTeams from './routes/profiler/teams';

const rootRoute = createRootRoute({
  component: DashboardLayout,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const profilerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler',
  component: ProfilerLanding,
});

const profilerTableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/table',
  component: ProfilerTable,
});

const profilerSlidesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/slides',
  component: ProfilerSlides,
});

const profilerAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/analytics',
  component: ProfilerAnalytics,
});

const profilerExportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/export',
  component: ProfilerExport,
});

const profilerAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/add',
  component: ProfilerAdd,
});

const profilerImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/import',
  component: ProfilerImport,
});

const profilerTeamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/teams',
  component: ProfilerTeams,
});

const sidakRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak',
  component: SidakLanding,
});

const sidakDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/dashboard',
  component: SidakDashboard,
});

const sidakInputRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/input',
  component: SidakInput,
});

const sidakRankingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/ranking',
  component: SidakRanking,
});

const sidakSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/settings',
  component: SidakSettings,
});

const sidakPeriodsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/periods',
  component: SidakPeriods,
});

const sidakAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/agents',
  component: SidakAgents,
});

const sidakAgentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/agents/$id',
  component: SidakAgentDetail,
});

const ketikRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik',
  component: KetikLanding,
});

const ketikSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik/simulation',
  component: KetikSimulation,
});

const ketikHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik/history',
  component: KetikHistory,
});

const pdktRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pdkt',
  component: PdktLanding,
});

const pdktSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pdkt/simulation',
  component: PdktSimulation,
});

const pdktHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pdkt/history',
  component: PdktHistory,
});

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/monitoring',
  component: MonitoringPage,
});

const telefunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/telefun',
  component: TelefunLanding,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
});

const waitingApprovalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/waiting-approval',
  component: WaitingApprovalPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
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
  sidakInputRoute,
  sidakRankingRoute,
  sidakSettingsRoute,
  sidakPeriodsRoute,
  sidakAgentsRoute,
  sidakAgentDetailRoute,
  ketikRoute,
  ketikSimulationRoute,
  ketikHistoryRoute,
  pdktRoute,
  pdktSimulationRoute,
  pdktHistoryRoute,
  telefunRoute,
  monitoringRoute,
  accountRoute,
  waitingApprovalRoute,
  resetPasswordRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
