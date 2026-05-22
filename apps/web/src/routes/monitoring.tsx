import { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  History,
  Search,
  AlertCircle,
} from "lucide-react";

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

export default function MonitoringPage() {
  const [tab, setTab] = useState<"usage" | "pricing">("usage");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [aggregation, setAggregation] = useState<UsageAggregation[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [billingRate, setBillingRate] = useState(15000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchAggregation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/ai/monitoring/aggregation?year=${year}&month=${month}`,
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

  const fetchPricing = async () => {
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
    if (tab === "usage") fetchAggregation();
    else fetchPricing();
  }, [tab, year, month]);

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

  const filteredAgg = aggregation.filter(
    (a) =>
      a.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.user_email?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalSummary = aggregation.reduce(
    (acc, a) => ({
      calls: acc.calls + a.total_calls,
      tokens: acc.tokens + a.total_tokens,
      cost: acc.cost + a.total_cost_idr,
    }),
    { calls: 0, tokens: 0, cost: 0 },
  );

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
            onClick={() => setTab("usage")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "usage" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <BarChart3 size={16} className="inline mr-1" />
            Penggunaan Token
          </button>
          <button
            onClick={() => setTab("pricing")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "pricing" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <DollarSign size={16} className="inline mr-1" />
            Harga & Kurs
          </button>
        </div>
      </div>

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
                      <span className="font-medium">
                        {a.user_name || "Unknown"}
                      </span>
                      <span className="text-gray-400 ml-2 text-xs">
                        {a.user_email}
                      </span>
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
                      Rp {a.total_cost_idr.toLocaleString()}
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
        </>
      )}

      {tab === "pricing" && (
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
