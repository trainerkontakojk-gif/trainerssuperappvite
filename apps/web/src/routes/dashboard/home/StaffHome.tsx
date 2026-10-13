import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { lazy, Suspense } from "react";
import { isCapabilityAllowed } from "../../../lib/app-config";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button, buttonVariants } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { ActivityFeed } from "./ActivityFeed";
import { AttentionList } from "./AttentionList";
import { HomeHeader } from "./HomeHeader";
import { Shortcuts } from "./Shortcuts";
import { useDashboardTrend } from "./useDashboardTrend";

const DashboardTrendPanel = lazy(() => import("../DashboardTrendPanel"));

function formatSummaryValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "—";
}

/**
 * Beranda admin/trainer/leader: Perlu tindakan → Tren temuan (ringkasan per
 * layanan ada di dalam panelnya) → Aktivitas terakhir + Pintasan. Tiap section memuat datanya sendiri, jadi
 * kegagalan satu section tidak mengosongkan section lain.
 */
export function StaffHome({
  role,
  displayName,
}: {
  role: string | null | undefined;
  displayName: string;
}) {
  const trend = useDashboardTrend();
  const canManageSidak = isCapabilityAllowed(role, "sidak.config.manage");
  const canReadActivity = isCapabilityAllowed(role, "admin.activityLogs.read");

  return (
    <div className="home-page">
      <HomeHeader displayName={displayName}>
        {canManageSidak ? (
          <Link
            to={"/sidak/input" as any}
            className={buttonVariants({ className: "min-h-[44px] gap-2" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Input temuan
          </Link>
        ) : (
          <Link
            to={"/sidak/ranking" as any}
            className={buttonVariants({ className: "min-h-[44px]" })}
          >
            Ranking tim
          </Link>
        )}
        {isCapabilityAllowed(role, "tna.read") && (
          <Link
            to={"/tna" as any}
            className={buttonVariants({
              variant: "outline",
              className: "min-h-[44px]",
            })}
          >
            Rencana TNA
          </Link>
        )}
      </HomeHeader>

      <AttentionList />

      <div className="home-panel min-w-0">
        {trend.status === "loading" && (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-[300px] w-full" />
            <span className="sr-only">Memuat tren temuan</span>
          </div>
        )}
        {trend.status === "error" && (
          <QaStatePanel
            type="error"
            compact
            title="Tren temuan belum dapat dimuat"
            description="Periksa koneksi Anda, lalu coba lagi."
            action={
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => void trend.reload()}
              >
                Coba lagi
              </Button>
            }
          />
        )}
        {trend.status === "ready" && trend.serviceTrendMap && (
          <>
            <Suspense
              fallback={
                <div className="flex h-[360px] w-full items-center justify-center">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <span className="sr-only">Memuat tren temuan</span>
                </div>
              }
            >
              <DashboardTrendPanel
                serviceTrendMap={trend.serviceTrendMap}
                availableYears={trend.availableYears}
                selectedYear={trend.selectedYear}
                trendStartMonth={trend.trendStartMonth}
                trendEndMonth={trend.trendEndMonth}
                trendLoading={trend.trendLoading}
                localTrendData={trend.localTrendData}
                onYearChange={trend.handleYearChange}
                onRangeChange={trend.handleRangeChange}
              />
            </Suspense>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-[12px] text-fg2">
              <div className="flex items-baseline gap-1.5">
                <dt>Agen diaudit</dt>
                <dd className="text-sm font-semibold tabular-nums text-fg">
                  {formatSummaryValue(
                    trend.activeTrend?.totalSummary.auditedAgents,
                  )}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt>Layanan aktif</dt>
                <dd className="text-sm font-semibold tabular-nums text-fg">
                  {formatSummaryValue(
                    trend.activeTrend?.totalSummary.activeServiceCount,
                  )}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <div
        className={
          canReadActivity
            ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
            : "grid gap-6"
        }
      >
        {canReadActivity && <ActivityFeed />}
        <Shortcuts role={role} />
      </div>
    </div>
  );
}
