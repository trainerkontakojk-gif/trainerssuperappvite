import { useApi, getApi, putApi, postApi, deleteApi } from '../../hooks/useApi';
import { useState, useCallback } from 'react';
import { Plus, Check, Archive, X, Loader2, PenLine, ChevronDown, ChevronRight, Trash2, ListChecks } from 'lucide-react';
import { notify } from '../../lib/toast';
import type { ServiceType, RuleVersion } from '@trainers/types';

interface ServiceWeightData {
  service_type: ServiceType;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: string;
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
  const [editingVersion, setEditingVersion] = useState<RuleVersion | null>(null);
  const [updating, setUpdating] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ id: string; action: 'publish' | 'supersede' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: weights, loading: weightsLoading, refetch: refetchWeights } = useApi<ServiceWeightData[]>('/sidak/service-weights');
  const { data: versions, loading: versionsLoading, refetch: refetchVersions } = useApi<RuleVersion[]>('/sidak/rule-versions');
  const { data: periods } = useApi<any[]>('/sidak/periods');

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [versionIndicators, setVersionIndicators] = useState<any[]>([]);
  const [versionIndicatorsLoading, setVersionIndicatorsLoading] = useState(false);
  const [compareVersion, setCompareVersion] = useState<{ id: string; version_number: number; critical_weight: number; non_critical_weight: number; scoring_mode: string } | null>(null);
  const [compareIndicators, setCompareIndicators] = useState<any[]>([]);
  const [compareIndicatorsLoading, setCompareIndicatorsLoading] = useState(false);
  const { data: allIndicators } = useApi<any[]>('/sidak/indicators');
  const [addIndicatorVersionId, setAddIndicatorVersionId] = useState<string | null>(null);
  const [addingIndicator, setAddingIndicator] = useState(false);

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

  const handleConfirmAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!actionTarget) return;
    setActionLoading(true);
    const form = new FormData(e.currentTarget);
    const change_reason = (form.get('change_reason') as string) || undefined;
    try {
      if (actionTarget.action === 'publish') {
        await postApi(`/sidak/rule-versions/${actionTarget.id}/publish`, { change_reason });
        notify.success('Versi published');
      } else {
        await postApi(`/sidak/rule-versions/${actionTarget.id}/supersede`, { change_reason });
        notify.success('Versi dinonaktifkan');
      }
      setActionTarget(null);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setActionLoading(false);
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

  const handleUpdateDraft = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingVersion) return;
    setUpdating(true);
    const form = new FormData(e.currentTarget);
    try {
      await putApi(`/sidak/rule-versions/${editingVersion.id}`, {
        critical_weight: parseFloat(form.get('critical_weight') as string) || editingVersion.critical_weight,
        non_critical_weight: parseFloat(form.get('non_critical_weight') as string) || editingVersion.non_critical_weight,
        scoring_mode: form.get('scoring_mode') || editingVersion.scoring_mode,
        change_reason: form.get('change_reason') || undefined,
      });
      notify.success('Draft updated');
      setEditingVersion(null);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setUpdating(false);
    }
  };

  const fetchVersionIndicators = useCallback(async (versionId: string) => {
    setVersionIndicatorsLoading(true);
    try {
      const res = await getApi<{ success: boolean; data: any[] }>(`/sidak/rule-versions/${versionId}/indicators`);
      setVersionIndicators(res.data ?? []);
    } catch {
      setVersionIndicators([]);
    } finally {
      setVersionIndicatorsLoading(false);
    }
  }, []);

  const fetchCompareIndicators = useCallback(async (versionId: string) => {
    setCompareIndicatorsLoading(true);
    try {
      const res = await getApi<{ success: boolean; data: any[] }>(`/sidak/rule-versions/${versionId}/indicators`);
      setCompareIndicators(res.data ?? []);
    } catch {
      setCompareIndicators([]);
    } finally {
      setCompareIndicatorsLoading(false);
    }
  }, []);

  const handleToggleExpand = (versionId: string) => {
    if (expandedVersionId === versionId) {
      setExpandedVersionId(null);
      setVersionIndicators([]);
      setCompareVersion(null);
      setCompareIndicators([]);
    } else {
      setExpandedVersionId(versionId);
      setCompareVersion(null);
      setCompareIndicators([]);
      fetchVersionIndicators(versionId);

      const version = versions?.find(v => v.id === versionId);
      if (version && version.status === 'draft') {
        const published = versions?.find(v =>
          v.service_type === version.service_type && v.status === 'published'
        );
        if (published) {
          setCompareVersion({
            id: published.id,
            version_number: published.version_number,
            critical_weight: published.critical_weight,
            non_critical_weight: published.non_critical_weight,
            scoring_mode: published.scoring_mode,
          });
          fetchCompareIndicators(published.id);
        }
      }
    }
  };

  const handleDeleteIndicator = async (indicatorId: string) => {
    try {
      await deleteApi(`/sidak/rule-versions/${expandedVersionId}/indicators/${indicatorId}`);
      notify.success('Indikator dihapus');
      if (expandedVersionId) fetchVersionIndicators(expandedVersionId);
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleAddIndicator = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addIndicatorVersionId) return;
    setAddingIndicator(true);
    const form = new FormData(e.currentTarget);
    const indicatorId = form.get('indicator_id') as string;
    const indicator = (allIndicators ?? []).find((i: any) => i.id === indicatorId);
    if (!indicator) { setAddingIndicator(false); return; }
    try {
      await postApi(`/sidak/rule-versions/${addIndicatorVersionId}/indicators`, {
        service_type: indicator.service_type,
        name: indicator.name,
        category: indicator.category,
        bobot: indicator.bobot,
        has_na: indicator.has_na ?? false,
        threshold: indicator.threshold ?? undefined,
        sort_order: versionIndicators.length,
        legacy_indicator_id: indicator.id,
      });
      notify.success('Indikator ditambahkan');
      setAddIndicatorVersionId(null);
      fetchVersionIndicators(addIndicatorVersionId);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setAddingIndicator(false);
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
                <div key={v.id} className="bg-white rounded-xl border shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900">{SERVICE_LABELS[v.service_type] || v.service_type}</span>
                        {statusBadge(v.status)}
                        <span className="text-xs text-gray-400 font-mono">v{v.version_number}</span>
                        {(v as any).indicator_count !== undefined && (
                          <span className="text-[11px] text-gray-400">
                            · {(v as any).indicator_count} {(v as any).indicator_count === 1 ? 'indicator' : 'indicators'}
                          </span>
                        )}
                        <button onClick={() => handleToggleExpand(v.id)}
                          className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition">
                          <ListChecks className="w-3 h-3" />
                          Indicators
                          {expandedVersionId === v.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
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
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {v.status === 'draft' && (
                        <>
                          <button onClick={() => setEditingVersion(v)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 border border-blue-200 transition">
                            <PenLine className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => setActionTarget({ id: v.id, action: 'publish' })}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition">
                            <Check className="w-3 h-3" /> Publish
                          </button>
                        </>
                      )}
                      {v.status === 'published' && (
                        <button onClick={() => setActionTarget({ id: v.id, action: 'supersede' })}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 border border-gray-200 transition">
                          <Archive className="w-3 h-3" /> Supersede
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedVersionId === v.id && (
                    <div className="mt-4 border-t pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Indicators</h4>
                        {v.status === 'draft' && (
                          <button onClick={() => setAddIndicatorVersionId(v.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
                            <Plus className="w-3 h-3" /> Add from Library
                          </button>
                        )}
                      </div>

                      {compareVersion && v.status === 'draft' && !versionIndicatorsLoading && (
                        <>
                          {compareIndicatorsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-blue-600 py-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading comparison...
                            </div>
                          ) : (
                            (() => {
                              const draftNames = new Set(versionIndicators.map((i: any) => i.name));
                              const pubNames = new Set(compareIndicators.map((i: any) => i.name));
                              const added = versionIndicators.filter((i: any) => !pubNames.has(i.name));
                              const removed = compareIndicators.filter((i: any) => !draftNames.has(i.name));
                              const weightDiff = v.critical_weight !== compareVersion.critical_weight || v.non_critical_weight !== compareVersion.non_critical_weight;
                              const modeDiff = v.scoring_mode !== compareVersion.scoring_mode;
                              return (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                                  <p className="text-xs font-semibold text-blue-800">
                                    vs Published v{compareVersion.version_number}
                                  </p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-blue-700">
                                    {added.length > 0 && <span className="text-green-700 font-medium">+{added.length} added</span>}
                                    {removed.length > 0 && <span className="text-red-600 font-medium">-{removed.length} removed</span>}
                                    {added.length === 0 && removed.length === 0 && <span>No indicator changes</span>}
                                    {weightDiff && <span>Weights changed</span>}
                                    {modeDiff && <span>Mode: {compareVersion.scoring_mode} → {v.scoring_mode}</span>}
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </>
                      )}

                      {versionIndicatorsLoading ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                      ) : versionIndicators.length === 0 ? (
                        <p className="text-xs text-gray-400 italic py-2">No indicators assigned to this version.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 text-left">
                                <th className="p-2 font-medium text-gray-500">Name</th>
                                <th className="p-2 font-medium text-gray-500">Category</th>
                                <th className="p-2 font-medium text-gray-500 text-right">Bobot</th>
                                <th className="p-2 font-medium text-gray-500 text-center">NA</th>
                                <th className="p-2 font-medium text-gray-500 text-right">Threshold</th>
                                {v.status === 'draft' && <th className="p-2 w-8"></th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {versionIndicators.map((ind: any, idx: number) => {
                                const isNew = v.status === 'draft' && compareVersion && !compareIndicators.some((ci: any) => ci.name === ind.name);
                                return (
                                <tr key={ind.id} className={`hover:bg-gray-50 ${isNew ? 'bg-green-50' : ''}`}>
                                  <td className="p-2 font-medium">
                                    <span className="inline-flex items-center gap-1.5">
                                      {isNew && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                                      {ind.name}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${ind.category === 'critical' ? 'bg-red-100 text-red-700' : ind.category === 'non_critical' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {ind.category}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right">{ind.bobot}</td>
                                  <td className="p-2 text-center">{ind.has_na ? '✓' : '-'}</td>
                                  <td className="p-2 text-right">{ind.threshold ?? '-'}</td>
                                  {v.status === 'draft' && (
                                    <td className="p-2 text-center">
                                      <button onClick={() => handleDeleteIndicator(ind.id)}
                                        className="p-1 text-gray-400 hover:text-red-600 transition">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {editingVersion && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingVersion(null)}>
              <form onSubmit={handleUpdateDraft} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">
                    Edit Draft — {SERVICE_LABELS[editingVersion.service_type] || editingVersion.service_type} v{editingVersion.version_number}
                  </h3>
                  <button type="button" onClick={() => setEditingVersion(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Scoring Mode</span>
                    <select name="scoring_mode" defaultValue={editingVersion.scoring_mode}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                      <option value="weighted">Weighted</option>
                      <option value="flat">Flat</option>
                      <option value="no_category">No Category</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-gray-500">Critical Weight</span>
                      <input name="critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={editingVersion.critical_weight}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-gray-500">Non-Critical Weight</span>
                      <input name="non_critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={editingVersion.non_critical_weight}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                    </label>
                  </div>
                  <label className="block col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Change Reason</span>
                    <input name="change_reason" placeholder="What changed in this version?" defaultValue={editingVersion.change_reason || ''}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingVersion(null)}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                  <button type="submit" disabled={updating}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {actionTarget && (() => {
            const tv = versions?.find(o => o.id === actionTarget.id);
            const pv = tv && versions?.find(o => o.service_type === tv.service_type && o.status === 'published');
            const isExpanded = expandedVersionId === tv?.id;
            const indCount = isExpanded ? versionIndicators.length : null;
            const pubIndCount = isExpanded && pv && compareVersion?.id === pv.id ? compareIndicators.length : null;
            const indDiff = indCount !== null && pubIndCount !== null ? indCount - pubIndCount : null;

            return (
            <div key="action-target" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setActionTarget(null)}>
              <form onSubmit={handleConfirmAction} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">
                    {actionTarget.action === 'publish' ? 'Publish Version' : 'Supersede Version'}
                  </h3>
                  <button type="button" onClick={() => setActionTarget(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {actionTarget.action === 'publish' && tv ? (
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{SERVICE_LABELS[tv.service_type] || tv.service_type} v{tv.version_number}</span>
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">Draft → Published</span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>Mode: <strong>{tv.scoring_mode}</strong></span>
                        <span>Critical: <strong>{tv.critical_weight}</strong></span>
                        <span>Non-Critical: <strong>{tv.non_critical_weight}</strong></span>
                      </div>
                    </div>

                    {pv ? (
                      <div className="space-y-2">
                        <div className="bg-emerald-50 rounded-lg p-3 space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">Published v{pv.version_number} <span className="text-gray-400 font-normal">(will be superseded)</span></span>
                          </div>
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span>Mode: <strong>{pv.scoring_mode}</strong></span>
                            <span>Critical: <strong>{pv.critical_weight}</strong></span>
                            <span>Non-Critical: <strong>{pv.non_critical_weight}</strong></span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {indCount !== null && (
                            <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">
                              Indicators: <strong>{indCount}</strong>
                              {indDiff !== null && indDiff !== 0 && (
                                <span className={indDiff > 0 ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                                  ({indDiff > 0 ? '+' : ''}{indDiff})
                                </span>
                              )}
                            </span>
                          )}
                          {(tv.critical_weight !== pv.critical_weight || tv.non_critical_weight !== pv.non_critical_weight) && (
                            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">Weights changed</span>
                          )}
                          {tv.scoring_mode !== pv.scoring_mode && (
                            <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">Mode: {pv.scoring_mode} → {tv.scoring_mode}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600">No previously published version — this will be the first active rule set for this service type.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">This will deactivate this version. The version will no longer be the active rule set.</p>
                )}

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Change Reason (optional)</span>
                  <input name="change_reason" placeholder="Why is this action being taken?"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500" />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setActionTarget(null)}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                  <button type="submit" disabled={actionLoading}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${actionTarget.action === 'publish' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-600 hover:bg-gray-700'}`}>
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-3 h-3" />}
                    {actionLoading ? 'Processing...' : actionTarget.action === 'publish' ? 'Publish' : 'Supersede'}
                  </button>
                </div>
              </form>
            </div>
            );
          })()}

          {addIndicatorVersionId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAddIndicatorVersionId(null)}>
              <form onSubmit={handleAddIndicator} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Add Indicator from Library</h3>
                  <button type="button" onClick={() => setAddIndicatorVersionId(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">Select Indicator</span>
                  <select name="indicator_id" required className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500">
                    <option value="">Choose an indicator...</option>
                    {(allIndicators ?? [])
                      .filter((i: any) => i.service_type === versions?.find(v => v.id === addIndicatorVersionId)?.service_type)
                      .map((i: any) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.category}, bobot: {i.bobot})
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-[11px] text-gray-400">
                  Only indicators matching the version's service type are shown.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddIndicatorVersionId(null)}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                  <button type="submit" disabled={addingIndicator}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
                    {addingIndicator ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-3 h-3" />}
                    {addingIndicator ? 'Adding...' : 'Add to Version'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
