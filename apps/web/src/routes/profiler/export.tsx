import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileSpreadsheet, FileDown, FileText, Loader2 } from 'lucide-react';
import { useQueryParams } from '../../hooks/useQueryParams';
import { profilerApi } from '../../lib/profilerService';
import type { ProfilerPeserta } from '@trainers/types';

export default function ProfilerExport() {
  const { batch } = useQueryParams();
  const batchName = batch || '';

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    if (!batchName) return;
    profilerApi.getPesertaByBatch(batchName)
      .then(setPeserta)
      .finally(() => setLoading(false));
  }, [batchName]);

  const exportExcel = async () => {
    setGenerating('excel');
    try {
      const XLSX = await import('xlsx');
      const data = peserta.map(p => ({
        Nama: p.nama,
        Tim: p.tim,
        Jabatan: p.jabatan,
        'NIP OJK': p.nik_ojk || '',
        Email: p.email_ojk || '',
        Telepon: p.no_telepon || '',
        'Tgl Bergabung': p.bergabung_date || '',
        'Jenis Kelamin': p.jenis_kelamin || '',
        Pendidikan: p.pendidikan || '',
        Agama: p.agama || '',
        'No KTP': p.no_ktp || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Peserta');
      XLSX.writeFile(wb, `profiler-${batchName}.xlsx`);
    } catch (e) {
      alert('Gagal export Excel');
    }
    setGenerating(null);
  };

  const exportCSV = async () => {
    setGenerating('csv');
    try {
      const XLSX = await import('xlsx');
      const data = peserta.map(p => ({
        Nama: p.nama,
        Tim: p.tim,
        Jabatan: p.jabatan,
        'NIP OJK': p.nik_ojk || '',
        Email: p.email_ojk || '',
        Telepon: p.no_telepon || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `profiler-${batchName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Gagal export CSV');
    }
    setGenerating(null);
  };

  if (!batchName) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Pilih batch terlebih dahulu.</p>
        <Link to="/profiler" className="mt-4 inline-flex items-center gap-2 text-indigo-600 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
      </div>
    );
  }

  const exportOptions = [
    { id: 'excel', icon: FileSpreadsheet, label: 'Excel (.xlsx)', desc: 'Export data ke format Excel dengan semua kolom', action: exportExcel, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { id: 'csv', icon: FileText, label: 'CSV (.csv)', desc: 'Export data ke format CSV untuk analisis lanjutan', action: exportCSV, color: 'text-blue-600', bg: 'bg-blue-100' },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/profiler" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali
        </Link>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Ekspor Data — {batchName}</h2>
        <p className="text-sm text-gray-500">{peserta.length} peserta tersedia untuk diexport.</p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">Memuat...</div>
      ) : (
        <div className="space-y-3">
          {exportOptions.map(opt => (
            <button
              key={opt.id}
              onClick={opt.action}
              disabled={generating !== null}
              className="w-full flex items-center gap-4 p-5 rounded-xl border bg-white hover:shadow-sm transition-all text-left disabled:opacity-60"
            >
              <div className={`w-12 h-12 rounded-xl ${opt.bg} ${opt.color} flex items-center justify-center shrink-0`}>
                {generating === opt.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <opt.icon className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
              <FileDown className="h-5 w-5 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
