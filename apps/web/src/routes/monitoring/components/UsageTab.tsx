import { useMemo, useState } from "react";
import {
  BarChart3,
  DollarSign,
  Search,
  Sparkles,
  Clock,
  Target,
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
}

export function UsageTab({
  aggregation,
  loading,
  year,
  month,
  onYearChange,
  onMonthChange,
}: UsageTabProps) {
  const [search, setSearch] = useState("");
  const [aggregationModule, setAggregationModule] = useState("");
  const [actionCategory, setActionCategory] = useState<
    "" | "simulation" | "review"
  >("");
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

  const allModels = useMemo(() => {
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
  }, [aggregation]);

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <Target size={12} className="inline mr-1" />
            Total Calls
          </span>
          <p className="text-2xl font-black">
            {totalSummary.calls.toLocaleString()}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <BarChart3 size={12} className="inline mr-1" />
            Total Tokens
          </span>
          <p className="text-2xl font-black">
            {totalSummary.tokens.toLocaleString()}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <DollarSign size={12} className="inline mr-1" />
            Total Biaya
          </span>
          <p className="text-2xl font-black text-primary">
            Rp {Math.round(totalSummary.cost).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-emerald-200 p-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 block">
            <Sparkles size={12} className="inline mr-1" />
            Biaya Simulasi
          </span>
          <p className="text-2xl font-black text-emerald-600">
            Rp {Math.round(totalSummary.simulationCost).toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-600/60 mt-1">
            Chat, email, panggilan suara
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-amber-200 p-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2 block">
            <Sparkles size={12} className="inline mr-1" />
            Biaya Penilaian AI
          </span>
          <p className="text-2xl font-black text-amber-600">
            Rp {Math.round(totalSummary.reviewCost).toLocaleString()}
          </p>
          <p className="text-[10px] text-amber-600/60 mt-1">
            Evaluasi, coaching, analisis suara
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <Clock size={12} className="inline mr-1" />
            Pengguna Aktif
          </span>
          <p className="text-2xl font-black">{aggregation.length}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
          className="px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        >
          {[2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={aggregationModule}
          onChange={(e) => setAggregationModule(e.target.value)}
          className="px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        >
          {MODULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {/* Category toggle */}
        <div className="flex items-center rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setActionCategory("")}
            className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              actionCategory === ""
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-foreground/5"
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => setActionCategory("simulation")}
            className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-l border-border ${
              actionCategory === "simulation"
                ? "bg-emerald-600 text-white"
                : "bg-card text-muted-foreground hover:bg-foreground/5"
            }`}
          >
            Simulasi
          </button>
          <button
            onClick={() => setActionCategory("review")}
            className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-l border-border ${
              actionCategory === "review"
                ? "bg-amber-600 text-white"
                : "bg-card text-muted-foreground hover:bg-foreground/5"
            }`}
          >
            Penilaian AI
          </button>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pengguna..."
            className="w-full pl-12 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        {selectedUser && (
          <button
            onClick={() => setSelectedUser(null)}
            className="text-xs text-primary font-bold underline hover:opacity-80"
          >
            Semua Pengguna
          </button>
        )}
      </div>

      {/* Usage Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-foreground/[0.02] border-b border-border">
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                Pengguna
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                Call
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                Token
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest">
                <span className="text-emerald-600">Simulasi (Rp)</span>
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest">
                <span className="text-amber-600">Penilaian AI (Rp)</span>
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                Total Biaya (Rp)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAgg.map((a) => (
              <tr
                key={a.user_id}
                className="hover:bg-foreground/[0.02] transition-colors cursor-pointer"
                onClick={() =>
                  setSelectedUser(
                    selectedUser === a.user_id ? null : a.user_id,
                  )
                }
              >
                <td className="px-6 py-4">
                  <span
                    className={`font-bold ${selectedUser === a.user_id ? "text-primary" : ""}`}
                  >
                    {a.user_name || "Unknown"}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {a.user_email}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">{a.total_calls}</td>
                <td className="px-6 py-4 text-right">
                  {a.total_tokens.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                  {(a.simulation_cost_idr || 0) > 0
                    ? formatIdr(a.simulation_cost_idr)
                    : "-"}
                </td>
                <td className="px-6 py-4 text-right text-amber-600 font-bold">
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
            <span className="text-sm font-black tracking-tight">
              Breakdown per Model
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground/[0.02] border-b border-border">
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Model
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Modul
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Kategori
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Call
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Token
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Biaya
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                    className="hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4 text-xs font-mono font-bold">
                      {m.model_id}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-foreground/5">
                        {m.module}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {m.action_category === "simulation" ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Simulasi
                        </span>
                      ) : m.action_category === "review" ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          Penilaian
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-muted text-muted-foreground border border-border">
                          Lainnya
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs">
                      {m.calls}
                    </td>
                    <td className="px-6 py-4 text-right text-xs">
                      {m.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-primary font-bold">
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
            <span className="text-sm font-black tracking-tight">
              Keseluruhan per Model
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground/[0.02] border-b border-border">
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Model
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Modul
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  Kategori
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Call
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Token
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                  Biaya
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allModels.map((m, i) => (
                <tr
                  key={i}
                  className="hover:bg-foreground/[0.02] transition-colors"
                >
                  <td className="px-6 py-4 text-xs font-mono font-bold">
                    {m.model_id}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-foreground/5">
                      {m.module}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {m.action_category === "simulation" ? (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        Simulasi
                      </span>
                    ) : m.action_category === "review" ? (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        Penilaian
                      </span>
                    ) : (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-muted text-muted-foreground border border-border">
                        Lainnya
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-xs">{m.calls}</td>
                  <td className="px-6 py-4 text-right text-xs">
                    {m.total_tokens.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-xs text-primary font-bold">
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
