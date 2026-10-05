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

  const year = data.busiestDay.date.slice(0, 4);

  return (
    <section
      data-testid="heatmap-insights"
      aria-label="Insight heatmap"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Pola temuan ketidaksesuaian
        </h2>
        <p className="mt-1 max-w-[75ch] text-sm text-foreground">
          Sepanjang {year} tercatat{" "}
          <span className="font-semibold">
            {INTEGER.format(data.total)} temuan
          </span>{" "}
          pada {INTEGER.format(data.activeDays)} hari. Puncaknya{" "}
          <span className="font-semibold">
            {formatInsightDateLong(data.busiestDay.date)}
          </span>{" "}
          dengan {INTEGER.format(data.busiestDay.count)} temuan.
          {data.busiestWeekday && data.busiestMonth ? (
            <>
              {" "}
              Temuan paling banyak jatuh pada hari{" "}
              {data.busiestWeekday.label} dan bulan {data.busiestMonth.label}.
            </>
          ) : null}
        </p>
        <p className="mt-1 max-w-[75ch] text-xs text-muted-foreground">
          Angka ini jumlah temuan, bukan tingkat kesalahan, karena belum
          dibandingkan dengan jumlah layanan atau audit. Hari atau bulan dengan
          audit lebih banyak wajar mencatat temuan lebih banyak.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InsightCard
          id="busiest-day"
          label="Tanggal temuan terbanyak"
          value={formatInsightDateLong(data.busiestDay.date)}
          detail={`${INTEGER.format(data.busiestDay.count)} temuan`}
        />
        <InsightCard
          id="quietest-active-day"
          label="Tanggal temuan paling sedikit"
          value={formatInsightDateLong(data.quietestActiveDay.date)}
          detail={`${INTEGER.format(data.quietestActiveDay.count)} temuan · dihitung dari hari yang ada temuannya`}
        />
        {data.busiestWeekday && (
          <InsightCard
            id="busiest-weekday"
            label="Hari terbanyak dalam sepekan"
            value={data.busiestWeekday.label}
            detail={`${INTEGER.format(data.busiestWeekday.total)} temuan dari semua hari ${data.busiestWeekday.label}`}
          />
        )}
        {data.busiestMonth && (
          <InsightCard
            id="busiest-month"
            label="Bulan terbanyak"
            value={data.busiestMonth.label}
            detail={`${INTEGER.format(data.busiestMonth.total)} temuan`}
          />
        )}
        <InsightCard
          id="active-days"
          label="Hari dengan temuan"
          value={`${INTEGER.format(data.activeDays)} hari`}
          detail={`dari ${INTEGER.format(data.activeDays + data.emptyDays)} hari kalender`}
        />
        <InsightCard
          id="average"
          label="Rata-rata harian"
          value={`${DECIMAL.format(data.averagePerActiveDay ?? 0)} temuan`}
          detail="per hari yang ada temuannya"
        />
        {data.activeRange && (
          <InsightCard
            id="active-range"
            label="Rentang temuan"
            value={`${formatInsightDateShort(data.activeRange.from)} – ${formatInsightDateShort(data.activeRange.to)}`}
            detail="dari temuan pertama sampai terakhir"
          />
        )}
      </div>
    </section>
  );
}
