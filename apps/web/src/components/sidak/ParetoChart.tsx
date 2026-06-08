import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ParetoChartItem, ParetoImprovementInsightModel } from "./pareto-view-model";
import ParetoImprovementInsight from "./ParetoImprovementInsight";

interface Props {
  data: ParetoChartItem[];
  insight: ParetoImprovementInsightModel | null;
  serviceLabel?: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical Parameter", color: "#f43f5e" },
  non_critical: { label: "Non-Critical Parameter", color: "hsl(var(--primary))" },
  none: { label: "No Category", color: "#64748b" },
};

function getCategoryMeta(category?: string) {
  return CATEGORY_META[category ?? ""] ?? { label: "Parameter", color: "#64748b" };
}

export function ParetoTooltip({ active, payload, serviceLabel }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const item = payload[0]?.payload as ParetoChartItem | undefined;
  if (!item) return null;

  const category = getCategoryMeta(item.category);

  return (
    <div className="min-w-48 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-2 max-w-64 font-semibold leading-snug text-foreground">{item.fullName || item.name}</p>
      <div className="space-y-1 text-muted-foreground">
        {serviceLabel ? (
          <div className="flex items-center justify-between gap-4">
            <span>Layanan</span>
            <span className="font-semibold text-foreground">{serviceLabel}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <span>Jumlah Temuan</span>
          <span className="font-semibold text-foreground tabular-nums">{item.count}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Kumulatif</span>
          <span className="font-semibold text-foreground tabular-nums">{item.cumulative}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Kategori</span>
          <span className="font-semibold text-foreground">{category.label}</span>
        </div>
      </div>
    </div>
  );
}

export default function ParetoChart({ data, insight, serviceLabel }: Props) {
  if (!data.length) return null;

  return (
    <div className="w-full">
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 10, bottom: 20, left: -10 }}>
            <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="currentColor" opacity={0.05} />
            <XAxis
              dataKey="name"
              tickFormatter={(v: string) => (v.length > 15 ? v.slice(0, 15) + "..." : v)}
              tick={{ fontSize: 11, fill: "currentColor" }}
              opacity={0.6}
              angle={-30}
              textAnchor="end"
              height={60}
              axisLine={false}
              tickLine={false}
              dy={5}
            />
            <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11, fill: "currentColor" }} opacity={0.6} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: "currentColor" }} opacity={0.6} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "currentColor", opacity: 0.04 }}
              content={(props) => <ParetoTooltip {...props} serviceLabel={serviceLabel} />}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar yAxisId="left" dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={32} minPointSize={4}>
              {data.map((entry, i) => (
                <Cell key={i} fill={getCategoryMeta(entry.category).color} fillOpacity={0.85} />
              ))}
            </Bar>
            <Line yAxisId="right" dataKey="cumulative" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} type="monotone" animationDuration={2000} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div aria-label="Legend Root Cause Analysis" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2 pt-4 border-t border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#f43f5e] opacity-80" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Critical Parameter</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary opacity-80" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Non-Critical Parameter</span>
        </div>
        {data.some((entry) => entry.category === "none") && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#64748b] opacity-80" />
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">No Category</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-[#f59e0b]" />
          <div className="w-2 h-2 rounded-full bg-[#f59e0b] -ml-2" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Garis Kumulatif (%)</span>
        </div>
      </div>
      <ParetoImprovementInsight insight={insight} serviceLabel={serviceLabel} />
    </div>
  );
}
