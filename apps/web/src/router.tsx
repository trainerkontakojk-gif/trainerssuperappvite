import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { DashboardLayout } from './components/Layout';
import { isRoleAllowed } from './lib/app-config';
import { supabase } from './lib/supabase';
import { fetchAuthProfile } from './lib/fetchAuthProfile';

const IndexPage = lazy(() => import('./routes/index'));
const DashboardPage = lazy(() => import('./routes/dashboard'));
const DashboardUsers = lazy(() => import('./routes/dashboard/users'));
const DashboardAccessGroups = lazy(() => import('./routes/dashboard/access-groups'));
const DashboardAccessApproval = lazy(() => import('./routes/dashboard/access-approval'));
const DashboardActivities = lazy(() => import('./routes/dashboard/activities'));
const SidakLanding = lazy(() => import('./routes/sidak/index'));
const SidakDashboard = lazy(() => import('./routes/sidak/dashboard'));
const SidakInput = lazy(() => import('./routes/sidak/input'));
const SidakRanking = lazy(() => import('./routes/sidak/ranking'));
const SidakSettings = lazy(() => import('./routes/sidak/settings'));
const SidakPeriods = lazy(() => import('./routes/sidak/periods'));
const SidakAgents = lazy(() => import('./routes/sidak/agents'));
const SidakAgentDetail = lazy(() => import('./routes/sidak/agents.$id'));
const SidakReportsLanding = lazy(() => import('./routes/sidak/reports/index'));
const SidakReportsData = lazy(() => import('./routes/sidak/reports-data'));
const SidakReportsAi = lazy(() => import('./routes/sidak/reports-ai'));
const KetikLanding = lazy(() => import('./routes/ketik/index'));
const PdktLanding = lazy(() => import('./routes/pdkt/index'));
const PdktSimulation = lazy(() => import('./routes/pdkt/simulation'));
const MonitoringPage = lazy(() => import('./routes/monitoring'));
const TelefunLanding = lazy(() => import('./routes/telefun/index'));
const AccountPage = lazy(() => import('./routes/account'));
const NotFoundPage = lazy(() => import('./routes/not-found'));
const UnauthorizedPage = lazy(() => import('./routes/unauthorized'));
const WaitingApprovalPage = lazy(() => import('./routes/waiting-approval'));
const ResetPasswordPage = lazy(() => import('./routes/reset-password'));
const ProfilerLanding = lazy(() => import('./routes/profiler/index'));
const ProfilerTable = lazy(() => import('./routes/profiler/table'));
const ProfilerSlides = lazy(() => import('./routes/profiler/slides'));
const ProfilerAnalytics = lazy(() => import('./routes/profiler/analytics'));
const ProfilerExport = lazy(() => import('./routes/profiler/export'));
const ProfilerAdd = lazy(() => import('./routes/profiler/add'));
const ProfilerImport = lazy(() => import('./routes/profiler/import'));
const ProfilerTeams = lazy(() => import('./routes/profiler/teams'));

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

const dashboardUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/users',
  component: DashboardUsers,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const dashboardAccessGroupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/access-groups',
  component: DashboardAccessGroups,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const dashboardAccessApprovalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/access-approval',
  component: DashboardAccessApproval,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const dashboardActivitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/activities',
  component: DashboardActivities,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const profilerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler',
  component: ProfilerLanding,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerTableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/table',
  component: ProfilerTable,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerSlidesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/slides',
  component: ProfilerSlides,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/analytics',
  component: ProfilerAnalytics,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerExportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/export',
  component: ProfilerExport,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/add',
  component: ProfilerAdd,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/import',
  component: ProfilerImport,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const profilerTeamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/teams',
  component: ProfilerTeams,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak',
  component: SidakLanding,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/dashboard',
  component: SidakDashboard,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakInputRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/input',
  component: SidakInput,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const sidakRankingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/ranking',
  component: SidakRanking,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/settings',
  component: SidakSettings,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const sidakPeriodsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/periods',
  component: SidakPeriods,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const sidakAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/agents',
  component: SidakAgents,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakAgentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/agents/$id',
  component: SidakAgentDetail,
  beforeLoad: requireRole(['trainer', 'leader', 'admin']),
});

const sidakReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/reports',
  component: SidakReportsLanding,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const sidakReportsDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/reports-data',
  component: SidakReportsData,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const sidakReportsAiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sidak/reports-ai',
  component: SidakReportsAi,
  beforeLoad: requireRole(['trainer', 'admin']),
});

const ketikRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik',
  component: KetikLanding,
});

const ketikSimulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik/simulation',
  beforeLoad: () => {
    throw redirect({ to: '/ketik' });
  },
});

const ketikHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ketik/history',
  beforeLoad: () => {
    throw redirect({ to: '/ketik' });
  },
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
  beforeLoad: () => {
    throw redirect({ to: '/pdkt' });
  },
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

const telefunReplayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/telefun/replay/$id',
  component: lazy(() => import('./routes/telefun/replay')),
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

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/unauthorized',
  component: UnauthorizedPage,
});

function requireRole(allowedRoles: string[]) {
  return async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: '/' });
    }

    try {
      // Revalidate profile from server to prevent spoofing
      const profile = await fetchAuthProfile(session.user.id);
      
      if (!profile) {
        throw redirect({ to: '/' });
      }

      if (profile.is_deleted || profile.status === 'inactive') {
        throw redirect({ to: '/waiting-approval' });
      }

      if (!isRoleAllowed(profile.role, allowedRoles)) {
        throw redirect({ to: '/unauthorized' });
      }
    } catch (error) {
      console.error('Auth revalidation error:', error);
      // On network error or other failure, default deny
      throw redirect({ to: '/unauthorized' });
    }
  };
}

// Legacy Compatibility Redirect Routes
const qaAnalyzerRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/qa-analyzer',
  beforeLoad: () => {
    throw redirect({ to: '/sidak' });
  },
});

const qaAnalyzerWildcardRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/qa-analyzer/$',
  beforeLoad: ({ params }) => {
    throw redirect({ to: `/sidak/${(params as any)._splat}` as any });
  },
});

const dashboardMonitoringRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/monitoring',
  beforeLoad: () => {
    throw redirect({ to: '/monitoring' });
  },
});

const profilerDownloadRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profiler/download',
  beforeLoad: () => {
    throw redirect({ to: '/profiler/export' });
  },
});

const pendingRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pending',
  beforeLoad: () => {
    throw redirect({ to: '/waiting-approval' });
  },
});

const previewProfilerSlidesRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preview/profiler-slides',
  beforeLoad: () => {
    throw redirect({ to: '/profiler/slides' });
  },
});

const routeTree = rootRoute.addChildren([
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
  sidakInputRoute,
  sidakRankingRoute,
  sidakSettingsRoute,
  sidakPeriodsRoute,
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
  telefunReplayRoute,
  monitoringRoute,
  accountRoute,
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

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
