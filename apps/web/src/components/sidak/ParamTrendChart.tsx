import { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceArea,
} from "recharts";
import type { SidakForecastSeries } from "@trainers/types";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendDataset {
  label: string;
  data: number[];
  isTotal?: boolean;
}

interface Props {
  labels: string[];
  datasets: TrendDataset[];
  showParameters?: boolean;
  hiddenKeys?: Set<string>;
  hideTotal?: boolean;
  filterLabel?: string;
  isFiltered?: boolean;
  colorMap?: Record<string, string>;
  forecastResult?: SidakForecastSeries | null;
  forecastResults?: SidakForecastSeries[];
}

const VALUE_FORMAT = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

type ChartRow = Record<string, string | number | null>;

interface PointLabelProps {
  x?: number | string;
  y?: number | string;
  value?: unknown;
  index?: number;
}

/**
 * Indeks titik aktual yang diberi angka: bulan terakhir, tertinggi dan
 * terendah. Angka di setiap titik membuat grafik sesak; nilai lain ada di tooltip.
 */
function keyPointIndexes(rows: ChartRow[], dataKey: string) {
  const points = rows.flatMap((row, index) =>
    row.isForecast !== 1 && typeof row[dataKey] === "number"
      ? [{ index, value: row[dataKey] as number }]
      : [],
  );
  if (points.length === 0) return new Set<number>();
  const pick = (better: (a: number, b: number) => boolean) =>
    points.reduce((best, point) => (better(point.value, best.value) ? point : best))
      .index;
  return new Set([
    points[points.length - 1].index,
    pick((a, b) => a > b),
    pick((a, b) => a < b),
  ]);
}

/**
 * Angka di atas titik. Aktual: hanya titik kunci (lihat keyPointIndexes).
 * Proyeksi: hanya bulan mendatang; bulan terakhir sudah berlabel aktualnya.
 */
function pointLabel(
  kind: "actual" | "forecast",
  rows: ChartRow[],
  dataKey: string,
) {
  const labelled = kind === "actual" ? keyPointIndexes(rows, dataKey) : null;
  return function PointLabel({ x, y, value, index }: PointLabelProps) {
    if (typeof value !== "number" || x === undefined || y === undefined) {
      return null;
    }
    if (kind === "forecast" && rows[index ?? -1]?.isForecast !== 1) return null;
    if (labelled && !labelled.has(index ?? -1)) return null;
    return (
      <text
        data-chart-label={kind}
        x={Number(x)}
        y={Number(y) - 10}
        textAnchor="middle"
        fontSize={12}
        fontWeight={kind === "actual" ? 600 : 500}
        fill={
          kind === "actual" ? "var(--foreground)" : "var(--muted-foreground)"
        }
      >
        {VALUE_FORMAT.format(value)}
      </text>
    );
  };
}

