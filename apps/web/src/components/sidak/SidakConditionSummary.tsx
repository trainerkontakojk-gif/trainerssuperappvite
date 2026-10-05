import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type {
  DashboardData,
  SidakForecastLookupStatus,
  SidakForecastSummary,
} from "@trainers/types";
import { buildKpiDelta } from "../../lib/sidak-kpi-delta";
import { ForecastActionButton } from "./ForecastActionButton";

interface ForecastState {
  status: SidakForecastLookupStatus;
  loading: boolean;
  summary: SidakForecastSummary | null;
  horizonMonths: number;
  hasEnoughPeriods: boolean;
  onUpdate: () => void;
}

interface Props {
  data: DashboardData;
  forecast: ForecastState;
}

const COUNT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const SIGNED = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
  signDisplay: "always",
});
const CONFIDENCE_LABEL = {
  high: "tinggi",
  medium: "sedang",
  low: "rendah",
} as const;

const headingClass = "text-sm font-medium text-fg2";
const figureClass =
  "font-outfit text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-foreground tabular-nums";

function LatestPeriod({ data }: { data: DashboardData }) {
  const points = data.sparklines["total-defects"] ?? [];
  const previous = points.at(-2);
  const latest = points.at(-1);
  const delta =
    previous && latest
      ? buildKpiDelta({
          current: latest.value,
          previous: previous.value,
          previousLabel: previous.label,
          unit: "relative-percent",
          lowerIsBetter: true,
        })
      : null;
  const comparison = delta
    ? delta.direction === "down"
      ? `${delta.magnitude.toFixed(1)}% lebih sedikit dari ${previous?.label}.`
      : delta.direction === "up"
        ? `${delta.magnitude.toFixed(1)}% lebih banyak dari ${previous?.label}.`
        : `Sama dengan ${previous?.label}.`
    : previous
      ? `Periode sebelumnya ${previous.label}: 0 temuan; persentase tidak dihitung.`
      : "Pembanding periode belum tersedia.";
  const toneClass =
    delta?.direction === "down"
      ? "text-emerald-700 dark:text-emerald-400"
      : delta?.direction === "up"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground";

  return (
    <div className="min-w-0 p-4 sm:p-5">
      <h3 className={headingClass}>Periode terbaru</h3>
      {latest ? (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className={figureClass}>{COUNT.format(latest.value)}</span>
            <span className="text-sm text-fg2">temuan</span>
            <span className="text-sm font-semibold text-foreground">
              {latest.label}
            </span>
          </p>
          <p className={`mt-2 text-sm font-medium ${toneClass}`}>
            {comparison}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Perubahan jumlah, bukan tingkat temuan.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Belum ada data periode terbaru.
        </p>
      )}
    </div>
  );
}

function CriticalShare({ data }: { data: DashboardData }) {
  const severity = data.donutData;
  const hasData = severity && severity.total > 0;
  const share = hasData ? (severity.critical / severity.total) * 100 : 0;

  return (
    <div className="min-w-0 p-4 sm:p-5">
      <h3 className={headingClass}>Temuan kritikal</h3>
      {hasData ? (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className={figureClass}>{share.toFixed(1)}%</span>
            <span className="text-sm text-fg2">
              {COUNT.format(severity.critical)} dari{" "}
              {COUNT.format(severity.total)} temuan berkategori
            </span>
          </p>
          <div
            role="img"
            aria-label={`${severity.critical} kritikal, ${severity.nonCritical} non-kritikal`}
            className="mt-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          >
            <span
              className="h-full rounded-l-full bg-module-sidak"
              style={{ width: `${share}%` }}
            />
            <span className="h-full flex-1 rounded-r-full bg-fg2/30" />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg2">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-module-sidak"
              />
              {COUNT.format(severity.critical)} kritikal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-fg2/30"
              />
              {COUNT.format(severity.nonCritical)} non-kritikal
            </span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Belum ada temuan berkategori.
        </p>
      )}
    </div>
  );
}

function Forecast({ forecast }: { forecast: ForecastState }) {
  const { summary } = forecast;
  const DirectionIcon =
    summary?.direction === "up"
      ? ArrowUpRight
      : summary?.direction === "down"
        ? ArrowDownRight
        : Minus;
  const directionLabel =
    summary?.direction === "up"
      ? "Meningkat"
      : summary?.direction === "down"
        ? "Menurun"
        : "Stabil";
  const toneClass =
    summary?.direction === "up"
      ? "text-rose-700 dark:text-rose-400"
      : summary?.direction === "down"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";
  const change = summary
    ? summary.direction === "stable"
      ? `Tidak ada perubahan berarti dalam ${forecast.horizonMonths} bulan`
      : `${SIGNED.format(summary.projectedChange)} temuan${
          summary.projectedChangePercent === null
            ? ""
            : ` (${SIGNED.format(summary.projectedChangePercent)}%)`
        } dalam ${forecast.horizonMonths} bulan`
    : null;

  return (
    <section
      aria-labelledby="sidak-dashboard-forecast-title"
      aria-busy={forecast.loading}
      className="flex min-w-0 flex-col p-4 sm:p-5"
    >
      <h3 id="sidak-dashboard-forecast-title" className={headingClass}>
        Perkiraan temuan
      </h3>
      {forecast.loading && !summary ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Memuat forecast untuk filter ini…
        </p>
      ) : summary ? (
        <>
          <p
            className={`mt-3 inline-flex items-center gap-1.5 ${figureClass} ${toneClass}`}
          >
            <DirectionIcon aria-hidden="true" className="size-6 shrink-0" />
            <span>{directionLabel}</span>
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{change}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Kepercayaan {CONFIDENCE_LABEL[summary.confidence]}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {forecast.hasEnoughPeriods
            ? "Belum ada forecast untuk filter ini."
            : "Forecast belum tersedia: diperlukan setidaknya dua periode untuk filter ini."}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <ForecastActionButton
          status={forecast.status}
          loading={forecast.loading}
          disabled={forecast.loading || !forecast.hasEnoughPeriods}
          onClick={forecast.onUpdate}
        />
        <Link
          to="/sidak/forecast"
          className="inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Analisis lengkap
        </Link>
      </div>
    </section>
  );
}

export default function SidakConditionSummary({ data, forecast }: Props) {
  return (
    <section
      data-dashboard-panel
      aria-labelledby="sidak-condition-summary-title"
      className="min-w-0 rounded-xl border border-border bg-surface-elevated"
    >
      <h2 id="sidak-condition-summary-title" className="sr-only">
        Ringkasan temuan
      </h2>
      <div className="grid divide-y divide-border @[720px]/dashboard:grid-cols-3 @[720px]/dashboard:divide-x @[720px]/dashboard:divide-y-0">
        <LatestPeriod data={data} />
        <CriticalShare data={data} />
        <Forecast forecast={forecast} />
      </div>
    </section>
  );
}
