import type { AgentComparisonTable } from "@trainers/types";

interface Props {
  comparisonTable?: AgentComparisonTable;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

function calculateDeltaPercent(agentCount: number, average: number): number | null {
  if (average === 0) {
    if (agentCount === 0) return 0;
    return null;
  }
  return ((agentCount - average) / average) * 100;
}

function formatDeltaPercent(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0%";
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(Math.abs(rounded));
  return `${rounded > 0 ? "+" : "-"}${formatted}%`;
}

function deltaTone(value: number | null): string {
  // Positive delta means the agent has MORE findings than the average
  // (worse quality). We surface it as a muted amber/rose neutral tone.
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-rose-600";
  if (value < 0) return "text-emerald-600";
  return "text-muted-foreground";
}

export default function AgentComparisonTable({ comparisonTable }: Props) {
  if (!comparisonTable) return null;

  const hasComparison = comparisonTable.rows.some((r) => r.key !== "total");

  if (!hasComparison) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8">
        <p className="text-sm text-muted-foreground">
          Belum ada data pembanding untuk range ini
        </p>
      </div>
    );
  }

  const { scope, rows } = comparisonTable;
  const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1];
  const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1];
  const totalRow = rows.find((r) => r.key === "total");

  const scopeLine = `${startLabel}-${endLabel} ${scope.year} • Layanan ${
    scope.serviceLabel || scope.serviceType
  } • ${scope.teamLabel} • ${
    totalRow?.teamAgentCount ?? 0
  } agent tim / ${totalRow?.serviceAgentCount ?? 0} agent service sama`;

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h4 className="font-outfit text-sm font-bold tracking-tight text-foreground">
          Benchmark Temuan
        </h4>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {scopeLine}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 font-bold">Parameter</th>
              <th className="px-5 py-3 text-right font-bold tabular-nums">
                Agent ini
              </th>
              <th className="px-5 py-3 text-right font-bold tabular-nums">
                Rata-rata tim
              </th>
              <th className="px-5 py-3 text-right font-bold tabular-nums">
                Rata-rata service sama
              </th>
              <th className="px-5 py-3 text-right font-bold tabular-nums">
                % vs tim
              </th>
              <th className="px-5 py-3 text-right font-bold tabular-nums">
                % vs service sama
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const deltaTeam = calculateDeltaPercent(
                row.agentCount,
                row.teamAverage,
              );
              const deltaService = calculateDeltaPercent(
                row.agentCount,
                row.serviceAverage,
              );
              const isTotal = row.key === "total";
              return (
                <tr
                  key={row.key}
                  className={`border-b border-border/60 last:border-0 ${
                    isTotal ? "font-semibold" : ""
                  }`}
                >
                  <td className="px-5 py-3 text-foreground">{row.label}</td>
                  <td className="px-5 py-3 text-right text-foreground tabular-nums">
                    {row.agentCount}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.teamAverage)}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.serviceAverage)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right tabular-nums ${deltaTone(
                      deltaTeam,
                    )}`}
                  >
                    {formatDeltaPercent(deltaTeam)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right tabular-nums ${deltaTone(
                      deltaService,
                    )}`}
                  >
                    {formatDeltaPercent(deltaService)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
