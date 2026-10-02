import { useMemo } from "react";
import type { HeatmapDay } from "./SidakHeatmapCalendar";
import {
  buildHeatmapInsights,
  formatInsightDateLong,
  formatInsightDateShort,
} from "./heatmap-insights";

/**
 * Ringkasan insight heatmap. Angka selalu volume temuan; kalau tidak ada
 * temuan, seluruh section disembunyikan supaya tidak menambah noise di keadaan
 * kosong (kalender sudah menyampaikan pesannya).
 */

const DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const INTEGER = new Intl.NumberFormat("id-ID");

function InsightCard({
  id,
  label,
  value,
  detail,
}: {
  id: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div
      data-testid={`insight-${id}`}
      className="rounded-lg border border-border bg-background p-3"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {detail && (
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

export default function SidakHeatmapInsights({
  days,
}: {
  days: HeatmapDay[];
}) {
  const data = useMemo(() => buildHeatmapInsights(days), [days]);

  if (data.total === 0 || !data.busiestDay || !data.quietestActiveDay) {
    return null;
  }

  return (
    <section
      data-testid="heatmap-insights"
      aria-label="Insight heatmap"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">Insight</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ringkasan volume temuan pada tahun terpilih. Ini bukan tingkat
          kesalahan — tidak ada pembanding jumlah layanan.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InsightCard
          id="busiest-day"
          label="Hari tersibuk"
          value={formatInsightDateLong(data.busiestDay.date)}
          detail={`${INTEGER.format(data.busiestDay.count)} temuan`}
        />
        <InsightCard
          id="quietest-active-day"
          label="Hari aktif tersepi"
          value={formatInsightDateLong(data.quietestActiveDay.date)}
          detail={`${INTEGER.format(data.quietestActiveDay.count)} temuan`}
        />
        {data.busiestWeekday && (
          <InsightCard
            id="busiest-weekday"
            label="Hari dalam minggu tersibuk"
            value={data.busiestWeekday.label}
            detail={`${INTEGER.format(data.busiestWeekday.total)} temuan`}
          />
        )}
        {data.busiestMonth && (
          <InsightCard
            id="busiest-month"
            label="Bulan tertinggi"
            value={data.busiestMonth.label}
            detail={`${INTEGER.format(data.busiestMonth.total)} temuan`}
          />
        )}
        <InsightCard
          id="active-days"
          label="Hari aktif"
          value={INTEGER.format(data.activeDays)}
          detail={`dari ${INTEGER.format(data.activeDays + data.emptyDays)} hari`}
        />
        <InsightCard
          id="average"
          label="Rata-rata"
          value={DECIMAL.format(data.averagePerActiveDay ?? 0)}
          detail="temuan per hari aktif"
        />
        {data.activeRange && (
          <InsightCard
            id="active-range"
            label="Rentang aktif"
            value={`${formatInsightDateShort(data.activeRange.from)} – ${formatInsightDateShort(data.activeRange.to)}`}
            detail="tanggal aktif pertama–terakhir"
          />
        )}
      </div>
    </section>
  );
}
