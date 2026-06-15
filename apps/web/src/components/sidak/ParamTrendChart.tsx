import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { SidakForecastSeries } from "@trainers/types";

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
  useEffect(() => { setMounted(true); }, []);

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

  if (!mounted) {
    return <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/10" />;
  }

  if (!chartData.length) return null;

  const defaultColors = ["#0F766E", "#D97706", "#2563EB", "#BE123C", "#4338CA", "#0891B2"];
  const getColor = (ds: TrendDataset, i: number) => {
    if (colorMap && colorMap[ds.label]) return colorMap[ds.label];
    return defaultColors[i % defaultColors.length];
  };

  return (
    <div className="h-full w-full animate-in fade-in duration-700">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
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
                  {value} {isForecast && <span className="text-[9px] px-1 py-0.5 bg-primary/20 text-primary rounded font-bold uppercase">Prediksi</span>}
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
                    isAnimationActive={true}
                    animationDuration={1000}
                    dot={isFiltered ? { r: 3.5, fill: "var(--card)", strokeWidth: 1.5, stroke: color } : false}
                    connectNulls
                  />
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
                      isAnimationActive={true}
                      animationDuration={1000}
                      dot={{ r: 3, fill: "var(--card)", strokeWidth: 1, stroke: color }}
                    />
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
                  isAnimationActive={true}
                  animationDuration={1500}
                  dot={{ r: 3.5, fill: "var(--card)", strokeWidth: 1.5, stroke: "var(--primary)" }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: "var(--primary)" }}
                  connectNulls
                />
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
                    isAnimationActive={true}
                    animationDuration={1500}
                    dot={{ r: 3, fill: "var(--card)", strokeWidth: 1, stroke: "var(--primary)" }}
                  />
                )}
              </g>
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
