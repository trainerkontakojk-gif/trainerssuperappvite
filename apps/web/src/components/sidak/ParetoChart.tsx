import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ParetoItem {
  name: string;
  fullName: string;
  count: number;
  cumulative: number;
  category: string;
}

interface Props {
  data: ParetoItem[];
}

export default function ParetoChart({ data }: Props) {
  if (!data.length) return null;

  return (
    <div className="h-96 w-full flex flex-col">
      <div className="flex-1 min-h-0">
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
              formatter={(value: any, name: any) => {
                if (name === "cumulative") return [`${value}%`, "Kumulatif"];
                return [value, "Jumlah"];
              }}
              labelFormatter={(label: any, payload: any) => {
                const items = Array.isArray(payload) ? payload : [];
                return items[0]?.payload?.fullName ?? label;
              }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                backgroundColor: "var(--card)",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--foreground)",
              }}
            />
            <Bar yAxisId="left" dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={32}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.category === "critical" ? "#f43f5e" : "hsl(var(--primary))"} fillOpacity={0.8} />
              ))}
            </Bar>
            <Line yAxisId="right" dataKey="cumulative" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} type="monotone" animationDuration={2000} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2 pt-4 border-t border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#f43f5e] opacity-80" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Critical Parameter</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary opacity-80" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Non-Critical Parameter</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-[#f59e0b]" />
          <div className="w-2 h-2 rounded-full bg-[#f59e0b] -ml-2" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Garis Kumulatif (%)</span>
        </div>
      </div>
    </div>
  );
}
