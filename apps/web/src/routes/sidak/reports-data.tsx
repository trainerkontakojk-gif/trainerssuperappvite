import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft, Search, Download, Loader2, AlertCircle,
  FileText, Users,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { writeFlatExcel } from "../../lib/excel-utils";
import { Pagination } from "../../components/ui/Pagination";
import type { AgentDirectoryResponse } from "@trainers/types";
import {
  getReportFindingText,
  getReportTicketText,
  normalizeReportAgents,
  validateReportFilters,
} from "./reports-data-utils";

const SERVICE_TYPES = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

export default function SidakReportsData() {
  const { data: periods } = useApi<any[]>("/sidak/periods");

  const [mode, setMode] = useState<"layanan" | "individu">("layanan");
  const [serviceType, setServiceType] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: agentDirectory, loading: agentsLoading } =
    useApi<AgentDirectoryResponse>(`/sidak/agents?year=${year}`);
  const agents = normalizeReportAgents(agentDirectory);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [pesertaId, setPesertaId] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => { setPage(1); }, [serviceType, year, startMonth, endMonth, pesertaId, mode]);

  const availableYears = periods
    ? [...new Set(periods.map((p: any) => p.year))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  const fetchReport = async () => {
    const validationError = validateReportFilters({
      mode,
      pesertaId,
      startMonth,
      endMonth,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await unwrapResponse(await sidakClient.reports.data.$post({ json: {
        serviceType: mode === "layanan" ? (serviceType || undefined) : undefined,
        year,
        startMonth,
        endMonth,
        pesertaId: mode === "individu" ? (pesertaId || undefined) : undefined,
      }}));
      setResults(data as any[]);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
    setPage(1);
  };

  const exportExcel = async () => {
    if (!results || results.length === 0) return;
    const rows = results.map((r: any) => ({
      Layanan: SERVICE_LABELS[r.service_type] || r.service_type,
      Periode: `${String(r.qa_periods?.month || "").padStart(2, "0")}/${r.qa_periods?.year || ""}`,
      Agen: r.profiler_peserta?.nama || "",
      Batch: r.profiler_peserta?.batch_name || "",
      "No. Tiket": r.no_tiket || "",
      Parameter: r.qa_indicators?.name || "",
      Temuan: r.ketidaksesuaian || "",
      Seharusnya: r.sebaiknya || "",
      Skor: r.nilai,
    }));
    await writeFlatExcel("Data Laporan", rows, `laporan-data-${year}.xlsx`);
  };

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Link to="/sidak/reports" className="mb-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3 w-3" /> Kembali ke Laporan
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <div className="p-2.5 bg-blue-500/10 rounded-xl">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">Laporan Data</h1>
                <p className="text-sm text-muted-foreground">Data temuan QA dengan filter lengkap.</p>
              </div>
            </div>
          </motion.div>

          {/* Filters */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-surface p-6 space-y-4"
          >
            {/* Mode Toggle */}
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mode:</span>
              {(["layanan", "individu"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setPesertaId(""); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {m === "layanan" ? "Per Layanan" : "Per Individu"}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {mode === "layanan" ? (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layanan</span>
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
                  >
                    <option value="">Semua Layanan</option>
                    {SERVICE_TYPES.map((st) => (<option key={st} value={st}>{SERVICE_LABELS[st]}</option>))}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Agen
                  </span>
                  <select value={pesertaId} onChange={(e) => setPesertaId(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
                  >
                    <option value="">
                      {agentsLoading ? "Memuat agen..." : "Pilih Agen"}
                    </option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nama}{a.batch_name ? ` — ${a.batch_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tahun</span>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
                >
                  {availableYears.map((y) => (<option key={y} value={y}>{y}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dari Bulan</span>
                <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
                >
                  {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ke Bulan</span>
                <select value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value))}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
                >
                  {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={fetchReport} disabled={loading || (mode === "individu" && (!pesertaId || agentsLoading))}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? "Memuat..." : "Cari Data"}
              </button>
              {results && results.length > 0 && (
                <button onClick={exportExcel}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-bold hover:bg-foreground/5 transition"
                >
                  <Download className="h-4 w-4" /> Export Excel
                </button>
              )}
            </div>
          </motion.div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Results */}
          {results && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-surface overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-border bg-muted/50 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {results.length} temuan ditemukan
                </p>
              </div>
              {results.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Tidak ada data untuk filter yang dipilih.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layanan</th>
                          <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Periode</th>
                          <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agen</th>
                          <th className="min-w-[160px] text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nomor Tiket</th>
                          <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parameter</th>
                          <th className="w-[32%] min-w-[320px] text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-foreground">Temuan</th>
                          <th className="text-center px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Skor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {results.slice((page - 1) * pageSize, page * pageSize).map((r: any, i: number) => (
                          <tr key={r.id || i} className="hover:bg-primary/5 transition-colors">
                            <td className="px-6 py-4 text-foreground/80">{SERVICE_LABELS[r.service_type] || r.service_type}</td>
                            <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                              {String(r.qa_periods?.month || "").padStart(2, "0")}/{r.qa_periods?.year || ""}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-foreground/80">{r.profiler_peserta?.nama || "-"}</span>
                              <span className="text-xs text-muted-foreground ml-1">({r.profiler_peserta?.batch_name || ""})</span>
                            </td>
                            <td className="min-w-[160px] px-6 py-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                              {getReportTicketText(r)}
                            </td>
                            <td className="px-6 py-4 text-foreground/80">{r.qa_indicators?.name || "-"}</td>
                            <td className="min-w-[320px] max-w-[520px] px-6 py-4 align-top text-xs leading-relaxed text-foreground whitespace-normal break-words">
                              {getReportFindingText(r)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                                (r.nilai ?? 3) >= 3 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                              }`}>
                                {r.nilai}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-4 border-t border-border/50">
                    <Pagination page={page} pageSize={pageSize} total={results.length}
                      onPageChange={setPage}
                      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                      showPageSizeSelector
                    />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
