import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, ArrowLeft, User, GripVertical, Check, X, Trash2, Edit3 } from 'lucide-react';
import { useQueryParams } from '../../hooks/useQueryParams';
import { profilerApi } from '../../lib/profilerService';
import type { ProfilerPeserta } from '@trainers/types';

export default function ProfilerTable() {
  const { batch } = useQueryParams();
  const batchName = batch || '';

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [timFilter, setTimFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProfilerPeserta>>({});

  useEffect(() => {
    if (!batchName) return;
    setLoading(true);
    profilerApi.getPesertaByBatch(batchName)
      .then(setPeserta)
      .finally(() => setLoading(false));
  }, [batchName]);

  const tims = [...new Set(peserta.map(p => p.tim))].sort();

  const filtered = peserta.filter(p => {
    if (search && !p.nama.toLowerCase().includes(search.toLowerCase()) && !p.nik_ojk?.includes(search)) return false;
    if (timFilter && p.tim !== timFilter) return false;
    return true;
  });

  const startEdit = (p: ProfilerPeserta) => {
    setEditingId(p.id);
    setEditForm({ ...p });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await profilerApi.updatePeserta(editingId, editForm);
    setPeserta(prev => prev.map(p => p.id === editingId ? { ...p, ...editForm } : p));
    setEditingId(null);
  };

  const deletePeserta = async (id: string) => {
    if (!confirm('Hapus peserta ini?')) return;
    await profilerApi.deletePeserta(id);
    setPeserta(prev => prev.filter(p => p.id !== id));
  };

  if (!batchName) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Pilih batch terlebih dahulu dari halaman Profiler.</p>
        <Link to="/profiler" className="mt-4 inline-flex items-center gap-2 text-indigo-600 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Profiler
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/profiler" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Kembali
          </Link>
          <h2 className="text-lg font-bold text-gray-900 mt-1">Tabel Peserta — {batchName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/profiler/add" search={{ batch: batchName }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition">
            + Tambah
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama atau NIP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none focus:border-indigo-500 transition"
          />
        </div>
        <select
          value={timFilter}
          onChange={(e) => setTimFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Semua Tim</option>
          {tims.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} peserta</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Tidak ada peserta ditemukan.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tim</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jabatan</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NIP OJK</th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${editingId === p.id ? 'bg-amber-50' : ''}`}>
                  <td className="p-2 pl-3">
                    <GripVertical className="h-4 w-4 text-gray-300 cursor-grab" />
                  </td>
                  <td className="p-3">
                    {editingId === p.id ? (
                      <input
                        value={editForm.nama ?? ''}
                        onChange={(e) => setEditForm(f => ({ ...f, nama: e.target.value }))}
                        className="w-full rounded border px-2 py-1 text-sm outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                          <User className="h-4 w-4" />
                        </div>
                        <span className="font-medium text-gray-900">{p.nama}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {editingId === p.id ? (
                      <input
                        value={editForm.tim ?? ''}
                        onChange={(e) => setEditForm(f => ({ ...f, tim: e.target.value }))}
                        className="w-full rounded border px-2 py-1 text-sm outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{p.tim}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {editingId === p.id ? (
                      <input
                        value={editForm.jabatan ?? ''}
                        onChange={(e) => setEditForm(f => ({ ...f, jabatan: e.target.value }))}
                        className="w-full rounded border px-2 py-1 text-sm outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <span className="text-gray-600">{p.jabatan}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{p.nik_ojk || '-'}</td>
                  <td className="p-3 text-right">
                    {editingId === p.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={saveEdit} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={() => deletePeserta(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
