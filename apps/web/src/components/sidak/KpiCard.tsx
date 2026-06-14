import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { KpiDeltaViewModel } from "../../lib/sidak-kpi-delta";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  delta: KpiDeltaViewModel | null;
  desc?: string;
  sparklineData?: { value: number }[];
}

const COLOR_MAP: Record<
  string,
  {
    sparkline: string;
  }
> = {
  orange: {
    sparkline: "#f97316", // orange-500
  },
  red: {
    sparkline: "#f43f5e", // rose-500
  },
  blue: {
    sparkline: "#3b82f6", // blue-500
  },
  emerald: {
    sparkline: "#10b981", // emerald-500
  },
};

export default function KpiCard({ label, value, icon: Icon, color, delta, desc, sparklineData }: Props) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;

  let DeltaIcon: LucideIcon | null = null;
  let deltaColorClass = "";
  if (delta !== null) {
    if (delta.direction === "flat") {
      DeltaIcon = Minus;
      deltaColorClass = "text-muted-foreground";
    } else if (delta.tone === "good") {
      deltaColorClass = "text-emerald-500";
      DeltaIcon = delta.direction === "up" ? ArrowUpRight : ArrowDownRight;
    } else {
      deltaColorClass = "text-rose-500";
      DeltaIcon = delta.direction === "up" ? ArrowUpRight : ArrowDownRight;
    }
  }

  return (
    <article className="relative flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-foreground/20">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

        {delta ? (
          <div
            className="inline-flex flex-col items-end text-right"
            title={`Sekarang ${delta.current}, sebelumnya ${delta.previous}`}
          >
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deltaColorClass}`}>
              {DeltaIcon && <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {delta.text}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
              {delta.comparisonLabel}
            </span>
          </div>
        ) : (
          <div className="text-right text-xs font-medium text-muted-foreground">
            Belum ada pembanding
          </div>
        )}
      </div>

      <div className="relative z-10 mt-6">
        <p className="text-sm font-medium text-muted-foreground">
          {label}
        </p>
        <p className="font-outfit mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        {desc && <p className="mt-2 max-w-[18rem] text-xs text-muted-foreground leading-relaxed">{desc}</p>}
      </div>

      {sparklineData && sparklineData.length > 0 && (
        <div className="relative z-10 mt-auto pt-4">
          <div className="h-12 w-full overflow-hidden opacity-60 transition-opacity hover:opacity-100">
            <ResponsiveContainer width="100%" height="100%" minHeight={0}>
              <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={c.sparkline}
                  strokeWidth={2}
                  fill={c.sparkline}
                  fillOpacity={0.05}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </article>
  );
}
