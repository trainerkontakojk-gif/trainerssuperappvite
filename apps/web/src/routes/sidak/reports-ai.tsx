import { useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft, Brain, Loader2, AlertCircle, CheckCircle,
  FileText, Printer, Download, Sparkles, Users,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { TEXT_SIMULATION_MODELS } from "../../lib/aiModels";

const SERVICE_TYPES = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

type ExportFormat = "docx" | "html" | "pdf";

export default function SidakReportsAi() {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: periods } = useApi<any[]>("/sidak/periods");
  const { data: agents } = useApi<any[]>("/sidak/agents");

  const [mode, setMode] = useState<"layanan" | "individu">("layanan");
  const [serviceType, setServiceType] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [pesertaId, setPesertaId] = useState("");
  const [modelId, setModelId] = useState("gemini-3.1-flash-lite");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("docx");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  const availableYears = periods
    ? [...new Set(periods.map((p: any) => p.year))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await unwrapResponse(await sidakClient.reports.ai.generate.$post({ json: {
        modelId,
        serviceType: mode === "layanan" ? (serviceType || undefined) : undefined,
        year,
        startMonth,
        endMonth,
        pesertaId: mode === "individu" ? (pesertaId || undefined) : undefined,
        mode,
      }}));
      setReport(result);
    } catch (e: any) {
      setError(e.message || "Gagal generate laporan");
    }
    setLoading(false);
  };

  const handleExport = useCallback(async () => {
    if (!report) return;
    setExporting(true);
    try {
      const endpoint = exportFormat === "docx"
        ? "/sidak/reports/ai/export-docx"
        : exportFormat === "html"
          ? "/sidak/reports/ai/export-html"
          : "/sidak/reports/ai/export-pdf";

      const body: any = {
        title: `Laporan AI - ${report.metadata?.serviceTypes || "Semua Layanan"}`,
        periodLabel: `${String(startMonth).padStart(2, "0")}-${String(endMonth).padStart(2, "0")}/${year}`,
        serviceLabel: report.metadata?.serviceTypes || "",
        mode,
        agentName: report.metadata?.agentName,
        totalFindings: report.metadata?.totalFindings ?? 0,
        totalRows: report.metadata?.totalRows ?? 0,
        executiveSummary: report.report?.executiveSummary || "",
        keyFindings: report.report?.keyFindings || [],
        scoreAnalysis: report.report?.scoreAnalysis || "",
        recommendations: report.report?.recommendations || [],
        priorityAreas: report.report?.priorityAreas || [],
      };

      const res = await fetch(`/api/v1${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || `Gagal export ${exportFormat.toUpperCase()}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-ai-${Date.now()}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }, [report, mode, startMonth, endMonth, year, exportFormat]);

  const exportLabel = exportFormat === "docx" ? "DOCX" : exportFormat === "html" ? "HTML" : "PDF";

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-area { break-inside: avoid; page-break-inside: avoid; }
          .print-page { page-break-after: always; }
          @page { margin: 2cm; size: A4; }
        }
      `}</style>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Link to="/sidak/reports" className="mb-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3 w-3" /> Kembali ke Laporan
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <div className="p-2.5 bg-amber-500/10 rounded-xl">
                <Sparkles className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">Laporan AI</h1>
                <p className="text-sm text-muted-foreground">Generate laporan analisis QA otomatis dengan AI.</p>
              </div>
            </div>
          </motion.div>

          {/* Filters */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-surface p-6 space-y-4"
          >
            {/* Mode + Model Selectors */}
            <div className="flex items-center flex-wrap gap-6">
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model:</span>
                <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                  className="rounded-xl border border-border px-3 py-2 text-sm bg-card outline-none focus:border-primary"
                >
                  {TEXT_SIMULATION_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Format:</span>
                {(["docx", "html", "pdf"] as ExportFormat[]).map((f) => (
                  <button key={f} onClick={() => setExportFormat(f)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      exportFormat === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
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
                    <option value="">Pilih Agen</option>
                    {(agents || []).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.nama} ({a.batch_name || "-"})</option>
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

            <button onClick={generateReport} disabled={loading || (mode === "individu" && !pesertaId)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              {loading ? "Mengenerate..." : "Generate Laporan"}
            </button>
          </motion.div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Report Output */}
        {report && (
          <div className="max-w-4xl mx-auto mt-6 space-y-4 px-4 md:px-8" ref={printRef}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="no-print flex items-center gap-3 p-4 rounded-2xl border border-border bg-surface"
            >
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-bold text-foreground/80">Laporan berhasil digenerate</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {report.metadata?.totalRows} baris · {report.metadata?.totalFindings} temuan
              </span>
              <div className="flex items-center gap-2 ml-2">
                <button onClick={handleExport} disabled={exporting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-60"
                >
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {exporting ? "Mengunduh..." : `Unduh ${exportLabel}`}
                </button>
                <button onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-foreground/5 px-4 py-2 text-xs font-bold text-foreground hover:bg-foreground/10 transition border border-border"
                >
                  <Printer className="h-3.5 w-3.5" /> Cetak
                </button>
              </div>
            </motion.div>

            {report.report?.executiveSummary && (
              <div className="print-area rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-sm font-bold text-foreground/90 mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" /> Ringkasan Eksekutif
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {report.report.executiveSummary}
                </p>
              </div>
            )}

            {report.report?.keyFindings?.length > 0 && (
              <div className="print-area rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-sm font-bold text-foreground/90 mb-3">Temuan Penting</h3>
                <ul className="space-y-2">
                  {report.report.keyFindings.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.report?.recommendations?.length > 0 && (
              <div className="print-area rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-sm font-bold text-foreground/90 mb-3">Rekomendasi</h3>
                <ul className="space-y-2">
                  {report.report.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.report?.priorityAreas?.length > 0 && (
              <div className="print-area rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-sm font-bold text-foreground/90 mb-3">Area Prioritas</h3>
                <div className="flex flex-wrap gap-2">
                  {report.report.priorityAreas.map((a: string, i: number) => (
                    <span key={i} className="inline-flex rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 border border-amber-500/20">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.report?.scoreAnalysis && (
              <div className="print-page rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-sm font-bold text-foreground/90 mb-3">Analisis Skor</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {report.report.scoreAnalysis}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
