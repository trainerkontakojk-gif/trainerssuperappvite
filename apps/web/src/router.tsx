import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';
import { DashboardLayout } from './components/Layout';
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

const rootRoute = createRootRoute({
  component: DashboardLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-4xl font-bold">Welcome to Trainers SuperApp</h1>
    </div>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Overview</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-6 bg-white rounded-xl border shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Audits</h3>
          <p className="text-2xl font-bold">128</p>
        </div>
      </div>
    </div>
  ),
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
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
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
