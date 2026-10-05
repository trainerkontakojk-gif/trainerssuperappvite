import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ServiceType, SidakHeatmapResponse } from "@trainers/types";
import { getErrorMessage } from "../../lib/api";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import {
  MONTH_SHORT,
  buildHeatmapInsights,
  formatInsightDateLong,
} from "./heatmap-insights";
import SidakDashboardPanel, { panelLinkClass } from "./SidakDashboardPanel";

interface Props {
  year: number;
  serviceType?: ServiceType;
  serviceLabel: string;
}

const INTEGER = new Intl.NumberFormat("id-ID");
const DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export default function SidakDashboardHeatmap({
  year,
  serviceType,
  serviceLabel,
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
      });
      if (generation === generationRef.current) setData(response);
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(getErrorMessage(cause, "Gagal memuat heatmap."));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [year, serviceType]);

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
  const monthTotals = useMemo(() => {
    const totals = new Array<number>(12).fill(0);
    for (const day of data?.days ?? []) {
      const month = Number(day.date.slice(5, 7));
      if (month >= 1 && month <= 12) totals[month - 1] += day.count;
    }
    return totals;
  }, [data]);
  const maxMonth = Math.max(...monthTotals);

  return (
    <SidakDashboardPanel
      id="sidak-dashboard-heatmap-title"
      title="Pola temuan tahunan"
      description={`${serviceLabel} · ${year} · per tanggal layanan`}
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
            {monthTotals.map((_, index) => (
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
              temuan sepanjang {year}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-semibold">Puncak:</span>{" "}
              {formatInsightDateLong(insights.busiestDay.date)} ·{" "}
              {INTEGER.format(insights.busiestDay.count)} temuan
            </p>
          </div>
          <div
            role="img"
            aria-label={`Temuan per bulan ${year}: ${monthTotals
              .map((total, index) => `${MONTH_SHORT[index]}: ${total} temuan`)
              .join(", ")}`}
            className="mt-5 flex min-h-0 flex-1 flex-col"
          >
            <div className="relative min-h-28 flex-1 border-b border-border">
              <div className="absolute inset-0 flex items-end gap-1.5">
                {monthTotals.map((total, index) => (
                  <div
                    key={MONTH_SHORT[index]}
                    title={`${MONTH_SHORT[index]} ${year}: ${INTEGER.format(total)} temuan`}
                    className={`flex-1 rounded-t-[3px] ${
                      total === maxMonth ? "bg-foreground" : "bg-foreground/25"
                    }`}
                    style={{
                      height:
                        total > 0
                          ? `${Math.max(4, (total / maxMonth) * 100)}%`
                          : "2px",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex gap-1.5 text-center text-[11px] text-muted-foreground">
              {MONTH_SHORT.map((label) => (
                <span key={label} className="flex-1">
                  <span className="@[480px]/dashboard:hidden">{label[0]}</span>
                  <span className="hidden @[480px]/dashboard:inline">
                    {label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <ul
            aria-label="Statistik pola harian"
            className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4"
          >
            {[
              {
                label: "Hari dengan temuan",
                value: `${INTEGER.format(insights.activeDays)} hari`,
              },
              {
                label: "Rata-rata per hari aktif",
                value: `${DECIMAL.format(insights.averagePerActiveDay ?? 0)} temuan`,
              },
              {
                label: "Hari tersibuk (volume)",
                value: insights.busiestWeekday
                  ? `${insights.busiestWeekday.label} · ${INTEGER.format(insights.busiestWeekday.total)} temuan`
                  : "—",
              },
            ].map((stat) => (
              <li key={stat.label} className="min-w-0">
                <p className="text-xs leading-4 text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  {stat.value}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          Belum ada temuan pada heatmap tahun {year}.
        </p>
      )}
      <p className="mt-auto pt-4 text-xs leading-5 text-muted-foreground">
        Tahun penuh · filter tim/bulan tidak berlaku · cakupan akses akun tetap
        berlaku.
      </p>
    </SidakDashboardPanel>
  );
}
