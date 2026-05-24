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
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

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
      return <MessageCircle size={14} className="text-blue-500" />;
    case "pdkt":
      return <Mail size={14} className="text-orange-500" />;
    case "telefun":
      return <Phone size={14} className="text-green-500" />;
    default:
      return null;
  }
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
      const res = await fetch(
        `/api/v1/ai/monitoring/aggregation?year=${year}&month=${month}${moduleParam}`,
      );
      const json = await res.json();
      if (json.success) setAggregation(json.data || []);
      else setError(json.error?.message || "Gagal memuat data agregasi");
    } catch (err) {
      setError("Terjadi kesalahan koneksi.");
      console.error("Fetch aggregation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/monitoring/history");
      const json = await res.json();
      if (json.success) setHistoryData(json.data || []);
      else setError(json.error?.message || "Gagal memuat riwayat monitoring");
    } catch (err) {
      setError("Terjadi kesalahan koneksi.");
      console.error("Fetch history error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    if (!canEditPricing) return;
    setError(null);
    try {
      const [pRes, bRes] = await Promise.all([
        fetch("/api/v1/ai/monitoring/pricing"),
        fetch("/api/v1/ai/monitoring/billing"),
      ]);
      const pJson = await pRes.json();
      const bJson = await bRes.json();
      if (pJson.success) setPricing(pJson.data || []);
      else setError(pJson.error?.message || "Gagal memuat data pricing");
      if (bJson.success) setBillingRate(bJson.data?.usd_to_idr_rate ?? 15000);
    } catch (err) {
      setError("Terjadi kesalahan koneksi.");
      console.error("Fetch pricing error:", err);
    }
  };

  useEffect(() => {
    if (tab === "history") fetchHistory();
    else if (tab === "usage") fetchAggregation();
    else if (tab === "pricing") fetchPricing();
  }, [tab, year, month, aggregationModule]);

  const handleSavePricing = async (entry: PricingEntry) => {
    await fetch("/api/v1/ai/monitoring/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    fetchPricing();
  };

  const handleSaveBilling = async () => {
    await fetch("/api/v1/ai/monitoring/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usd_to_idr_rate: billingRate }),
    });
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
      { model_id: string; module: string; calls: number; total_tokens: number; cost_idr: number }
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
          map.set(key, { model_id: m.model_id, module: m.module, calls: m.calls, total_tokens: m.total_tokens, cost_idr: m.cost_idr });
        }
      }
    }
    return Array.from(map.values());
  }, [aggregation]);

  const handleViewDetail = (entry: UnifiedHistoryEntry) => {
    setDetailEntry(entry);
    setShowDetail(true);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Monitoring AI Usage</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "history" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <History size={16} className="inline mr-1" />
            Riwayat Simulasi
          </button>
          <button
            onClick={() => setTab("usage")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "usage" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <BarChart3 size={16} className="inline mr-1" />
            Penggunaan Token
          </button>
          {canEditPricing && (
            <button
              onClick={() => setTab("pricing")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "pricing" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              <DollarSign size={16} className="inline mr-1" />
              Harga & Kurs
            </button>
          )}
        </div>
      </div>

      {tab === "history" && (
        <>
          <div className="flex items-center gap-4">
            <select
              value={historyModule}
              onChange={(e) => setHistoryModule(e.target.value)}
              className="p-2 border rounded-lg text-sm"
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
                className="absolute left-3 top-2.5 text-gray-400"
              />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari riwayat..."
                className="w-full pl-9 p-2 border rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left font-medium">Modul</th>
                  <th className="p-3 text-left font-medium">Skenario</th>
                  <th className="p-3 text-left font-medium">Pengguna</th>
                  <th className="p-3 text-left font-medium">Waktu</th>
                  <th className="p-3 text-right font-medium">Durasi</th>
                  <th className="p-3 text-center font-medium">Skor</th>
                  <th className="p-3 text-center font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={`${h.module}-${h.id}`} className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {getModuleIcon(h.module)}
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            h.module === "ketik"
                              ? "bg-blue-100 text-blue-700"
                              : h.module === "pdkt"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {h.module.toUpperCase()}
                        </span>
                      </span>
                    </td>
                    <td className="p-3 max-w-xs truncate">
                      {h.scenario_title}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {h.user_email || "-"}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {formatDate(h.created_at)}
                    </td>
                    <td className="p-3 text-right text-xs">
                      {formatDuration(h.duration_seconds)}
                    </td>
                    <td className="p-3 text-center">
                      {h.score !== null ? (
                        <span className="text-xs font-medium">
                          {h.score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleViewDetail(h)}
                        className="text-xs px-2 py-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
                      >
                        <Eye size={12} className="inline mr-1" />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      Belum ada riwayat simulasi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "usage" && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <span className="text-xs text-gray-500">Total Calls</span>
              <p className="text-xl font-bold">{totalSummary.calls}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <span className="text-xs text-gray-500">Total Tokens</span>
              <p className="text-xl font-bold">
                {totalSummary.tokens.toLocaleString()}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <span className="text-xs text-gray-500">Total Biaya</span>
              <p className="text-xl font-bold text-indigo-600">
                Rp {totalSummary.cost.toLocaleString()}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <span className="text-xs text-gray-500">Pengguna Aktif</span>
              <p className="text-xl font-bold">{aggregation.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="p-2 border rounded-lg text-sm"
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
              className="p-2 border rounded-lg text-sm"
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
              className="p-2 border rounded-lg text-sm"
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
                className="absolute left-3 top-2.5 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pengguna..."
                className="w-full pl-9 p-2 border rounded-lg text-sm"
              />
            </div>
            {selectedUser && (
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs text-indigo-600 underline"
              >
                Semua Pengguna
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left font-medium">Pengguna</th>
                  <th className="p-3 text-right font-medium">Call</th>
                  <th className="p-3 text-right font-medium">Input</th>
                  <th className="p-3 text-right font-medium">Output</th>
                  <th className="p-3 text-right font-medium">Total Token</th>
                  <th className="p-3 text-right font-medium">Biaya (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgg.map((a) => (
                  <tr key={a.user_id} className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <button
                        onClick={() =>
                          setSelectedUser(
                            selectedUser === a.user_id ? null : a.user_id,
                          )
                        }
                        className="text-left"
                      >
                        <span className={`font-medium ${selectedUser === a.user_id ? "text-indigo-600" : ""}`}>
                          {a.user_name || "Unknown"}
                        </span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {a.user_email}
                        </span>
                      </button>
                    </td>
                    <td className="p-3 text-right">{a.total_calls}</td>
                    <td className="p-3 text-right">
                      {a.total_input_tokens.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {a.total_output_tokens.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {a.total_tokens.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-indigo-600 font-medium">
                      {formatIdr(a.total_cost_idr)}
                    </td>
                  </tr>
                ))}
                {filteredAgg.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      Belum ada data penggunaan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedUser && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <span className="text-sm font-medium">Breakdown per Model</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-medium">Model</th>
                    <th className="p-3 text-left font-medium">Modul</th>
                    <th className="p-3 text-right font-medium">Call</th>
                    <th className="p-3 text-right font-medium">Token</th>
                    <th className="p-3 text-right font-medium">Biaya</th>
                  </tr>
                </thead>
                <tbody>
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
                      <tr key={i} className="border-t">
                        <td className="p-3 text-xs font-mono">{m.model_id}</td>
                        <td className="p-3 text-xs">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                            {m.module}
                          </span>
                        </td>
                        <td className="p-3 text-right text-xs">{m.calls}</td>
                        <td className="p-3 text-right text-xs">
                          {m.total_tokens.toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-xs text-indigo-600">
                          {formatIdr(m.cost_idr)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {!selectedUser && allModels.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <span className="text-sm font-medium">Keseluruhan per Model</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-medium">Model</th>
                    <th className="p-3 text-left font-medium">Modul</th>
                    <th className="p-3 text-right font-medium">Call</th>
                    <th className="p-3 text-right font-medium">Token</th>
                    <th className="p-3 text-right font-medium">Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {allModels.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 text-xs font-mono">{m.model_id}</td>
                      <td className="p-3 text-xs">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                          {m.module}
                        </span>
                      </td>
                      <td className="p-3 text-right text-xs">{m.calls}</td>
                      <td className="p-3 text-right text-xs">
                        {m.total_tokens.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-xs text-indigo-600">
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

      {tab === "pricing" && canEditPricing && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h2 className="font-semibold mb-4">Kurs USD ke IDR</h2>
            <div className="flex items-center gap-3 max-w-sm">
              <input
                type="number"
                value={billingRate}
                onChange={(e) => setBillingRate(Number(e.target.value))}
                className="flex-1 p-2 border rounded-lg text-sm"
                min={1}
              />
              <button
                onClick={handleSaveBilling}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                Simpan
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left font-medium">Model</th>
                  <th className="p-3 text-left font-medium">Provider</th>
                  <th className="p-3 text-right font-medium">Input ($/jt)</th>
                  <th className="p-3 text-right font-medium">Output ($/jt)</th>
                  <th className="p-3 text-center font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">{getModuleLabel(entry.module)}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <span className="text-gray-500">Skenario:</span>{" "}
              {entry.scenario_title}
            </div>
            <div>
              <span className="text-gray-500">Pengguna:</span>{" "}
              {entry.user_email || "-"}
            </div>
            <div>
              <span className="text-gray-500">Waktu:</span>{" "}
              {formatDate(entry.created_at)}
            </div>
            <div>
              <span className="text-gray-500">Durasi:</span>{" "}
              {formatDuration(entry.duration_seconds)}
            </div>
            <div>
              <span className="text-gray-500">Skor:</span>{" "}
              {entry.score !== null ? entry.score : "-"}
            </div>
          </div>

          {entry.module === "ketik" && Array.isArray(entry.history) && (
            <div className="space-y-3">
              {entry.history.map((msg: any, i: number) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-sm ${msg.role === "user" ? "bg-indigo-50 ml-8" : "bg-gray-100 mr-8"}`}
                >
                  <div className="text-xs font-medium mb-1 text-gray-400">
                    {msg.role === "user" ? "USER" : "AI"}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.text || msg.content || "(empty)"}</div>
                </div>
              ))}
            </div>
          )}

          {entry.module === "pdkt" && Array.isArray(entry.history) && (
            <div className="space-y-3">
              {entry.history.map((email: any, i: number) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-sm ${email.type !== "received" ? "bg-indigo-50 ml-8" : "bg-gray-100 mr-8"}`}
                >
                  <div className="text-xs font-medium mb-1 text-gray-400">
                    {email.type !== "received" ? "RESPONSE" : "INCOMING"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {email.subject || "(no subject)"}
                  </div>
                  <div className="whitespace-pre-wrap mt-1">
                    {email.body || email.content || "(empty)"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {entry.module === "telefun" && typeof entry.history === "string" && (
            <div className="text-center p-8 text-gray-500">
              <Phone size={32} className="mx-auto mb-2 text-gray-300" />
              <p>Rekaman suara tersedia di:</p>
              <a
                href={entry.history}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 text-sm break-all"
              >
                {entry.history}
              </a>
            </div>
          )}

          {entry.module === "telefun" &&
            typeof entry.history !== "string" &&
            !Array.isArray(entry.history) && (
              <div className="text-center p-8 text-gray-400 text-sm">
                Tidak ada transkrip tersedia.
              </div>
            )}
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
    <tr className="border-t hover:bg-gray-50">
      <td className="p-3">
        <span className="font-medium">{entry.model_name}</span>
        <span className="text-gray-400 ml-2 text-xs">{entry.model_id}</span>
      </td>
      <td className="p-3">
        <span
          className={`text-xs px-2 py-1 rounded ${entry.provider === "gemini" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}
        >
          {entry.provider}
        </span>
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(Number(e.target.value))}
            className="w-24 p-1 border rounded text-right text-sm"
            step={0.01}
          />
        ) : (
          input
        )}
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <input
            type="number"
            value={output}
            onChange={(e) => setOutput(Number(e.target.value))}
            className="w-24 p-1 border rounded text-right text-sm"
            step={0.01}
          />
        ) : (
          output
        )}
      </td>
      <td className="p-3 text-center">
        {editing ? (
          <div className="flex gap-1 justify-center">
            <button
              onClick={handleSave}
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
            >
              Simpan
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
