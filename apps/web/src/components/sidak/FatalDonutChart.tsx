import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Props {
  critical: number;
  nonCritical: number;
  total: number;
}

const COLORS = ["#f43f5e", "#64748b"];

export default function FatalDonutChart({ critical, nonCritical, total }: Props) {
  if (total === 0) return null;

  const data = [
    { name: "Kritikal", value: critical },
    { name: "Non-Kritikal", value: nonCritical },
  ];

  return (
    <div className="h-80 w-full relative flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={70}
            outerRadius={90}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} fillOpacity={0.9} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any) => [value, "Kasus"]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              backgroundColor: "var(--card)",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-10%" }}>
        <span className="text-3xl font-bold text-foreground">{total}</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
      </div>
    </div>
  );
}
