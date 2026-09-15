import { useMemo, useState } from "react";
import { BarChart3, Search, Clock } from "lucide-react";
import { formatIdr } from "../utils/formatting";
import { MODULE_OPTIONS } from "./constants";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

export type UsageAggregation = {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_idr: number;
  simulation_cost_idr: number;
  review_cost_idr: number;
  models: Array<{
    model_id: string;
    module: string;
    action: string;
    action_category: "simulation" | "review" | "other";
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_idr: number;
  }>;
};

interface UsageTabProps {
  aggregation: UsageAggregation[];
  loading: boolean;
  year: number;
  month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  module: string;
  onModuleChange: (m: string) => void;
}

export function UsageTab({
  aggregation,
  loading,
  year,
  month,
  onYearChange,
  onMonthChange,
  module,
  onModuleChange,
}: UsageTabProps) {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const filteredAgg = useMemo(() => {
    return aggregation.filter((a) => {
      const nameMatch =
        a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.user_email?.toLowerCase().includes(search.toLowerCase());
      if (selectedUser) return a.user_id === selectedUser && nameMatch;
      return nameMatch;
    });
  }, [aggregation, search, selectedUser]);

  const totalSummary = aggregation.reduce(
    (acc, a) => ({
      calls: acc.calls + a.total_calls,
      tokens: acc.tokens + a.total_tokens,
      cost: acc.cost + a.total_cost_idr,
      simulationCost: acc.simulationCost + (a.simulation_cost_idr || 0),
      reviewCost: acc.reviewCost + (a.review_cost_idr || 0),
    }),
    { calls: 0, tokens: 0, cost: 0, simulationCost: 0, reviewCost: 0 },
  );

  const allModels = (() => {
    const map = new Map<
      string,
      {
        model_id: string;
        module: string;
        action_category: "simulation" | "review" | "other";
        calls: number;
        total_tokens: number;
        cost_idr: number;
      }
    >();
    for (const agg of aggregation) {
      for (const m of agg.models) {
        const key = `${m.model_id}|${m.module}|${m.action}`;
        const existing = map.get(key);
        if (existing) {
          existing.calls += m.calls;
          existing.total_tokens += m.total_tokens;
          existing.cost_idr += m.cost_idr;
        } else {
          map.set(key, {
            model_id: m.model_id,
            module: m.module,
            action_category: m.action_category,
            calls: m.calls,
            total_tokens: m.total_tokens,
            cost_idr: m.cost_idr,
          });
        }
      }
    }
    return Array.from(map.values());
  })();

  return (
    <div className="space-y-6" aria-busy={loading}>
      {/* KPI Summary - Unified 4 Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Aktivitas AI */}
        <Card className="flex flex-col justify-between border-border bg-card p-5">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Aktivitas AI
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {totalSummary.calls.toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                Calls
              </span>
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-2.5 flex items-center gap-1">
            <Clock
              size={12}
              aria-hidden="true"
              className="text-muted-foreground/60"
            />
            {aggregation.length} Pengguna Aktif
          </p>
        </Card>

        {/* Card 2: Konsumsi Token */}
        <Card className="flex flex-col justify-between border-border bg-card p-5">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Konsumsi Token
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {totalSummary.tokens.toLocaleString()}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-2.5">
            Total Input & Output Tokens
          </p>
        </Card>

        {/* Card 3: Biaya Simulasi */}
        <Card className="flex flex-col justify-between border-border bg-card p-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
              Biaya Simulasi
            </span>
            <p
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--chart-green)" }}
            >
              Rp {Math.round(totalSummary.simulationCost).toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/75 mt-2.5 leading-snug font-medium">
            Chat, email, & suara
          </p>
        </Card>

        {/* Card 4: Biaya Penilaian AI */}
        <Card className="flex flex-col justify-between border-border bg-card p-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
              Biaya Penilaian AI
            </span>
            <p
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--chart-amber)" }}
            >
              Rp {Math.round(totalSummary.reviewCost).toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/75 mt-2.5 leading-snug font-medium">
            Evaluasi & analisis AI
          </p>
        </Card>
      </div>

      {/* Sleek Filter Bar */}
      <Card className="flex flex-col justify-between gap-4 rounded-xl border-border bg-muted/30 p-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="monitoring-usage-month" className="sr-only">
            Bulan
          </label>
          <Select
            value={String(month)}
            onValueChange={(value) => onMonthChange(Number(value))}
          >
            <SelectTrigger
              id="monitoring-usage-month"
              aria-label="Bulan penggunaan"
              className="min-h-11 min-w-[8rem] rounded-lg border-border bg-background text-xs font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {new Date(0, i).toLocaleString("id", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor="monitoring-usage-year" className="sr-only">
            Tahun
          </label>
          <Select
            value={String(year)}
            onValueChange={(value) => onYearChange(Number(value))}
          >
            <SelectTrigger
              id="monitoring-usage-year"
              aria-label="Tahun penggunaan"
              className="min-h-11 min-w-[6.5rem] rounded-lg border-border bg-background text-xs font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor="monitoring-usage-module" className="sr-only">
            Modul
          </label>
          <Select
            value={module}
            onValueChange={(value) => {
              if (value) onModuleChange(value);
            }}
          >
            <SelectTrigger
              id="monitoring-usage-module"
              aria-label="Modul penggunaan"
              className="min-h-11 min-w-[8rem] rounded-lg border-border bg-background text-xs font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 md:flex-initial">
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Cari pengguna penggunaan AI"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pengguna..."
              className="min-h-11 w-full rounded-lg border-input bg-background pl-9 pr-3 py-2 text-xs"
            />
          </div>
          {selectedUser && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedUser(null)}
              className="min-h-11 px-2 text-xs font-semibold text-primary"
            >
              Semua User
            </Button>
          )}
        </div>
      </Card>

      {/* Usage Table */}
      <Card className="overflow-hidden rounded-xl border-border bg-card p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">
              Ringkasan penggunaan AI per pengguna
            </caption>
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                  Pengguna
                </th>
                <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                  Call
                </th>
                <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                  Token
                </th>
                <th
                  className="px-6 py-3.5 text-right font-bold uppercase tracking-widest opacity-80"
                  style={{ color: "var(--chart-green)" }}
                >
                  Simulasi (Rp)
                </th>
                <th
                  className="px-6 py-3.5 text-right font-bold uppercase tracking-widest opacity-80"
                  style={{ color: "var(--chart-amber)" }}
                >
                  Penilaian AI (Rp)
                </th>
                <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Biaya (Rp)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredAgg.map((a) => (
                <tr
                  key={a.user_id}
                  tabIndex={0}
                  aria-label={`Tampilkan rincian penggunaan ${a.user_name || a.user_email || "pengguna"}`}
                  className="hover:bg-foreground/[0.015] focus-visible:bg-foreground/[0.015] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary transition-colors cursor-pointer"
                  onClick={() =>
                    setSelectedUser(
                      selectedUser === a.user_id ? null : a.user_id,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedUser(
                        selectedUser === a.user_id ? null : a.user_id,
                      );
                    }
                  }}
                >
                  <td className="px-6 py-4">
                    <span
                      className={`font-semibold text-sm ${selectedUser === a.user_id ? "text-primary" : "text-foreground"}`}
                    >
                      {a.user_name || "Unknown"}
                    </span>
                    <span className="text-muted-foreground/70 ml-2 font-mono text-[10px]">
                      {a.user_email}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-foreground">
                    {a.total_calls}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-foreground">
                    {a.total_tokens.toLocaleString()}
                  </td>
                  <td
                    className="px-6 py-4 text-right font-semibold"
                    style={{ color: "var(--chart-green)" }}
                  >
                    {(a.simulation_cost_idr || 0) > 0
                      ? formatIdr(a.simulation_cost_idr)
                      : "-"}
                  </td>
                  <td
                    className="px-6 py-4 text-right font-semibold"
                    style={{ color: "var(--chart-amber)" }}
                  >
                    {(a.review_cost_idr || 0) > 0
                      ? formatIdr(a.review_cost_idr)
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right text-primary font-bold">
                    {formatIdr(a.total_cost_idr)}
                  </td>
                </tr>
              ))}
              {loading && filteredAgg.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <span
                      role="status"
                      className="text-sm text-muted-foreground"
                    >
                      Memuat data penggunaan…
                    </span>
                  </td>
                </tr>
              )}
              {filteredAgg.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-muted-foreground"
                  >
                    <BarChart3
                      size={32}
                      aria-hidden="true"
                      className="mx-auto mb-3 opacity-20"
                    />
                    <p className="text-sm">Belum ada data penggunaan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Per-User Breakdown */}
      {selectedUser && (
        <Card className="animate-fade-in overflow-hidden rounded-xl border-border bg-card p-0">
          <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Rincian Per Model untuk User Terpilih
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Rincian penggunaan per model untuk pengguna terpilih
              </caption>
              <thead>
                <tr className="bg-muted/10 border-b border-border/50">
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Modul
                  </th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Call
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Biaya
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 bg-foreground/[0.005]">
                {filteredAgg
                  .flatMap((a) =>
                    a.models.map((m) => ({
                      model_id: m.model_id,
                      module: m.module,
                      action_category: m.action_category,
                      calls: m.calls,
                      total_tokens: m.total_tokens,
                      cost_idr: m.cost_idr,
                    })),
                  )
                  .map((m, i) => (
                    <tr
                      key={i}
                      className="hover:bg-foreground/[0.015] transition-colors"
                    >
                      <td className="px-6 py-3.5 font-mono text-[10px] font-semibold text-foreground">
                        {m.model_id}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex px-2 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wider">
                          {m.module}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {m.action_category === "simulation" ? (
                          <span
                            className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: "var(--chart-green)",
                              color: "white",
                            }}
                          >
                            Simulasi
                          </span>
                        ) : m.action_category === "review" ? (
                          <span
                            className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: "var(--chart-amber)",
                              color: "white",
                            }}
                          >
                            Penilaian
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                            Lainnya
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-foreground">
                        {m.calls}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-foreground">
                        {m.total_tokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-right text-primary font-bold">
                        {formatIdr(m.cost_idr)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* All Models Overview */}
      {!selectedUser && allModels.length > 0 && (
        <Card className="overflow-hidden rounded-xl border-border bg-card p-0">
          <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Keseluruhan Penggunaan Per Model AI
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Keseluruhan penggunaan per model AI
              </caption>
              <thead>
                <tr className="bg-muted/10 border-b border-border/50">
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Modul
                  </th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Call
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                    Biaya
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {allModels.map((m, i) => (
                  <tr
                    key={i}
                    className="hover:bg-foreground/[0.015] transition-colors"
                  >
                    <td className="px-6 py-3.5 font-mono text-[10px] font-semibold text-foreground">
                      {m.model_id}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wider">
                        {m.module}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {m.action_category === "simulation" ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: "var(--chart-green)",
                            color: "white",
                          }}
                        >
                          Simulasi
                        </span>
                      ) : m.action_category === "review" ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: "var(--chart-amber)",
                            color: "white",
                          }}
                        >
                          Penilaian
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                          Lainnya
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">
                      {m.calls}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">
                      {m.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-right text-primary font-bold">
                      {formatIdr(m.cost_idr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
