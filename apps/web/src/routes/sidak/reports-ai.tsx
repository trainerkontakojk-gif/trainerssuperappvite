import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Brain, Loader2, AlertCircle, CheckCircle, FileText, Printer } from 'lucide-react';
import { useApi, postApi } from '../../hooks/useApi';

const SERVICE_TYPES = ['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik'] as const;

export default function SidakReportsAi() {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: periods } = useApi<any[]>('/sidak/periods');
  const { data: agents } = useApi<any[]>('/sidak/agents');

  const [mode, setMode] = useState<'layanan' | 'individu'>('layanan');
  const [serviceType, setServiceType] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [pesertaId, setPesertaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);

  const availableYears = periods
    ? [...new Set(periods.map((p: any) => p.year))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await postApi<any>('/sidak/reports/ai/generate', {
        serviceType: serviceType || undefined,
        year,
        startMonth,
        endMonth,
        pesertaId: pesertaId || undefined,
        mode,
      });
      setReport(result);
    } catch (e: any) {
      setError(e.message || 'Gagal generate laporan');
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-area { break-inside: avoid; page-break-inside: avoid; }
          .print-page { page-break-after: always; }
          @page { margin: 2cm; size: A4; }
        }
      `}</style>

      <div className="space-y-6 no-print">
        <div>
          <Link to="/sidak/reports" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Kembali ke Laporan
          </Link>
          <h2 className="text-lg font-bold text-gray-900 mt-1">Laporan AI</h2>
          <p className="text-sm text-gray-500">Generate laporan analisis QA otomatis dengan AI.</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode:</span>
            {(['layanan', 'individu'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setPesertaId(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m === 'layanan' ? 'Per Layanan' : 'Per Individu'}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {mode === 'layanan' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">Layanan</span>
                <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                  <option value="">Semua Layanan</option>
                  {SERVICE_TYPES.map(st => (
                    <option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">Agent</span>
                <select value={pesertaId} onChange={e => setPesertaId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                  <option value="">Pilih Agent</option>
                  {(agents || []).map((a: any) => (
                    <option key={a.id} value={a.id}>{a.nama} ({a.batch_name || '-'})</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Tahun</span>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Dari Bulan</span>
              <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Ke Bulan</span>
              <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={generateReport}
            disabled={loading || (mode === 'individu' && !pesertaId)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? 'Mengenerate Laporan...' : 'Generate Laporan AI'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {report && (
        <div ref={printRef} className="space-y-4 print-area">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-amber-50 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-semibold text-gray-900">Laporan berhasil digenerate</span>
              <span className="ml-auto text-xs text-gray-500">
                {report.metadata?.totalRows} baris · {report.metadata?.totalFindings} temuan
              </span>
              <button onClick={() => window.print()} className="no-print inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition ml-2">
                <Printer className="h-3.5 w-3.5" />
                Cetak
              </button>
            </div>
          </div>

          {report.report?.executiveSummary && (
            <div className="print-area rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                Ringkasan Eksekutif
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.report.executiveSummary}</p>
            </div>
          )}

          {report.report?.keyFindings && report.report.keyFindings.length > 0 && (
            <div className="print-area rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Temuan Penting</h3>
              <ul className="space-y-2">
                {report.report.keyFindings.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.report?.recommendations && report.report.recommendations.length > 0 && (
            <div className="print-area rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Rekomendasi</h3>
              <ul className="space-y-2">
                {report.report.recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.report?.priorityAreas && report.report.priorityAreas.length > 0 && (
            <div className="print-area rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Area Prioritas</h3>
              <div className="flex flex-wrap gap-2">
                {report.report.priorityAreas.map((a: string, i: number) => (
                  <span key={i} className="inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.report?.scoreAnalysis && (
            <div className="print-page rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Analisis Skor</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{report.report.scoreAnalysis}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
