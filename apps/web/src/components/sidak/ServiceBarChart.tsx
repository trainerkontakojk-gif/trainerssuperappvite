import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ServiceItem {
  name: string;
  displayName?: string;
  total: number;
  severity?: string;
  serviceType: string;
}

interface Props {
  data: ServiceItem[];
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#f43f5e",
  High: "#f59e0b",
  Medium: "#3b82f6",
  Low: "#10b981",
};

function getSeverityColor(severity?: string) {
  return severity ? SEVERITY_COLORS[severity] || "#8b5cf6" : "#8b5cf6";
}

export default function ServiceBarChart({ data }: Props) {
  if (!data.length) return null;

  const sorted = [...data]
    .filter((d) => d.total != null)
    .sort((a, b) => b.total - a.total)
    .map((d) => ({ ...d, displayName: d.displayName || d.name }));

  const severityLevels = Object.keys(SEVERITY_COLORS);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="5 5" horizontal={true} vertical={false} stroke="currentColor" opacity={0.05} />
            <XAxis type="number" hide />
            <YAxis
              dataKey="displayName"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 11 }}
              opacity={0.6}
              width={85}
            />
            <Tooltip
              cursor={{ fill: "currentColor", opacity: 0.03 }}
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
            <Bar dataKey="total" radius={[0, 8, 8, 0]} barSize={24}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={getSeverityColor(entry.severity)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/30">
        {severityLevels.map((sev) => (
          <div key={sev} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[sev] }} />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{sev}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
