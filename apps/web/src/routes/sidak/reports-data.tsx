import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Search, Download, Loader2, AlertCircle } from 'lucide-react';
import { useApi, postApi } from '../../hooks/useApi';
import type { ServiceType } from '@trainers/types';

const SERVICE_TYPES = ['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik'] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: 'Call', chat: 'Chat', email: 'Email', cso: 'CSO',
  pencatatan: 'Pencatatan', bko: 'BKO', slik: 'SLIK',
};

export default function SidakReportsData() {
  const { data: periods } = useApi<any[]>('/sidak/periods');
  const { data: agents } = useApi<any[]>('/sidak/agents');

  const [serviceType, setServiceType] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [pesertaId, setPesertaId] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableYears = periods
    ? [...new Set(periods.map((p: any) => p.year))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postApi<any[]>('/sidak/reports/data', {
        serviceType: serviceType || undefined,
        year,
        startMonth,
        endMonth,
        pesertaId: pesertaId || undefined,
      });
      setResults(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const exportExcel = async () => {
    if (!results || results.length === 0) return;
    const XLSX = await import('xlsx');
    const rows = results.map(r => ({
      Layanan: SERVICE_LABELS[r.service_type] || r.service_type,
      Periode: `${String(r.qa_periods?.month || '').padStart(2, '0')}/${r.qa_periods?.year || ''}`,
      Agen: r.profiler_peserta?.nama || '',
      Batch: r.profiler_peserta?.batch_name || '',
      'No. Tiket': r.no_tiket || '',
      Parameter: r.qa_indicators?.name || '',
      Temuan: r.ketidaksesuaian || '',
      Seharusnya: r.sebaiknya || '',
      Skor: r.nilai,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Laporan');
    XLSX.writeFile(wb, `laporan-data-${year}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/sidak/reports" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali ke Laporan
        </Link>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Laporan Data QA</h2>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Layanan</span>
            <select value={serviceType} onChange={e => setServiceType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-rose-500">
              <option value="">Semua Layanan</option>
              {SERVICE_TYPES.map(st => (
                <option key={st} value={st}>{SERVICE_LABELS[st]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Tahun</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-rose-500">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Dari Bulan</span>
            <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-rose-500">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-500">Ke Bulan</span>
            <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-rose-500">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Memuat...' : 'Cari Data'}
          </button>
          {results && results.length > 0 && (
            <button onClick={exportExcel}
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold hover:bg-gray-50 transition">
              <Download className="h-4 w-4" /> Export Excel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{results.length} temuan ditemukan</p>
          </div>
          {results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Tidak ada data untuk filter yang dipilih.</div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Layanan</th>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Periode</th>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Agen</th>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Parameter</th>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Temuan</th>
                    <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Seharusnya</th>
                    <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Skor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r: any, i: number) => (
                    <tr key={r.id || i} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-700">{SERVICE_LABELS[r.service_type] || r.service_type}</td>
                      <td className="p-3 text-gray-600 font-mono text-xs">
                        {String(r.qa_periods?.month || '').padStart(2, '0')}/{r.qa_periods?.year || ''}
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-gray-900">{r.profiler_peserta?.nama || '-'}</span>
                        <span className="text-xs text-gray-400 ml-1">({r.profiler_peserta?.batch_name || ''})</span>
                      </td>
                      <td className="p-3 text-gray-700">{r.qa_indicators?.name || '-'}</td>
                      <td className="p-3 text-rose-700 italic text-xs max-w-[200px] truncate">{r.ketidaksesuaian || '-'}</td>
                      <td className="p-3 text-emerald-700 text-xs max-w-[200px] truncate">{r.sebaiknya || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                          (r.nilai ?? 3) >= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>{r.nilai}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
