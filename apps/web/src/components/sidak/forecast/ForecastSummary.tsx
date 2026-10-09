import { Loader2 } from "lucide-react";
import type { SidakForecastLookupResult } from "@trainers/types";
import { cn } from "cn";
import { forecastMethodLabel, safeLabel } from "../../../utils/forecastFormat";
import { FORECAST_STATUS, statusFromDirection } from "../forecast-status";

function dataStatusSentence(status?: SidakForecastLookupResult["status"]) {
  if (status === "fresh") return "Data terbaru siap dipakai.";
  if (status === "stale") return "Data berubah. Perbarui proyeksi.";
  if (status === "missing") return "Belum ada data proyeksi.";
  return "Menunggu data proyeksi.";
}

/** Ringkasan proyeksi layanan, ditampilkan inline di header grafik. */
export default function ForecastSummary({
  lookup,
  horizonMonths,
}: {
  lookup: SidakForecastLookupResult | null;
  horizonMonths: number;
}) {
  const series = lookup?.snapshot?.series.total ?? null;
  const meta = series ? FORECAST_STATUS[statusFromDirection(series.summary.direction)] : null;
  const Icon = meta?.icon;
  const lastPeriod = series?.historical.at(-1)?.label;

  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="forecast-summary">
      <p
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold",
          meta?.textClass ?? "text-foreground",
        )}
      >
        {Icon ? (
          <Icon aria-hidden="true" className="size-4" />
        ) : (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        )}
        <span>{meta?.label ?? "Menunggu data"}</span>
        <span className="font-normal text-muted-foreground">
          {meta?.hint ?? "Arah temuan pada layanan yang dipilih."}
        </span>
      </p>
      <p className="text-sm text-foreground">{dataStatusSentence(lookup?.status)}</p>
      <p className="text-[12px] leading-5 text-muted-foreground">
        {series
          ? [
              forecastMethodLabel(series.summary.method),
              `${series.summary.sourcePointCount ?? 0} titik data`,
              `proyeksi ${horizonMonths} bulan`,
              `periode terakhir ${safeLabel(lastPeriod)}`,
            ].join(" · ")
          : "Belum ada series forecast."}
      </p>
    </div>
  );
}
