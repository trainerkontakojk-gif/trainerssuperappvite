import { Link } from "@tanstack/react-router";
import { Plus, Trophy } from "lucide-react";
import { isCapabilityAllowed } from "../../../lib/app-config";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button, buttonVariants } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { ActivityFeed } from "./ActivityFeed";
import { AttentionList } from "./AttentionList";
import { HomeHeader } from "./HomeHeader";
import { ServiceBreakdown } from "./ServiceBreakdown";
import { Shortcuts } from "./Shortcuts";
import { TrendCard } from "./TrendCard";
import { useDashboardTrend } from "./useDashboardTrend";

/**
 * Beranda admin/trainer/leader: Perlu tindakan → Tren temuan + Temuan per
 * layanan → Aktivitas terakhir + Pintasan. Tiap section memuat datanya
 * sendiri, jadi kegagalan satu section tidak mengosongkan section lain.
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
  const lastPeriod =
    trend.status === "ready" ? trend.trendMap.all.labels.at(-1) : undefined;

  return (
    <div className="home-page">
      <HomeHeader
        displayName={displayName}
        meta={lastPeriod ? `Periode QA terakhir: ${lastPeriod}` : null}
      >
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
            className={buttonVariants({ className: "min-h-[44px] gap-2" })}
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
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

      {trend.status === "loading" && (
        <div className="home-grid" aria-busy="true">
          <Skeleton className="h-[420px] w-full rounded-xl" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
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
      {trend.status === "ready" && (
        <div className="home-grid">
          <TrendCard trendMap={trend.trendMap} />
          <ServiceBreakdown trend={trend.trendMap.all} />
        </div>
      )}

      <div className={canReadActivity ? "home-grid" : undefined}>
        {canReadActivity && <ActivityFeed />}
        <Shortcuts role={role} />
      </div>
    </div>
  );
}
