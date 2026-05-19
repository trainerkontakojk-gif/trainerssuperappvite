import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryParams } from '../../hooks/useQueryParams';
import { profilerApi } from '../../lib/profilerService';
import type { ProfilerPeserta } from '@trainers/types';

export default function ProfilerSlides() {
  const { batch } = useQueryParams();
  const batchName = batch || '';

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!batchName) return;
    profilerApi.getPesertaByBatch(batchName)
      .then(setPeserta)
      .finally(() => setLoading(false));
  }, [batchName]);

  const p = peserta[index];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/profiler" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{index + 1} / {peserta.length}</span>
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIndex(i => Math.min(peserta.length - 1, i + 1))}
            disabled={index === peserta.length - 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900">Tampilan Slide — {batchName}</h2>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Memuat...</div>
      ) : !p ? (
        <div className="text-center py-12 text-sm text-gray-400">Tidak ada peserta.</div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="grid md:grid-cols-[300px_1fr] min-h-[400px]">
            {/* Left sidebar */}
            <div className="bg-gray-50 p-6 border-r flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
                <span className="text-3xl font-bold">{p.nama.charAt(0)}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">{p.nama}</h3>
              <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 mt-2">{p.jabatan}</span>
              <span className="text-xs text-gray-500 mt-1">{p.tim}</span>

              <div className="mt-6 w-full space-y-3 text-left">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Masa Dinas</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    {p.bergabung_date
                      ? `${Math.floor((Date.now() - new Date(p.bergabung_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} tahun`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usia</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    {p.tgl_lahir
                      ? `${Math.floor((Date.now() - new Date(p.tgl_lahir).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} tahun`
                      : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Right content */}
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Data Pekerjaan</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">NIP OJK:</span><br /><span className="text-gray-900">{p.nik_ojk || '-'}</span></div>
                  <div><span className="text-gray-500">Email:</span><br /><span className="text-gray-900">{p.email_ojk || '-'}</span></div>
                  <div><span className="text-gray-500">Telepon:</span><br /><span className="text-gray-900">{p.no_telepon || '-'}</span></div>
                  <div><span className="text-gray-500">Bergabung:</span><br /><span className="text-gray-900">{p.bergabung_date || '-'}</span></div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Data Pribadi</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Jenis Kelamin:</span><br /><span className="text-gray-900">{p.jenis_kelamin || '-'}</span></div>
                  <div><span className="text-gray-500">Pendidikan:</span><br /><span className="text-gray-900">{p.pendidikan || '-'}</span></div>
                  <div><span className="text-gray-500">Status:</span><br /><span className="text-gray-900">{p.status_perkawinan || '-'}</span></div>
                  <div><span className="text-gray-500">Agama:</span><br /><span className="text-gray-900">{p.agama || '-'}</span></div>
                </div>
              </div>

              {p.catatan_tambahan && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Catatan</h4>
                  <p className="text-sm text-gray-700">{p.catatan_tambahan}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
