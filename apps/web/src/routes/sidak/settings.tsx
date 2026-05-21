import { useApi, putApi, postApi, deleteApi } from '../../hooks/useApi';
import { useState } from 'react';
import { Plus, Check, Archive, X, Loader2 } from 'lucide-react';
import { notify } from '../../lib/toast';
import type { ServiceType } from '@trainers/types';

interface ServiceWeightData {
  service_type: ServiceType;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: string;
}

interface RuleVersion {
  id: string;
  service_type: string;
  status: 'draft' | 'published' | 'superseded';
  version_number: number;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: string;
  change_reason?: string;
  created_by_user?: { full_name: string };
  published_by_user?: { full_name: string };
  created_at: string;
  published_at?: string;
}

const SERVICE_TYPES = ['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik'] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: 'Call', chat: 'Chat', email: 'Email', cso: 'CSO',
  pencatatan: 'Pencatatan', bko: 'BKO', slik: 'SLIK',
};

export default function SidakSettingsPage() {
  const [activeTab, setActiveTab] = useState<'weights' | 'versions'>('weights');
  const [saving, setSaving] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: weights, loading: weightsLoading, refetch: refetchWeights } = useApi<ServiceWeightData[]>('/sidak/service-weights');
  const { data: versions, loading: versionsLoading, refetch: refetchVersions } = useApi<RuleVersion[]>('/sidak/rule-versions');
  const { data: periods } = useApi<any[]>('/sidak/periods');

  const handleUpdate = async (serviceType: string, field: string, value: number | string) => {
    setSaving(serviceType);
    try {
      await putApi(`/sidak/service-weights/${serviceType}`, { [field]: value });
      notify.success(`${SERVICE_LABELS[serviceType] ?? serviceType} updated`);
      refetchWeights();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await postApi(`/sidak/rule-versions/${id}/publish`, {});
      notify.success('Versi published');
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleSupersede = async (id: string) => {
    try {
      await postApi(`/sidak/rule-versions/${id}/supersede`, {});
      notify.success('Versi dinonaktifkan');
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    const form = new FormData(e.currentTarget);
    try {
      await postApi('/sidak/rule-versions', {
        service_type: form.get('service_type'),
        effective_period_id: form.get('effective_period_id'),
        critical_weight: parseFloat(form.get('critical_weight') as string) || 0.5,
        non_critical_weight: parseFloat(form.get('non_critical_weight') as string) || 0.5,
        scoring_mode: form.get('scoring_mode') || 'weighted',
        change_reason: form.get('change_reason') || undefined,
      });
      notify.success('Draft versi baru dibuat');
      setCreateOpen(false);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-amber-100 text-amber-700 border-amber-200',
      published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      superseded: 'bg-gray-100 text-gray-500 border-gray-200',
    };
    const labels: Record<string, string> = {
      draft: 'Draft', published: 'Published', superseded: 'Superseded',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[status] || ''}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${status === 'draft' ? 'bg-amber-500' : status === 'published' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
        {labels[status] || status}
      </span>
    );
  };

  if (weightsLoading && activeTab === 'weights') return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">QA Settings</h2>
      <p className="text-gray-500">Service weights, scoring configuration, and parameter versioning</p>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('weights')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'weights' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Service Weights
        </button>
        <button onClick={() => setActiveTab('versions')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'versions' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Parameter Versions
        </button>
      </div>

      {activeTab === 'weights' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-3 font-medium text-gray-500">Service</th>
                <th className="p-3 font-medium text-gray-500">Mode</th>
                <th className="p-3 font-medium text-gray-500 text-right">Critical Weight</th>
                <th className="p-3 font-medium text-gray-500 text-right">Non-Critical Weight</th>
                <th className="p-3 font-medium text-gray-500 text-center">Sum</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(weights ?? []).map((w) => (
                <tr key={w.service_type} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{SERVICE_LABELS[w.service_type] ?? w.service_type}</td>
                  <td className="p-3">
                    <select className="border rounded p-1 text-sm" value={w.scoring_mode}
                      onChange={(e) => handleUpdate(w.service_type, 'scoring_mode', e.target.value)}
                      disabled={saving === w.service_type}>
                      <option value="weighted">Weighted</option>
                      <option value="flat">Flat</option>
                      <option value="no_category">No Category</option>
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <input type="number" step="0.05" min="0" max="1" className="w-20 border rounded p-1 text-right text-sm"
                      value={w.critical_weight}
                      onChange={(e) => handleUpdate(w.service_type, 'critical_weight', parseFloat(e.target.value))}
                      disabled={saving === w.service_type} />
                  </td>
                  <td className="p-3 text-right">
                    <input type="number" step="0.05" min="0" max="1" className="w-20 border rounded p-1 text-right text-sm"
                      value={w.non_critical_weight}
                      onChange={(e) => handleUpdate(w.service_type, 'non_critical_weight', parseFloat(e.target.value))}
                      disabled={saving === w.service_type} />
                  </td>
                  <td className={`p-3 text-center font-medium ${Math.abs(w.critical_weight + w.non_critical_weight - 1) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    {(w.critical_weight + w.non_critical_weight).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'versions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Manage draft, publish, and supersede parameter rule versions.</p>
            <button onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition">
              <Plus className="w-4 h-4" /> New Draft
            </button>
          </div>

          {createOpen && (
            <form onSubmit={handleCreateDraft} className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Create New Draft Version</h3>
                <button type="button" onClick={() => setCreateOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Service Type</span>
                  <select name="service_type" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                    {SERVICE_TYPES.map(st => (
                      <option key={st} value={st}>{SERVICE_LABELS[st]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Effective Period</span>
                  <select name="effective_period_id" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                    <option value="">Select period</option>
                    {(periods ?? []).map((p: any) => (
                      <option key={p.id} value={p.id}>{String(p.month).padStart(2, '0')}/{p.year}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Scoring Mode</span>
                  <select name="scoring_mode" defaultValue="weighted" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                    <option value="weighted">Weighted</option>
                    <option value="flat">Flat</option>
                    <option value="no_category">No Category</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Critical Weight</span>
                    <input name="critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={0.5}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Non-Critical Weight</span>
                    <input name="non_critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={0.5}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                  </label>
                </div>
                <label className="block col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Change Reason</span>
                  <input name="change_reason" placeholder="Why is this version being created?"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition disabled:opacity-60">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {creating ? 'Creating...' : 'Create Draft'}
                </button>
              </div>
            </form>
          )}

          {versionsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (versions ?? []).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-semibold">Belum ada versi aturan</p>
              <p className="text-sm mt-1">Buat draft baru untuk memulai.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(versions ?? []).map((v) => (
                <div key={v.id} className="bg-white rounded-xl border shadow-sm p-5 flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{SERVICE_LABELS[v.service_type] || v.service_type}</span>
                      {statusBadge(v.status)}
                      <span className="text-xs text-gray-400 font-mono">v{v.version_number}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Mode: <strong>{v.scoring_mode}</strong></span>
                      <span>Critical: <strong>{v.critical_weight}</strong></span>
                      <span>Non-Critical: <strong>{v.non_critical_weight}</strong></span>
                    </div>
                    {v.change_reason && <p className="text-xs text-gray-400 italic">{v.change_reason}</p>}
                    <div className="flex gap-4 text-[10px] text-gray-400">
                      <span>Created: {new Date(v.created_at).toLocaleDateString('id-ID')}{v.created_by_user ? ` by ${v.created_by_user.full_name}` : ''}</span>
                      {v.published_at && <span>Published: {new Date(v.published_at).toLocaleDateString('id-ID')}{v.published_by_user ? ` by ${v.published_by_user.full_name}` : ''}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {v.status === 'draft' && (
                      <button onClick={() => handlePublish(v.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition">
                        <Check className="w-3 h-3" /> Publish
                      </button>
                    )}
                    {v.status === 'published' && (
                      <button onClick={() => handleSupersede(v.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 border border-gray-200 transition">
                        <Archive className="w-3 h-3" /> Supersede
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
