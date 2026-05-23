import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  delta: number | null;
  invertDelta?: boolean;
  desc?: string;
  sparklineData?: { value: number }[];
}

const COLOR_MAP: Record<
  string,
  {
    iconBg: string;
    iconFg: string;
    sparkline: string;
    glow: string;
  }
> = {
  orange: {
    iconBg: "bg-orange-100",
    iconFg: "text-orange-500",
    sparkline: "#fb923c",
    glow: "rgba(251, 146, 60, 0.18)",
  },
  red: {
    iconBg: "bg-rose-100",
    iconFg: "text-rose-500",
    sparkline: "#fb7185",
    glow: "rgba(251, 113, 133, 0.18)",
  },
  blue: {
    iconBg: "bg-blue-100",
    iconFg: "text-blue-500",
    sparkline: "#60a5fa",
    glow: "rgba(96, 165, 250, 0.18)",
  },
  emerald: {
    iconBg: "bg-emerald-100",
    iconFg: "text-emerald-500",
    sparkline: "#34d399",
    glow: "rgba(52, 211, 153, 0.18)",
  },
};

export default function KpiCard({ label, value, icon: Icon, color, delta, invertDelta, desc, sparklineData }: Props) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  const isGood = delta === null ? true : invertDelta ? delta <= 0 : delta >= 0;
  const absDelta = delta !== null ? Math.abs(delta) : null;

  let DeltaIcon: LucideIcon | null = null;
  let deltaClass = "";
  if (delta !== null) {
    if (delta === 0) {
      DeltaIcon = Minus;
      deltaClass = "text-muted-foreground bg-muted/60 border-border/60";
    } else if (isGood) {
      deltaClass = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
      DeltaIcon = invertDelta ? ArrowDownRight : ArrowUpRight;
    } else {
      deltaClass = "text-rose-500 bg-rose-500/10 border-rose-500/20";
      DeltaIcon = invertDelta ? ArrowUpRight : ArrowDownRight;
    }
  }

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[2.5rem] border border-border/70 bg-card/50 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-shadow duration-300 hover:shadow-lg">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{ backgroundColor: c.glow }}
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${c.iconBg}`}>
          <Icon className={`h-4 w-4 ${c.iconFg}`} />
        </div>

        {delta !== null && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] shadow-sm ${deltaClass}`}
          >
            {DeltaIcon && <DeltaIcon className="h-3 w-3" />}
            <span>{absDelta !== null ? `${absDelta.toFixed(1)}%` : "0.0%"}</span>
          </div>
        )}
      </div>

      <div className="relative z-10 mt-6">
        <p className="text-[9px] font-black uppercase tracking-[0.26em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2.5 text-[34px] font-black leading-none tracking-tight text-foreground tabular-nums lg:text-[34px]">
          {value}
        </p>
        {desc && <p className="mt-2.5 max-w-[18rem] text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>

      {sparklineData && sparklineData.length > 0 && (
        <div className="relative z-10 mt-auto pt-4">
          <div className="h-14 w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient
                    id={`sparkline-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="6%" stopColor={c.sparkline} stopOpacity={0.34} />
                    <stop offset="96%" stopColor={c.sparkline} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={c.sparkline}
                  strokeWidth={3.25}
                  fill={`url(#sparkline-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")})`}
                  fillOpacity={1}
                  dot={false}
                  isAnimationActive
                  animationDuration={1400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </article>
  );
}
