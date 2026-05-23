import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return <div className="h-full w-full animate-pulse rounded-[1.5rem] bg-muted/10" />;
  }

  const chartData = labels.map((name, i) => {
    const row: Record<string, string | number> = { name };
    datasets.forEach((ds, di) => {
      row[`dataset_${di}`] = ds.data[i] ?? 0;
    });
    return row;
  });

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
          <defs>
            <linearGradient id="totalTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
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
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              fontSize: "12px",
              fontWeight: "500",
              color: "var(--foreground)",
            }}
          />

          {/* Parameter lines */}
          {showParameters &&
            datasets.map((ds, i) => {
              if (ds.isTotal) return null;
              if (isFiltered && ds.label !== filterLabel) return null;
              if (!isFiltered && hiddenKeys?.has(ds.label)) return null;
              const color = getColor(ds, i);
              return (
                <Area
                  key={`param-${i}`}
                  name={ds.label}
                  type="monotone"
                  dataKey={`dataset_${i}`}
                  stroke={color}
                  strokeWidth={isFiltered ? 4 : 2}
                  fill={color}
                  fillOpacity={isFiltered ? 0.3 : 0.15}
                  isAnimationActive={true}
                  animationDuration={1000}
                  dot={isFiltered ? { r: 4, fill: "hsl(var(--card))", strokeWidth: 2, stroke: color } : false}
                  connectNulls
                />
              );
            })}

          {/* Total line */}
          {datasets.map((ds, i) => {
            if (!ds.isTotal) return null;
            if (hideTotal) return null;
            if (isFiltered && ds.label !== filterLabel) return null;
            return (
              <Area
                key={`total-${i}`}
                name={ds.label}
                type="monotone"
                dataKey={`dataset_${i}`}
                stroke="hsl(var(--primary))"
                strokeWidth={4}
                fill="url(#totalTrendGradient)"
                fillOpacity={1}
                isAnimationActive={true}
                animationDuration={1500}
                dot={{ r: 4, fill: "hsl(var(--card))", strokeWidth: 2, stroke: "hsl(var(--primary))" }}
                activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                connectNulls
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
