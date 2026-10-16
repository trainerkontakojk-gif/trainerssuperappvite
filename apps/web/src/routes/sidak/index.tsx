import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { can, normalizeRole } from "@trainers/types";
import type { AgentDirectoryResponse, DashboardData } from "@trainers/types";
import { buttonVariants } from "@/components/ui/button";
import LeaderAccessGate from "../../components/LeaderAccessGate";
import { buildNavModel } from "../../components/layout/nav-config";
import {
  SidakPageHeader,
  SidakScopeLine,
} from "../../components/sidak/SidakPageHeader";
import { SidakFollowUpList } from "../../components/sidak/home/SidakFollowUpList";
import { SidakPageDirectory } from "../../components/sidak/home/SidakPageDirectory";
import { SidakPeriodStrip } from "../../components/sidak/home/SidakPeriodStrip";
import { SidakTopParameters } from "../../components/sidak/home/SidakTopParameters";
import type { SidakHomeLoadState } from "../../components/sidak/home/SidakHomeSection";
import { useApi } from "../../hooks/useApi";
import { SIDAK_ALL_TEAMS, useSidakScope } from "../../hooks/useSidakScope";
import { useAuthStore } from "../../store/authStore";
import {
  buildFollowUpAgents,
  buildHomePeriod,
  buildTopParameters,
} from "../../utils/sidakHomeSummary";

/** Tautan pendamping di kepala beranda, tersaring capability lewat nav. */
const SECONDARY_LINKS = [
  { to: "/sidak/reports-data", label: "Laporan" },
  { to: "/sidak/jadwal-shifting", label: "Jadwal shifting" },
  { to: "/sidak/settings", label: "Parameter QA" },
];

function loadState(loading: boolean, error: string | null, hasData: boolean) {
  if (error && !hasData) return "error" as const;
  if (loading && !hasData) return "loading" as const;
  return (hasData ? "ready" : "loading") as SidakHomeLoadState;
}

/**
 * Ringkasan SIDAK: apa yang perlu ditindaklanjuti di periode QA terbaru.
 * Analisis lengkap ada di Dashboard; halaman ini hanya membaca endpoint yang
 * sudah ada dan tidak memicu forecast.
 */
export default function SidakLanding() {
  const role = useAuthStore((s) => s.profile?.role ?? "");
  const canManage = can(normalizeRole(role), "sidak.config.manage");
  const { scope, setScope } = useSidakScope();

  const sidakPages = useMemo(() => {
    const sidak = buildNavModel(role)
      .groups.flatMap((group) => group.items)
      .find((item) => item.id === "qa-analyzer");
    return (sidak?.children ?? []).filter((child) => !child.exactMatch);
  }, [role]);
  const allowedPaths = new Set(sidakPages.map((page) => page.to));

  const dashboardQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("year", String(scope.tahun));
    params.set("service_type", scope.layanan);
    if (scope.tim && scope.tim !== SIDAK_ALL_TEAMS) {
      params.set("folder_ids", scope.tim);
    }
    params.set("startMonth", String(scope.dari));
    params.set("endMonth", String(scope.sampai));
    return params.toString();
  }, [scope]);

  const dashboard = useApi<DashboardData>(`/sidak/dashboard?${dashboardQuery}`);
  const directory = useApi<AgentDirectoryResponse>(
    `/sidak/agents?year=${scope.tahun}&show_all=false`,
  );

  // Leader dengan satu layanan: ikuti layanan yang diizinkan backend.
  const availableServices = dashboard.data?.availableServices;
  useEffect(() => {
    if (!availableServices?.length) return;
    if (!availableServices.includes(scope.layanan)) {
      setScope({ layanan: availableServices[0] });
    }
  }, [availableServices, scope.layanan, setScope]);

  const period = useMemo(
    () => buildHomePeriod(dashboard.data?.periodMetrics),
    [dashboard.data?.periodMetrics],
  );
  const parameters = useMemo(
    () => buildTopParameters(dashboard.data?.paretoData),
    [dashboard.data?.paretoData],
  );
  const directoryAgents = directory.data?.agents;
  const followUps = useMemo(
    () =>
      buildFollowUpAgents(
        Array.isArray(directoryAgents) ? directoryAgents : [],
      ),
    [directoryAgents],
  );

  const dashboardState = loadState(
    dashboard.loading,
    dashboard.error,
    Boolean(dashboard.data),
  );
  const directoryState = loadState(
    directory.loading,
    directory.error,
    Boolean(directory.data),
  );

  const teamLabel =
    scope.tim && scope.tim !== SIDAK_ALL_TEAMS
      ? (dashboard.data?.folders.find((folder) => folder.id === scope.tim)
          ?.name ?? "Tim terpilih")
      : null;

  return (
    <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-6 pb-16 sm:px-6 lg:pt-10">
        <SidakPageHeader
          title="SIDAK"
          eyebrow={null}
          description="Hasil audit QA: siapa yang perlu ditindaklanjuti dan parameter apa yang paling sering muncul."
          scope={
            <div data-testid="sidak-home-scope">
              <SidakScopeLine
                layanan={scope.layanan}
                timLabel={teamLabel}
                tahun={scope.tahun}
                dari={scope.dari}
                sampai={scope.sampai}
              />
            </div>
          }
          actions={
            <>
              {SECONDARY_LINKS.filter((link) => allowedPaths.has(link.to)).map(
                (link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={buttonVariants({
                      variant: "ghost",
                      className: "min-h-[44px]",
                    })}
                  >
                    {link.label}
                  </Link>
                ),
              )}
              <Link
                to={canManage ? "/sidak/input" : "/sidak/agents"}
                className={buttonVariants({ className: "min-h-[44px] px-4" })}
              >
                {canManage ? "Input temuan" : "Lihat agen saya"}
              </Link>
            </>
          }
        />

        <SidakPeriodStrip
          period={period}
          state={dashboardState}
          onRetry={() => void dashboard.refetch()}
        />

        <div className="flex flex-wrap items-start gap-x-10 gap-y-10">
          <SidakFollowUpList
            agents={followUps}
            state={directoryState}
            onRetry={() => void directory.refetch()}
          />
          <SidakTopParameters
            parameters={parameters}
            state={dashboardState}
            onRetry={() => void dashboard.refetch()}
          />
        </div>

        <SidakPageDirectory pages={sidakPages} />
      </div>
    </LeaderAccessGate>
  );
}
