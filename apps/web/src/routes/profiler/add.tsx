import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useQueryParams } from '../../hooks/useQueryParams';

function qs(obj: Record<string, string>) {
  return '?' + new URLSearchParams(obj).toString();
}
import { profilerApi } from '../../lib/profilerService';

export default function ProfilerAdd() {
  const { batch } = useQueryParams();
  const batchName = batch || '';

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    batch_name: batchName,
    nama: '',
    tim: '',
    jabatan: '',
    nik_ojk: '',
    bergabung_date: '',
    email_ojk: '',
    no_telepon: '',
    jenis_kelamin: '',
    agama: '',
    tgl_lahir: '',
    status_perkawinan: '',
    pendidikan: '',
    no_ktp: '',
    no_npwp: '',
    alamat_tinggal: '',
    nama_lembaga: '',
    jurusan: '',
    previous_company: '',
    pengalaman_cc: '',
    catatan_tambahan: '',
    keterangan: '',
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama || !form.tim || !form.jabatan) {
      setError('Nama, Tim, dan Jabatan wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await profilerApi.createPeserta({ ...form, batch_name: batchName } as any);
      window.location.href = `/profiler/table${qs({ batch: batchName })}`;
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
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
    <div className="max-w-3xl space-y-6">
      <div>
        <a href={`/profiler/table${qs({ batch: batchName })}`} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali ke Tabel
        </a>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Tambah Peserta — {batchName}</h2>
      </div>

      {error && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identitas Utama */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Identitas Utama</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { key: 'nama', label: 'Nama *', required: true },
              { key: 'tim', label: 'Tim *', required: true },
              { key: 'jabatan', label: 'Jabatan *', required: true },
              { key: 'nik_ojk', label: 'NIP OJK' },
              { key: 'email_ojk', label: 'Email' },
              { key: 'no_telepon', label: 'Telepon' },
              { key: 'bergabung_date', label: 'Tgl Bergabung', type: 'date' },
              { key: 'tgl_lahir', label: 'Tgl Lahir', type: 'date' },
            ].map(field => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">{field.label}</span>
                <input
                  type={field.type || 'text'}
                  value={(form as any)[field.key] || ''}
                  onChange={(e) => update(field.key, e.target.value)}
                  required={field.required}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Data Pribadi */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Data Pribadi</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { key: 'jenis_kelamin', label: 'Jenis Kelamin' },
              { key: 'agama', label: 'Agama' },
              { key: 'status_perkawinan', label: 'Status Perkawinan' },
              { key: 'pendidikan', label: 'Pendidikan' },
              { key: 'no_ktp', label: 'No KTP' },
              { key: 'no_npwp', label: 'NPWP' },
              { key: 'alamat_tinggal', label: 'Alamat' },
              { key: 'nama_lembaga', label: 'Lembaga' },
              { key: 'jurusan', label: 'Jurusan' },
              { key: 'previous_company', label: 'Perusahaan Sebelumnya' },
              { key: 'pengalaman_cc', label: 'Pengalaman CC' },
            ].map(field => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-500">{field.label}</span>
                <input
                  type="text"
                  value={(form as any)[field.key] || ''}
                  onChange={(e) => update(field.key, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Catatan */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Catatan</h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Catatan Tambahan</span>
              <textarea
                value={form.catatan_tambahan}
                onChange={(e) => update('catatan_tambahan', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-500">Keterangan</span>
              <textarea
                value={form.keterangan}
                onChange={(e) => update('keterangan', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
              />
            </label>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white hover:opacity-90 transition disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Peserta
          </button>
        </div>
      </form>
    </div>
  );
}
