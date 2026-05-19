import { useState, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Upload, FileSpreadsheet, Download, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useQueryParams } from '../../hooks/useQueryParams';


import { profilerApi } from '../../lib/profilerService';

interface ImportResult {
  success: number;
  skipped: number;
  errors: string[];
}

function qs(obj: Record<string, string>) {
  return '?' + new URLSearchParams(obj).toString();
}

export default function ProfilerImport() {
  const { batch } = useQueryParams();
  const batchName = batch || '';

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nama*', 'Tim*', 'Jabatan*', 'NIP OJK', 'Email', 'Telepon', 'Jenis Kelamin', 'Pendidikan'],
      ['', '', '', '', '', '', '', ''],
    ]);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `template-import-${batchName}.xlsx`);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    setResult(null);
    setError(null);
  };

  const processImport = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const headerRow = rows[0] as string[];
      const namaIdx = headerRow.findIndex(h => h?.toString().toLowerCase().includes('nama'));
      const timIdx = headerRow.findIndex(h => h?.toString().toLowerCase().includes('tim'));
      const jabatanIdx = headerRow.findIndex(h => h?.toString().toLowerCase().includes('jabatan'));

      if (namaIdx === -1 || timIdx === -1 || jabatanIdx === -1) {
        throw new Error('Format file tidak sesuai. Pastikan ada kolom Nama, Tim, dan Jabatan.');
      }

      let success = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[namaIdx]) { skipped++; continue; }

        try {
          await profilerApi.createPeserta({
            batch_name: batchName,
            nama: String(row[namaIdx] || '').trim(),
            tim: String(row[timIdx] || '').trim(),
            jabatan: String(row[jabatanIdx] || '').trim(),
          });
          success++;
        } catch (e: any) {
          errors.push(`Baris ${i + 1}: ${e.message}`);
          skipped++;
        }
      }

      setResult({ success, skipped, errors });
    } catch (e: any) {
      setError(e.message);
    }
    setProcessing(false);
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <a href={`/profiler/table${qs({ batch: batchName })}`} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali
        </a>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Import Excel — {batchName}</h2>
      </div>

      {/* Step 1: Download Template */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">1. Download Template</p>
            <p className="text-xs text-gray-500">Download template Excel, isi data peserta, lalu upload kembali.</p>
          </div>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition">
            <Download className="h-4 w-4" /> Template
          </button>
        </div>
      </div>

      {/* Step 2: Upload */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Upload className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">2. Upload File</p>
            <p className="text-xs text-gray-500">Upload file .xlsx atau .xls yang sudah diisi.</p>
          </div>
          <label className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition cursor-pointer">
            <Upload className="h-4 w-4" /> Pilih File
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
        </div>
        {file && (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-700 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            {file.name}
          </div>
        )}
      </div>

      {/* Step 3: Import */}
      {file && !result && (
        <button
          onClick={processImport}
          disabled={processing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white hover:opacity-90 transition disabled:opacity-60"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {processing ? 'Memproses...' : 'Mulai Import'}
        </button>
      )}

      {error && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-gray-900">Hasil Import</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 text-center">
              <CheckCircle className="h-6 w-6 text-emerald-600 mx-auto" />
              <p className="text-2xl font-bold text-emerald-600 mt-1">{result.success}</p>
              <p className="text-xs text-emerald-700">Berhasil</p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 text-center">
              <span className="text-2xl font-bold text-gray-500">{result.skipped}</span>
              <p className="text-xs text-gray-500 mt-1">Dilewati</p>
            </div>
            <div className="p-4 rounded-xl bg-red-50 text-center">
              <XCircle className="h-6 w-6 text-red-600 mx-auto" />
              <p className="text-2xl font-bold text-red-600 mt-1">{result.errors.length}</p>
              <p className="text-xs text-red-700">Error</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 bg-red-50 p-2 rounded">{err}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setFile(null); setResult(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition">
              Import Lagi
            </button>
            <a href={`/profiler/table${qs({ batch: batchName })}`}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white text-center hover:opacity-90 transition">
              Lihat Tabel
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
