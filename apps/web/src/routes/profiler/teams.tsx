import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2, Info } from 'lucide-react';
import { profilerApi } from '../../lib/profilerService';
import type { ProfilerTim } from '@trainers/types';

const DEFAULT_TEAMS = ['Telepon', 'Chat', 'Email'];

export default function ProfilerTeams() {
  const [teams, setTeams] = useState<ProfilerTim[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    profilerApi.getTeams().then(setTeams).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addTeam = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const team = await profilerApi.createTeam(newName.trim());
      setTeams(prev => [...prev, team]);
      setNewName('');
    } catch (e: any) {
      setError(e.message);
    }
    setAdding(false);
  };

  const deleteTeam = async (id: string) => {
    if (!confirm('Hapus tim ini?')) return;
    await profilerApi.deleteTeam(id);
    setTeams(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/profiler" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Kembali ke Profiler
        </Link>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Manajemen Tim</h2>
        <p className="text-sm text-gray-500">Atur daftar tim yang tersedia untuk peserta.</p>
      </div>

      <div className="rounded-xl border bg-blue-50 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold">Tim Default</p>
          <p className="mt-1">Tim <strong>{DEFAULT_TEAMS.join(', ')}</strong> adalah tim bawaan sistem dan tidak bisa dihapus. Anda bisa menambahkan tim kustom di bawah.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama tim baru..."
            className="flex-1 rounded-lg border px-4 py-2 text-sm outline-none focus:border-amber-500 transition"
            onKeyDown={(e) => e.key === 'Enter' && addTeam()}
          />
          <button
            onClick={addTeam}
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            <span>{error}</span>
            <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Tutup</button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm divide-y">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Memuat...</div>
        ) : teams.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Belum ada tim.</div>
        ) : teams.map(team => (
          <div key={team.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{team.nama}</span>
              {DEFAULT_TEAMS.includes(team.nama) && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Sistem</span>
              )}
            </div>
            {!DEFAULT_TEAMS.includes(team.nama) && (
              <button onClick={() => deleteTeam(team.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
