import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { KpiDeltaViewModel } from "../../lib/sidak-kpi-delta";

interface Props {
  label: string;
  value: string | number;
  delta: KpiDeltaViewModel | null;
  desc?: string;
  sparklineData?: { value: number }[];
}

/**
 * One indicator cell inside the dashboard KPI strip. The strip owns the
 * border and dividers, so the cell itself carries no card chrome.
 */
export default function KpiCard({
  label,
  value,
  delta,
  desc,
  sparklineData,
}: Props) {
  let DeltaIcon: LucideIcon | null = null;
  let deltaColorClass = "text-muted-foreground";
  if (delta !== null && delta.direction !== "flat") {
    DeltaIcon = delta.direction === "up" ? ArrowUpRight : ArrowDownRight;
    deltaColorClass =
      delta.tone === "good"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-rose-700 dark:text-rose-400";
  } else if (delta !== null) {
    DeltaIcon = Minus;
  }

  return (
    <article className="flex min-w-0 flex-col gap-1 p-4 @[640px]/dashboard:p-5">
      <p className="text-sm font-medium text-fg2">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="font-outfit text-[1.625rem] leading-none @[640px]/dashboard:text-[2rem] font-bold tracking-[-0.03em] text-foreground tabular-nums">
          {value}
        </p>
        {sparklineData && sparklineData.length > 1 && (
          <div
            aria-hidden="true"
            className="hidden h-8 w-20 shrink-0 @[640px]/dashboard:block"
          >
            <ResponsiveContainer width="100%" height="100%" minHeight={0}>
              <AreaChart
                data={sparklineData}
                margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
              >
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--fg2)"
                  strokeWidth={1.5}
                  fill="var(--fg2)"
                  fillOpacity={0.08}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs">
        {delta ? (
          <span
            className="inline-flex flex-wrap items-center gap-x-1.5"
            title={`Sekarang ${delta.current}, sebelumnya ${delta.previous}`}
          >
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${deltaColorClass}`}
            >
              {DeltaIcon && (
                <DeltaIcon className="size-3.5" aria-hidden="true" />
              )}
              {delta.text}
            </span>
            <span className="text-muted-foreground">
              {delta.comparisonLabel}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Belum ada pembanding</span>
        )}
      </div>
      {desc && (
        <p className="text-xs leading-5 text-muted-foreground">{desc}</p>
      )}
    </article>
  );
}