export default function ParamTrendChart({
  labels,
  datasets,
  showParameters,
  hiddenKeys,
  hideTotal,
  filterLabel,
  isFiltered,
  colorMap,
  forecastResult,
  forecastResults,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const element = chartContainerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerReady(rect.width > 0 && rect.height > 0);
    };

    if (typeof ResizeObserver === "undefined") {
      setContainerReady(true);
      return;
    }

    const observer = new ResizeObserver(updateSize);
    updateSize();
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const normalizedForecastResults = useMemo(
    () =>
      forecastResults ??
      (forecastResult ? [forecastResult] : []),
    [forecastResult, forecastResults],
  );

  const chartData = useMemo(() => {
    const points = labels.map((name, i) => {
      const row: Record<string, string | number | null> = { name };
      datasets.forEach((ds, di) => {
        row[`actual_dataset_${di}`] = ds.data[i] ?? 0;
        row[`forecast_dataset_${di}`] = null;
      });
      return row;
    });

    if (normalizedForecastResults.length > 0) {
      const futureRows = new Map<string, Record<string, string | number | null>>();

      for (const series of normalizedForecastResults) {
        const forecastDatasetIndex = datasets.findIndex(
          (ds) =>
            (series.scope.type === "total" && ds.isTotal) ||
            ds.label === series.scope.parameterId,
        );

        if (forecastDatasetIndex < 0) continue;

        if (points.length > 0) {
          const lastActual = points[points.length - 1];
          lastActual[`forecast_dataset_${forecastDatasetIndex}`] =
            lastActual[`actual_dataset_${forecastDatasetIndex}`];
        }

        for (const forecastPoint of series.forecast) {
          const existingRow = futureRows.get(forecastPoint.label);
          const row =
            existingRow ??
            ({ name: forecastPoint.label, isForecast: 1 } as Record<
              string,
              string | number | null
            >);
          if (!existingRow) {
            datasets.forEach((_ds, di) => {
              row[`actual_dataset_${di}`] = null;
              row[`forecast_dataset_${di}`] = null;
            });
            futureRows.set(forecastPoint.label, row);
          }

          row[`forecast_dataset_${forecastDatasetIndex}`] = forecastPoint.value;
        }
      }

      return [...points, ...Array.from(futureRows.values())];
    }

    return points;
  }, [labels, datasets, normalizedForecastResults]);

  const forecastedDatasetKeys = useMemo(
    () =>
      new Set(
        normalizedForecastResults.map((series) =>
          series.scope.type === "total"
            ? "__total__"
            : (series.scope.parameterId ?? ""),
        ),
      ),
    [normalizedForecastResults],
  );

  const projectionRange = useMemo(() => {
    const firstForecast = chartData.findIndex((row) => row.isForecast === 1);
    if (firstForecast < 1) return null;
    return {
      from: String(chartData[firstForecast - 1].name),
      to: String(chartData[chartData.length - 1].name),
    };
  }, [chartData]);

  if (!mounted || !containerReady) {
    return (
      <div
        ref={chartContainerRef}
        className="h-full w-full rounded-xl bg-muted/10"
        aria-hidden="true"
      >
        <Skeleton className="size-full rounded-xl motion-reduce:animate-none" />
      </div>
    );
  }

  if (!chartData.length) return null;

  const defaultColors = [
    "var(--chart-green)",
    "var(--chart-amber)",
    "var(--chart-blue)",
    "var(--chart-red)",
    "var(--chart-violet)",
    "var(--chart-cyan)",
  ];
  const getColor = (ds: TrendDataset, i: number) => {
    if (colorMap && colorMap[ds.label]) return colorMap[ds.label];
    return defaultColors[i % defaultColors.length];
  };
  const animationEnabled = !prefersReducedMotion;

  return (
    <div
      ref={chartContainerRef}
      className="flex h-full w-full flex-col animate-in fade-in duration-700 motion-reduce:animate-none"
    >
      <div className="min-h-0 flex-1">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={0}
        initialDimension={{ width: 1, height: 1 }}
      >
        <AreaChart data={chartData} margin={{ top: 24, right: 16, left: -20, bottom: 0 }}>
          {projectionRange ? (
            <ReferenceArea
              x1={projectionRange.from}
              x2={projectionRange.to}
              fill="var(--muted)"
              fillOpacity={0.5}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ) : null}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--card)",
              boxShadow: "none",
              fontSize: "12px",
              fontWeight: "500",
              color: "var(--foreground)",
            }}
            formatter={(value: any, name: any, props: any) => {
              const isForecastSeries = String(props.dataKey).startsWith("forecast_");
              const isForecast = props.payload.isForecast === 1;
              if (isForecastSeries && !isForecast) return null;
              return [
                <span key="val" className="flex items-center gap-1.5">
                  {value} {isForecast && <span className="rounded bg-primary/20 px-1 py-0.5 text-xs font-bold text-primary">Prediksi</span>}
                </span>,
                name
              ];
            }}
          />

          {/* Parameter lines */}
          {showParameters &&
            datasets.map((ds, i) => {
              if (ds.isTotal) return null;
              if (isFiltered && ds.label !== filterLabel) return null;
              if (!isFiltered && hiddenKeys?.has(ds.label)) return null;
              const color = getColor(ds, i);
              const isForecastingThis = forecastedDatasetKeys.has(ds.label);

              return (
                <g key={`param-group-${i}`}>
                  <Area
                    key={`param-${i}`}
                    name={ds.label}
                    type="monotone"
                    dataKey={`actual_dataset_${i}`}
                    stroke={color}
                    strokeWidth={isFiltered ? 2.5 : 1.5}
                    fill={color}
                    fillOpacity={isFiltered ? 0.15 : 0.05}
                    isAnimationActive={animationEnabled}
                    animationDuration={1000}
                    dot={isFiltered || isForecastingThis ? { r: 3.5, fill: "var(--card)", strokeWidth: 1.5, stroke: color } : false}
                    connectNulls
                  >
                    {isFiltered || isForecastingThis ? (
                      <LabelList
                        dataKey={`actual_dataset_${i}`}
                        content={pointLabel("actual", chartData, `actual_dataset_${i}`)}
                      />
                    ) : null}
                  </Area>
                  {isForecastingThis && (
                    <Area
                      key={`param-forecast-${i}`}
                      name={`Prediksi ${ds.label}`}
                      type="monotone"
                      dataKey={`forecast_dataset_${i}`}
                      stroke={color}
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      fill="transparent"
                      isAnimationActive={animationEnabled}
                      animationDuration={1000}
                      dot={{ r: 3, fill: "var(--card)", strokeWidth: 1, stroke: color }}
                    >
                      <LabelList
                        dataKey={`forecast_dataset_${i}`}
                        content={pointLabel("forecast", chartData, `forecast_dataset_${i}`)}
                      />
                    </Area>
                  )}
                </g>
              );
            })}

          {/* Total line */}
          {datasets.map((ds, i) => {
            if (!ds.isTotal) return null;
            if (hideTotal) return null;
            if (isFiltered && ds.label !== filterLabel) return null;
            const isForecastingTotal = forecastedDatasetKeys.has("__total__");

            return (
              <g key={`total-group-${i}`}>
                <Area
                  key={`total-${i}`}
                  name={ds.label}
                  type="monotone"
                  dataKey={`actual_dataset_${i}`}
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="var(--primary)"
                  fillOpacity={0.06}
                  isAnimationActive={animationEnabled}
                  animationDuration={1500}
                  dot={{ r: 3.5, fill: "var(--card)", strokeWidth: 1.5, stroke: "var(--primary)" }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: "var(--primary)" }}
                  connectNulls
                >
                  <LabelList
                    dataKey={`actual_dataset_${i}`}
                    content={pointLabel("actual", chartData, `actual_dataset_${i}`)}
                  />
                </Area>
                {isForecastingTotal && (
                  <Area
                    key={`total-forecast-${i}`}
                    name={`Prediksi ${ds.label}`}
                    type="monotone"
                    dataKey={`forecast_dataset_${i}`}
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    fill="transparent"
                    isAnimationActive={animationEnabled}
                    animationDuration={1500}
                    dot={{ r: 3, fill: "var(--card)", strokeWidth: 1, stroke: "var(--primary)" }}
                  >
                    <LabelList
                      dataKey={`forecast_dataset_${i}`}
                      content={pointLabel("forecast", chartData, `forecast_dataset_${i}`)}
                    />
                  </Area>
                )}
              </g>
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      {projectionRange ? (
        <p
          data-testid="chart-legend"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-foreground" />
            Aktual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t-2 border-dashed border-muted-foreground"
            />
            Proyeksi
          </span>
        </p>
      ) : null}
    </div>
  );
}
