import { useState } from "react";
import type { AgentComparisonTable } from "@trainers/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ParamTrendChart from "./ParamTrendChart";
import QaStatePanel from "./QaStatePanel";
import AgentComparisonTableView from "./AgentComparisonTable";

interface TrendDataset {
  label: string;
  data: number[];
  isTotal: boolean;
}

interface Props {
  labels: string[];
  datasets: TrendDataset[];
  loading?: boolean;
  comparisonTable?: AgentComparisonTable;
}

const TREND_COLORS = [
  "var(--chart-green)",
  "var(--chart-amber)",
  "var(--chart-blue)",
  "var(--chart-red)",
  "var(--chart-violet)",
  "var(--chart-cyan)",
];

export default function AgentTrendTab({
  labels,
  datasets,
  loading,
  comparisonTable,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const trendRangeLabel =
    labels.length > 0 ? `${labels[0]}–${labels[labels.length - 1]}` : "";

  if (loading) {
    return (
      <Card className="flex min-h-[24rem] items-center justify-center border-border bg-surface p-4 ring-0 sm:p-6">
        <QaStatePanel
          type="loading"
          title="Memuat tren temuan"
          className="w-full max-w-lg"
        />
      </Card>
    );
  }

  if (!labels.length || !datasets.length) {
    return (
      <Card className="border-border bg-surface p-4 ring-0 sm:p-6">
        <QaStatePanel
          type="empty"
          title="Belum ada data tren"
          description="Tren muncul setelah ada audit pada rentang bulan yang dipilih."
        />
      </Card>
    );
  }

  const paramDatasets = datasets.filter((ds) => !ds.isTotal);
  const isFiltered = activeFilter !== null && activeFilter !== "TOTAL_ONLY";
  const isTotalOnly = activeFilter === "TOTAL_ONLY";

  const colorMap: Record<string, string> = {};
  datasets.forEach((ds, i) => {
    if (!ds.isTotal) {
      colorMap[ds.label] = TREND_COLORS[i % TREND_COLORS.length];
    }
  });

  const chartDatasets = isFiltered
    ? datasets.filter((ds) => ds.isTotal || ds.label === activeFilter)
    : isTotalOnly
      ? datasets.filter((ds) => ds.isTotal)
      : datasets;

  const hiddenKeys = isFiltered
    ? new Set(
        paramDatasets
          .filter((ds) => ds.label !== activeFilter)
          .map((ds) => ds.label),
      )
    : new Set<string>();

  const showTotal = !isFiltered;

  return (
    <Card className="gap-0 border-border bg-surface py-0 ring-0">
      <CardHeader className="border-b border-border p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <CardTitle className="font-outfit text-lg font-bold tracking-tight">
              Tren temuan per bulan
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Jumlah temuan {trendRangeLabel ? `${trendRangeLabel} ` : ""}
              ({labels.length} bulan berdata). Pilih satu parameter untuk
              melihat polanya.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <div
          className="mb-6 flex flex-wrap gap-2"
          role="group"
          aria-label="Filter seri grafik"
        >
          <Button
            type="button"
            variant={activeFilter === null ? "default" : "outline"}
            size="lg"
            onClick={() => setActiveFilter(null)}
            aria-pressed={activeFilter === null}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold motion-reduce:transition-none"
          >
            Semua parameter
          </Button>
          <Button
            type="button"
            variant={activeFilter === "TOTAL_ONLY" ? "default" : "outline"}
            size="lg"
            onClick={() =>
              setActiveFilter(activeFilter === "TOTAL_ONLY" ? null : "TOTAL_ONLY")
            }
            aria-pressed={activeFilter === "TOTAL_ONLY"}
            className="min-h-11 gap-2 rounded-xl px-3 text-sm font-semibold motion-reduce:transition-none"
          >
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor:
                  activeFilter === "TOTAL_ONLY"
                    ? "var(--primary-foreground)"
                    : "var(--primary)",
              }}
              aria-hidden="true"
            />
            Total saja
          </Button>
          {paramDatasets.map((ds) => {
            const isActive = activeFilter === ds.label;
            const color = colorMap[ds.label] || "var(--chart-blue)";
            return (
              <Button
                key={ds.label}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="lg"
                onClick={() => setActiveFilter(isActive ? null : ds.label)}
                aria-pressed={isActive}
                className="min-h-11 gap-2 rounded-xl px-3 text-sm font-semibold motion-reduce:transition-none"
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor: isActive
                      ? "var(--primary-foreground)"
                      : color,
                  }}
                  aria-hidden="true"
                />
                {ds.label}
              </Button>
            );
          })}
        </div>

        <div className="relative h-[22rem] w-full overflow-hidden rounded-xl border border-border bg-background p-2 sm:h-[24rem] sm:p-3">
          <ParamTrendChart
            labels={labels}
            datasets={chartDatasets}
            showParameters={true}
            hiddenKeys={hiddenKeys}
            hideTotal={!showTotal}
            filterLabel={activeFilter || undefined}
            isFiltered={isFiltered}
            colorMap={colorMap}
          />
        </div>

        <AgentComparisonTableView comparisonTable={comparisonTable} embedded />
      </CardContent>
    </Card>
  );
}
