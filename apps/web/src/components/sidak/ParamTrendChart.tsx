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
                  strokeWidth={isFiltered ? 2.5 : 1.5}
                  fill={color}
                  fillOpacity={isFiltered ? 0.15 : 0.05}
                  isAnimationActive={true}
                  animationDuration={1000}
                  dot={isFiltered ? { r: 3.5, fill: "var(--card)", strokeWidth: 1.5, stroke: color } : false}
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
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
