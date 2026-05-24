import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  DollarSign,
  History,
  Search,
  AlertCircle,
  Eye,
  X,
  Phone,
  MessageCircle,
  Mail,
  Sparkles,
  Clock,
  Target,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getApi, putApi, postApi } from "../hooks/useApi";
import { notify } from "../lib/toast";

type UsageAggregation = {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_idr: number;
  models: Array<{
    model_id: string;
    module: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_idr: number;
  }>;
};

type PricingEntry = {
  model_id: string;
  model_name: string;
  provider: string;
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
};

type UnifiedHistoryEntry = {
  id: string;
  user_id: string;
  module: "ketik" | "pdkt" | "telefun";
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: unknown;
  user_email?: string;
  user_role?: string;
};

const MODULE_OPTIONS = [
  { value: "", label: "Semua Modul" },
  { value: "ketik", label: "KETIK" },
  { value: "pdkt", label: "PDKT" },
  { value: "telefun", label: "Telefun" },
];

function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString()}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}d`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}d` : `${mins}m`;
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("id", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getModuleIcon(module: string) {
  switch (module) {
    case "ketik":
      return <MessageCircle size={14} className="text-module-ketik" />;
    case "pdkt":
      return <Mail size={14} className="text-module-pdkt" />;
    case "telefun":
      return <Phone size={14} className="text-module-telefun" />;
    default:
      return null;
  }
}

function getModuleBadgeClasses(module: string) {
  switch (module) {
    case "ketik":
      return "bg-module-ketik/10 text-module-ketik border border-module-ketik/20";
    case "pdkt":
      return "bg-module-pdkt/10 text-module-pdkt border border-module-pdkt/20";
    case "telefun":
      return "bg-module-telefun/10 text-module-telefun border border-module-telefun/20";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function mapError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "Unauthorized" || msg === "Invalid token") {
      return "Sesi Anda telah berakhir. Silakan login kembali.";
    }
    if (msg?.includes("tidak memiliki akses")) return msg;
    return msg === "API Error" ? "Gagal memuat data. Silakan coba lagi." : msg;
  }
  return "Terjadi kesalahan koneksi. Periksa jaringan Anda.";
}

