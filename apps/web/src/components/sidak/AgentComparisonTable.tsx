import type { AgentComparisonTable } from "@trainers/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  comparisonTable?: AgentComparisonTable;
  embedded?: boolean;
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
  if (value > 0) return "text-rose-700 dark:text-rose-400";
  if (value < 0) return "text-emerald-700 dark:text-emerald-400";
  return "text-muted-foreground";
}

export default function AgentComparisonTable({ comparisonTable, embedded = false }: Props) {
  if (!comparisonTable) return null;

  const hasComparison = comparisonTable.rows.some((r) => r.key !== "total");

  if (!hasComparison) {
    return (
      <Card
        className={
          embedded
            ? "gap-0 rounded-none border-0 bg-transparent py-6 ring-0"
            : "border-border bg-surface py-0"
        }
      >
        <CardContent className="px-5 py-6">
          <p className="text-sm text-muted-foreground">
          Belum ada data pembanding untuk periode ini
          </p>
        </CardContent>
      </Card>
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
  } agen tim / ${totalRow?.serviceAgentCount ?? 0} agen layanan sama`;

  return (
    <Card
      className={
        embedded
          ? "gap-0 rounded-none border-0 bg-transparent py-6 ring-0"
          : "gap-0 border-border bg-surface py-0"
      }
    >
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="font-outfit text-lg font-bold tracking-tight text-foreground">
          Perbandingan Temuan
        </CardTitle>
        <CardDescription className="mt-1 text-sm text-muted-foreground">
          {scopeLine}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="min-w-[720px] text-sm">
          <TableCaption className="sr-only">Perbandingan temuan agen dengan rata-rata tim dan layanan yang sama</TableCaption>
          <TableHeader>
            <TableRow className="border-b border-border text-left text-xs font-semibold text-muted-foreground hover:bg-transparent">
              <TableHead className="px-5 py-3 font-bold">Parameter</TableHead>
              <TableHead className="px-5 py-3 text-right font-bold tabular-nums">
                Agen ini
              </TableHead>
              <TableHead className="px-5 py-3 text-right font-bold tabular-nums">
                Rata-rata tim
              </TableHead>
              <TableHead className="px-5 py-3 text-right font-bold tabular-nums">
                Rata-rata layanan sama
              </TableHead>
              <TableHead className="px-5 py-3 text-right font-bold tabular-nums">
                % vs tim
              </TableHead>
              <TableHead className="px-5 py-3 text-right font-bold tabular-nums">
                % vs layanan sama
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                <TableRow
                  key={row.key}
                  className={isTotal ? "bg-muted/30 font-semibold" : ""}
                >
                  <TableCell className="px-5 py-3 text-foreground">{row.label}</TableCell>
                  <TableCell className="px-5 py-3 text-right text-foreground tabular-nums">
                    {row.agentCount}
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.teamAverage)}
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.serviceAverage)}
                  </TableCell>
                  <TableCell
                    className={`px-5 py-3 text-right tabular-nums ${deltaTone(
                      deltaTeam,
                    )}`}
                  >
                    {formatDeltaPercent(deltaTeam)}
                  </TableCell>
                  <TableCell
                    className={`px-5 py-3 text-right tabular-nums ${deltaTone(
                      deltaService,
                    )}`}
                  >
                    {formatDeltaPercent(deltaService)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
