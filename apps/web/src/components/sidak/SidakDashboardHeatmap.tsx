import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ServiceType, SidakHeatmapResponse } from "@trainers/types";
import { getErrorMessage } from "../../lib/api";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import {
  buildHeatmapInsights,
  formatInsightDateLong,
  MONTH_SHORT,
} from "./heatmap-insights";
import SidakDashboardPanel, { panelLinkClass } from "./SidakDashboardPanel";
import { SidakWeekdayBars } from "./SidakWeekdayBars";

interface Props {
  year: number;
  serviceType?: ServiceType;
  serviceLabel: string;
  folderId: string | null;
  folderLabel: string;
  startMonth: number | null;
  endMonth: number | null;
}

const INTEGER = new Intl.NumberFormat("id-ID");
const DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("id-ID", {
  style: "percent",
  maximumFractionDigits: 0,
});

export default function SidakDashboardHeatmap({
  year,
  serviceType,
  serviceLabel,
  folderId,
  folderLabel,
  startMonth,
  endMonth,
}: Props) {
  const [data, setData] = useState<SidakHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetchSidakHeatmap({
        mode: "agent",
        year,
        countBy: "parameter",
        serviceType,
        folderIds: folderId ? [folderId] : undefined,
        startMonth: startMonth ?? undefined,
        endMonth: endMonth ?? undefined,
      });
      if (generation === generationRef.current) setData(response);
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(getErrorMessage(cause, "Gagal memuat heatmap."));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [year, serviceType, folderId, startMonth, endMonth]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  const insights = useMemo(
    () => (data ? buildHeatmapInsights(data.days) : null),
    [data],
  );
  const weekdayTotals = insights?.weekdayTotals ?? new Array<number>(7).fill(0);
  const weekendTotal = weekdayTotals[5]! + weekdayTotals[6]!;
  const monthRange =
    startMonth && endMonth
      ? startMonth === endMonth
        ? `${MONTH_SHORT[startMonth - 1]} ${year}`
        : `${MONTH_SHORT[startMonth - 1]}–${MONTH_SHORT[endMonth - 1]} ${year}`
      : String(year);

  return (
    <SidakDashboardPanel
      id="sidak-dashboard-heatmap-title"
      title="Pola temuan mingguan"
      description={`${serviceLabel} · ${folderId ? folderLabel : "Semua tim"} · ${monthRange} · per tanggal layanan`}
      busy={loading}
      action={
        <Link to="/sidak/heatmap" className={panelLinkClass}>
          Lihat kalender lengkap
        </Link>
      }
    >
      {loading ? (
        <div aria-live="polite" data-testid="dashboard-heatmap-loading">
          <p className="sr-only">Memuat pola harian…</p>
          <div className="flex h-28 items-end gap-1.5 motion-safe:animate-pulse">
            {weekdayTotals.map((_, index) => (
              <div
                key={index}
                className="flex-1 rounded-t bg-muted"
                style={{ height: `${30 + ((index * 37) % 60)}%` }}
              />
            ))}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Heatmap tidak dapat dimuat.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[44px] max-w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Coba muat ulang heatmap
          </button>
        </div>
      ) : insights?.busiestDay ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-fg2">
              <span className="font-outfit text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-foreground tabular-nums">
                {INTEGER.format(insights.total)}
              </span>{" "}
              temuan pada rentang ini
            </p>
            <p className="text-sm text-foreground">
              <span className="font-semibold">Puncak:</span>{" "}
              {formatInsightDateLong(insights.busiestDay.date)} ·{" "}
              {INTEGER.format(insights.busiestDay.count)} temuan
            </p>
          </div>
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <SidakWeekdayBars totals={weekdayTotals} year={year} />
          </div>
          <ul
            aria-label="Statistik pola harian"
            className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4"
          >
            {(
              [
                {
                  label: "Hari dengan temuan",
                  value: `${INTEGER.format(insights.activeDays)} hari`,
                },
                {
                  label: "Rata-rata per hari aktif",
                  value: `${DECIMAL.format(insights.averagePerActiveDay ?? 0)} temuan`,
                },
                {
                  label: "Porsi akhir pekan",
                  value: PERCENT.format(weekendTotal / insights.total),
                  detail: `${INTEGER.format(weekendTotal)} dari ${INTEGER.format(insights.total)} temuan`,
                },
              ] as { label: string; value: string; detail?: string }[]
            ).map((stat) => (
              <li key={stat.label} className="min-w-0">
                <p className="text-xs leading-4 text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  {stat.value}
                </p>
                {stat.detail && (
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground tabular-nums">
                    {stat.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          Belum ada temuan pada rentang ini.
        </p>
      )}
      <p className="mt-auto pt-4 text-xs leading-5 text-muted-foreground">
        Volume temuan, bukan rate · filter tim dan bulan serta cakupan akses
        akun tetap berlaku.
      </p>
    </SidakDashboardPanel>
  );
}
