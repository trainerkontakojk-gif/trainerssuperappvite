import { useApi, postApi } from '../../hooks/useApi';
import { useState } from 'react';
import type { QAPeriod } from '@trainers/types';
import { Plus, CalendarDays } from 'lucide-react';

export default function SidakPeriodsPage() {
  const { data: periods, loading, refetch } = useApi<QAPeriod[]>('/sidak/periods');
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await postApi('/sidak/periods', { month, year });
      setMessage({ type: 'success', text: 'Periode berhasil dibuat' });
      setShowForm(false);
      refetch();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const grouped: Record<number, QAPeriod[]> = {};
  (periods ?? []).forEach((p: any) => {
    if (!grouped[p.year]) grouped[p.year] = [];
    grouped[p.year].push(p);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Periode Audit</h2>
          <p className="text-gray-500">Kelola periode audit</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus size={18} /> Tambah Periode
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border shadow-sm p-4 flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
            <select className="border rounded-lg p-2" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tahun</label>
            <input
              type="number"
              className="border rounded-lg p-2 w-24"
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              min={2020}
              max={2100}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center text-gray-500 py-8">Belum ada periode</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => parseInt(b) - parseInt(a))
            .map(([year, per]) => (
              <div key={year} className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <CalendarDays size={16} className="text-indigo-500" />
                  {year}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {per
                    .sort((a, b) => b.month - a.month)
                    .map((p: any) => (
                      <span key={p.id} className="px-3 py-1.5 bg-gray-50 rounded-lg text-sm font-medium text-gray-700 border">
                        {String(p.month).padStart(2, '0')}/{p.year}
                      </span>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
