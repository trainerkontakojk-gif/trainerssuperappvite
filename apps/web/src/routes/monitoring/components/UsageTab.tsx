import { useMemo, useState } from "react";
import {
  BarChart3,
  Search,
  Clock,
} from "lucide-react";
import { formatIdr } from "../utils/formatting";
import { MODULE_OPTIONS } from "./constants";

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
    <div className="space-y-6">
      {/* KPI Summary - Unified 4 Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Aktivitas AI */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Aktivitas AI
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {totalSummary.calls.toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground font-normal">Calls</span>
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-2.5 flex items-center gap-1">
            <Clock size={12} className="text-muted-foreground/60" />
            {aggregation.length} Pengguna Aktif
          </p>
        </div>

        {/* Card 2: Konsumsi Token */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
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
        </div>

        {/* Card 3: Biaya Simulasi */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Biaya Simulasi
            </span>
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500">
              Rp {Math.round(totalSummary.simulationCost).toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/75 mt-2.5 leading-snug">
            Chat, email, & suara
          </p>
        </div>

        {/* Card 4: Biaya Penilaian AI */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Biaya Penilaian AI
            </span>
            <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-500">
              Rp {Math.round(totalSummary.reviewCost).toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/75 mt-2.5 leading-snug">
            Evaluasi & analisis AI
          </p>
        </div>
      </div>

      {/* Sleek Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 p-2 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString("id", { month: "long" })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={module}
            onChange={(e) => onModuleChange(e.target.value)}
            className="px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer"
          >
            {MODULE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 md:flex-initial">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pengguna..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-border/80 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          {selectedUser && (
            <button
              onClick={() => setSelectedUser(null)}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Semua User
            </button>
          )}
        </div>
      </div>

      {/* Usage Table */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-xs">
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
              <th className="px-6 py-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">
                Simulasi (Rp)
              </th>
              <th className="px-6 py-3.5 text-right font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">
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
                className="hover:bg-foreground/[0.015] transition-colors cursor-pointer"
                onClick={() =>
                  setSelectedUser(
                    selectedUser === a.user_id ? null : a.user_id,
                  )
                }
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
                <td className="px-6 py-4 text-right font-medium text-foreground">{a.total_calls}</td>
                <td className="px-6 py-4 text-right font-medium text-foreground">
                  {a.total_tokens.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-500 font-semibold">
                  {(a.simulation_cost_idr || 0) > 0
                    ? formatIdr(a.simulation_cost_idr)
                    : "-"}
                </td>
                <td className="px-6 py-4 text-right text-amber-600 dark:text-amber-500 font-semibold">
                  {(a.review_cost_idr || 0) > 0
                    ? formatIdr(a.review_cost_idr)
                    : "-"}
                </td>
                <td className="px-6 py-4 text-right text-primary font-bold">
                  {formatIdr(a.total_cost_idr)}
                </td>
              </tr>
            ))}
            {filteredAgg.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-16 text-center text-muted-foreground"
                >
                  <BarChart3 size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Belum ada data penggunaan.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-User Breakdown */}
      {selectedUser && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm animate-fade-in">
          <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Rincian Per Model untuk User Terpilih
            </span>
          </div>
          <table className="w-full text-xs">
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
                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20">
                          Simulasi
                        </span>
                      ) : m.action_category === "review" ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20">
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
      )}

      {/* All Models Overview */}
      {!selectedUser && allModels.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              Keseluruhan Penggunaan Per Model AI
            </span>
          </div>
          <table className="w-full text-xs">
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
                      <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20">
                        Simulasi
                      </span>
                    ) : m.action_category === "review" ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20">
                        Penilaian
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                        Lainnya
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right font-medium text-foreground">{m.calls}</td>
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
      )}
    </div>
  );
}