export default function MonitoringPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role?.toLowerCase() || "";
  const canEditPricing = role === "trainer" || role === "admin";

  const [tab, setTab] = useState<"history" | "usage" | "pricing">("history");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [aggregation, setAggregation] = useState<UsageAggregation[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [billingRate, setBillingRate] = useState(15000);
  const [historyData, setHistoryData] = useState<UnifiedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyModule, setHistoryModule] = useState("");
  const [aggregationModule, setAggregationModule] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<UnifiedHistoryEntry | null>(
    null,
  );
  const [showDetail, setShowDetail] = useState(false);

  const fetchAggregation = async () => {
    setLoading(true);
    setError(null);
    try {
      const moduleParam = aggregationModule
        ? `&module=${aggregationModule}`
        : "";
      const data = await getApi<UsageAggregation[]>(
        `/ai/monitoring/aggregation?year=${year}&month=${month}${moduleParam}`,
      );
      setAggregation(data);
    } catch (err) {
      setError(mapError(err));
      console.error("Fetch aggregation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApi<UnifiedHistoryEntry[]>(
        "/ai/monitoring/history",
      );
      setHistoryData(data);
    } catch (err) {
      setError(mapError(err));
      console.error("Fetch history error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    if (!canEditPricing) return;
    setError(null);
    try {
      const [pData, bData] = await Promise.all([
        getApi<PricingEntry[]>("/ai/monitoring/pricing"),
        getApi<{ usd_to_idr_rate: number }>("/ai/monitoring/billing"),
      ]);
      setPricing(pData);
      setBillingRate(bData?.usd_to_idr_rate ?? 15000);
    } catch (err) {
      setError(mapError(err));
      console.error("Fetch pricing error:", err);
    }
  };

  useEffect(() => {
    if (tab === "history") fetchHistory();
    else if (tab === "usage") fetchAggregation();
    else if (tab === "pricing") fetchPricing();
  }, [tab, year, month, aggregationModule]);

  const handleSavePricing = async (entry: PricingEntry) => {
    try {
      await putApi("/ai/monitoring/pricing", entry);
      notify.success("Harga berhasil disimpan.");
      fetchPricing();
    } catch (err) {
      notify.error("Gagal menyimpan harga.", mapError(err));
      console.error("Save pricing error:", err);
    }
  };

  const handleSaveBilling = async () => {
    try {
      await postApi("/ai/monitoring/billing", {
        usd_to_idr_rate: billingRate,
      });
      notify.success("Kurs berhasil disimpan.");
    } catch (err) {
      notify.error("Gagal menyimpan kurs.", mapError(err));
      console.error("Save billing error:", err);
    }
  };

  const filteredAgg = useMemo(() => {
    return aggregation.filter((a) => {
      const nameMatch =
        a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.user_email?.toLowerCase().includes(search.toLowerCase());
      if (selectedUser) return a.user_id === selectedUser && nameMatch;
      return nameMatch;
    });
  }, [aggregation, search, selectedUser]);

  const filteredHistory = useMemo(() => {
    return historyData.filter((h) => {
      const searchMatch =
        h.scenario_title
          ?.toLowerCase()
          .includes(historySearch.toLowerCase()) ||
        h.user_email?.toLowerCase().includes(historySearch.toLowerCase());
      const moduleMatch = historyModule ? h.module === historyModule : true;
      return searchMatch && moduleMatch;
    });
  }, [historyData, historySearch, historyModule]);

  const totalSummary = aggregation.reduce(
    (acc, a) => ({
      calls: acc.calls + a.total_calls,
      tokens: acc.tokens + a.total_tokens,
      cost: acc.cost + a.total_cost_idr,
    }),
    { calls: 0, tokens: 0, cost: 0 },
  );

  const allModels = useMemo(() => {
    const map = new Map<
      string,
      {
        model_id: string;
        module: string;
        calls: number;
        total_tokens: number;
        cost_idr: number;
      }
    >();
    for (const agg of aggregation) {
      for (const m of agg.models) {
        const key = `${m.model_id}|${m.module}`;
        const existing = map.get(key);
        if (existing) {
          existing.calls += m.calls;
          existing.total_tokens += m.total_tokens;
          existing.cost_idr += m.cost_idr;
        } else {
          map.set(key, {
            model_id: m.model_id,
            module: m.module,
            calls: m.calls,
            total_tokens: m.total_tokens,
            cost_idr: m.cost_idr,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [aggregation]);

  const handleViewDetail = (entry: UnifiedHistoryEntry) => {
    setDetailEntry(entry);
    setShowDetail(true);
  };

  const historyKpi = useMemo(() => {
    const totalSessions = historyData.length;
    const uniqueUsers = new Set(historyData.map((h) => h.user_id)).size;
    const moduleCounts = { ketik: 0, pdkt: 0, telefun: 0 };
    historyData.forEach((h) => {
      if (h.module in moduleCounts) moduleCounts[h.module]++;
    });
    const topModule =
      (Object.entries(moduleCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as
        | string
        | undefined) ?? "-";
    const topModuleLabel =
      topModule === "ketik"
        ? "KETIK"
        : topModule === "pdkt"
          ? "PDKT"
          : topModule === "telefun"
            ? "Telefun"
            : topModule;
    return { totalSessions, uniqueUsers, topModuleLabel };
  }, [historyData]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 md:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary mb-4">
          <Sparkles size={12} />
          SIMULATION MONITORING
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Pantau histori simulasi dari satu pusat observasi.
        </h1>
        <p className="max-w-3xl text-sm md:text-base leading-relaxed text-muted-foreground mt-3">
          Lihat performa agen, telusuri transcript sesi, dan baca pola pemakaian
          lintas modul tanpa kehilangan konteks platform.
        </p>
      </div>

      {/* Tab Strip */}
      <div className="flex gap-2 mb-2 border-b border-border">
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
            tab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye size={16} />
          Riwayat Simulasi
        </button>
        <button
          onClick={() => setTab("usage")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
            tab === "usage"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 size={16} />
          Penggunaan Token
        </button>
        {canEditPricing && (
          <button
            onClick={() => setTab("pricing")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
              tab === "pricing"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <DollarSign size={16} />
            Harga & Kurs
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline hover:opacity-80"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Memuat data...
        </div>
      )}

      {/* Tab: Riwayat Simulasi */}
      {tab === "history" && (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card rounded-2xl border border-border p-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
                Total Sesi
              </span>
              <p className="text-3xl font-black">{historyKpi.totalSessions}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
                Pengguna Aktif
              </span>
              <p className="text-3xl font-black">{historyKpi.uniqueUsers}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
                Modul Terpopuler
              </span>
              <p className="text-3xl font-black">{historyKpi.topModuleLabel}</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-4">
            <select
              value={historyModule}
              onChange={(e) => setHistoryModule(e.target.value)}
              className="px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              {MODULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="relative flex-1 max-w-xs">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari riwayat..."
                className="w-full pl-12 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* History Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground/[0.02] border-b border-border">
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Modul
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Skenario
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Pengguna
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Waktu
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Durasi
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest opacity-40">
                    Skor
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest opacity-40">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHistory.map((h) => (
                  <tr
                    key={`${h.module}-${h.id}`}
                    className="hover:bg-foreground/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5">
                        {getModuleIcon(h.module)}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${getModuleBadgeClasses(h.module)}`}
                        >
                          {h.module}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate font-medium">
                      {h.scenario_title}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {h.user_email || "-"}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {formatDate(h.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right text-xs">
                      {formatDuration(h.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {h.score !== null ? (
                        <span
                          className={`text-sm font-black ${getScoreColor(h.score)}`}
                        >
                          {h.score}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleViewDetail(h)}
                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-foreground/5 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all border border-border group-hover:border-primary"
                      >
                        <Eye size={12} className="inline mr-1" />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-16 text-center text-muted-foreground"
                    >
                      <History size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Belum ada riwayat simulasi.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab: Penggunaan Token */}
      {tab === "usage" && (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-5">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
                <Target size={12} className="inline mr-1" />
                Total Calls
              </span>
              <p className="text-2xl font-black">{totalSummary.calls.toLocaleString()}</p>
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
              onChange={(e) => setMonth(Number(e.target.value))}
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
              onChange={(e) => setYear(Number(e.target.value))}
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
                    Input
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Output
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Total Token
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Biaya (Rp)
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
                      {a.total_input_tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {a.total_output_tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-bold">
                      {a.total_tokens.toLocaleString()}
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
                      <BarChart3
                        size={32}
                        className="mx-auto mb-3 opacity-20"
                      />
                      <p className="text-sm">
                        Belum ada data penggunaan.
                      </p>
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
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-foreground/5`}
                          >
                            {m.module}
                          </span>
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
        </>
      )}

      {/* Tab: Harga & Kurs */}
      {tab === "pricing" && canEditPricing && (
        <div className="space-y-6">
          {/* Billing / Kurs Editor */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
              <h2 className="text-sm font-black tracking-tight">
                Kurs USD ke IDR
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 max-w-sm">
                <input
                  type="number"
                  value={billingRate}
                  onChange={(e) => setBillingRate(Number(e.target.value))}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  min={1}
                />
                <button
                  onClick={handleSaveBilling}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  Simpan
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Kurs aktif: Rp {billingRate.toLocaleString()} per USD
              </p>
            </div>
          </div>

          {/* Pricing Editor */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
              <h2 className="text-sm font-black tracking-tight">
                Harga per Model (USD / 1M tokens)
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground/[0.02] border-b border-border">
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Model
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                    Provider
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Input ($/jt)
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                    Output ($/jt)
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest opacity-40">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pricing.map((p) => (
                  <PricingRow
                    key={p.model_id}
                    entry={p}
                    onSave={handleSavePricing}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && detailEntry && (
        <TranscriptModal
          entry={detailEntry}
          onClose={() => {
            setShowDetail(false);
            setDetailEntry(null);
          }}
        />
      )}
    </div>
  );
}

function TranscriptModal({
  entry,
  onClose,
}: {
  entry: UnifiedHistoryEntry;
  onClose: () => void;
}) {
  const getModuleLabel = (m: string) => {
    switch (m) {
      case "ketik":
        return "KETIK (Chat Simulation)";
      case "pdkt":
        return "PDKT (Email Simulation)";
      case "telefun":
        return "Telefun (Call Simulation)";
      default:
        return m;
    }
  };

  const getModuleEmoji = (m: string) => {
    switch (m) {
      case "ketik":
        return "💬";
      case "pdkt":
        return "📧";
      case "telefun":
        return "📞";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-foreground/[0.02]">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${getModuleBadgeClasses(entry.module)}`}
            >
              {getModuleEmoji(entry.module)} {entry.module}
            </span>
            <h2 className="font-bold text-sm tracking-tight">
              {entry.scenario_title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Skenario
              </span>
              <p className="font-bold mt-0.5">{entry.scenario_title}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Pengguna
              </span>
              <p className="font-bold mt-0.5">{entry.user_email || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Waktu
              </span>
              <p className="font-bold mt-0.5">
                {formatDate(entry.created_at)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Durasi
              </span>
              <p className="font-bold mt-0.5">
                {formatDuration(entry.duration_seconds)}
              </p>
            </div>
          </div>

          {/* Chat History (KETIK) */}
          {entry.module === "ketik" && Array.isArray(entry.history) && (
            <div className="space-y-3">
              {entry.history.map((msg: any, i: number) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl text-sm ${
                    msg.role === "user"
                      ? "bg-primary/5 ml-8 border border-primary/10"
                      : "bg-muted mr-8 border border-border"
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-widest mb-1.5 opacity-40">
                    {msg.role === "user" ? "USER" : "AI"}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.text || msg.content || "(empty)"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Email History (PDKT) */}
          {entry.module === "pdkt" && Array.isArray(entry.history) && (
            <div className="space-y-3">
              {entry.history.map((email: any, i: number) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl text-sm ${
                    email.type !== "received"
                      ? "bg-primary/5 ml-8 border border-primary/10"
                      : "bg-muted mr-8 border border-border"
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-widest mb-1.5 opacity-40">
                    {email.type !== "received" ? "RESPONSE" : "INCOMING"}
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {email.subject || "(no subject)"}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {email.body || email.content || "(empty)"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recording (TELEFUN) */}
          {entry.module === "telefun" && typeof entry.history === "string" && (
            <div className="text-center p-8">
              <Phone size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-bold mb-2">
                Rekaman suara tersedia
              </p>
              <a
                href={entry.history}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs font-bold break-all hover:underline"
              >
                {entry.history}
              </a>
            </div>
          )}

          {entry.module === "telefun" &&
            typeof entry.history !== "string" &&
            !Array.isArray(entry.history) && (
              <div className="text-center p-8 text-muted-foreground text-sm">
                <Phone
                  size={32}
                  className="mx-auto mb-3 opacity-20"
                />
                Tidak ada transkrip tersedia.
              </div>
            )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-foreground/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                Durasi
              </span>
              <span className="text-lg font-black">
                {formatDuration(entry.duration_seconds)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                Skor
              </span>
              <span className={`text-lg font-black ${getScoreColor(entry.score)}`}>
                {entry.score !== null ? entry.score : "-"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-foreground text-background rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
          >
            Tutup Detail
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingRow({
  entry,
  onSave,
}: {
  entry: PricingEntry;
  onSave: (e: PricingEntry) => void;
}) {
  const [input, setInput] = useState(entry.input_price_usd_per_million);
  const [output, setOutput] = useState(entry.output_price_usd_per_million);
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    onSave({
      ...entry,
      input_price_usd_per_million: input,
      output_price_usd_per_million: output,
    });
    setEditing(false);
  };

  return (
    <tr className="hover:bg-foreground/[0.02] transition-colors">
      <td className="px-6 py-4">
        <span className="font-bold text-sm">{entry.model_name}</span>
        <span className="text-muted-foreground ml-2 text-[10px] font-mono">
          {entry.model_id}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${
            entry.provider === "gemini"
              ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
          }`}
        >
          {entry.provider}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        {editing ? (
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-background border border-border rounded-lg text-right text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-bold">{input}</span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        {editing ? (
          <input
            type="number"
            value={output}
            onChange={(e) => setOutput(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-background border border-border rounded-lg text-right text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-bold">{output}</span>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        {editing ? (
          <div className="flex gap-1.5 justify-center">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            >
              Simpan
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-muted/80 transition-all"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
