import { useApi, getApi, putApi, postApi, deleteApi } from "../../hooks/useApi";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Check, Archive, X, Loader2, PenLine,
  ChevronDown, ChevronRight, Trash2, ListChecks, Settings2,
} from "lucide-react";
import { notify } from "../../lib/toast";
import type { ServiceType, RuleVersion } from "@trainers/types";

const SERVICE_TYPES = [
  "call", "chat", "email", "cso", "pencatatan", "bko", "slik",
] as const;
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

export default function SidakSettingsPage() {
  const [activeTab, setActiveTab] = useState<"weights" | "versions">("weights");
  const [saving, setSaving] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingVersion, setEditingVersion] = useState<RuleVersion | null>(null);
  const [updating, setUpdating] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ id: string; action: "publish" | "supersede" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: weights, loading: weightsLoading, refetch: refetchWeights } = useApi<any[]>("/sidak/service-weights");
  const { data: versions, loading: versionsLoading, refetch: refetchVersions } = useApi<RuleVersion[]>("/sidak/rule-versions");
  const { data: periods } = useApi<any[]>("/sidak/periods");

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [versionIndicators, setVersionIndicators] = useState<any[]>([]);
  const [versionIndicatorsLoading, setVersionIndicatorsLoading] = useState(false);
  const [compareVersion, setCompareVersion] = useState<{ id: string; version_number: number; critical_weight: number; non_critical_weight: number; scoring_mode: string } | null>(null);
  const [compareIndicators, setCompareIndicators] = useState<any[]>([]);
  const [compareIndicatorsLoading, setCompareIndicatorsLoading] = useState(false);
  const { data: allIndicators } = useApi<any[]>("/sidak/indicators");
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
    const change_reason = (form.get("change_reason") as string) || undefined;
    try {
      if (actionTarget.action === "publish") {
        await postApi(`/sidak/rule-versions/${actionTarget.id}/publish`, { change_reason });
        notify.success("Versi published");
      } else {
        await postApi(`/sidak/rule-versions/${actionTarget.id}/supersede`, { change_reason });
        notify.success("Versi dinonaktifkan");
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
      await postApi("/sidak/rule-versions", {
        service_type: form.get("service_type"),
        effective_period_id: form.get("effective_period_id"),
        critical_weight: parseFloat(form.get("critical_weight") as string) || 0.5,
        non_critical_weight: parseFloat(form.get("non_critical_weight") as string) || 0.5,
        scoring_mode: form.get("scoring_mode") || "weighted",
        change_reason: form.get("change_reason") || undefined,
      });
      notify.success("Draft versi baru dibuat");
      setCreateOpen(false);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const fetchVersionIndicators = useCallback(async (versionId: string) => {
    setVersionIndicatorsLoading(true);
    try {
      const res = await getApi<any[]>(`/sidak/rule-versions/${versionId}/indicators`);
      setVersionIndicators(res ?? []);
    } catch {
      setVersionIndicators([]);
    } finally {
      setVersionIndicatorsLoading(false);
    }
  }, []);

  const fetchCompareIndicators = useCallback(async (versionId: string) => {
    setCompareIndicatorsLoading(true);
    try {
      const res = await getApi<any[]>(`/sidak/rule-versions/${versionId}/indicators`);
      setCompareIndicators(res ?? []);
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
      const version = versions?.find((v) => v.id === versionId);
      if (version && version.status === "draft") {
        const published = versions?.find(
          (v) => v.service_type === version.service_type && v.status === "published",
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
      notify.success("Indikator dihapus");
      if (expandedVersionId) fetchVersionIndicators(expandedVersionId);
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleUpdateDraft = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingVersion) return;
    setUpdating(true);
    const form = new FormData(e.currentTarget);
    try {
      await putApi(`/sidak/rule-versions/${editingVersion.id}`, {
        critical_weight: parseFloat(form.get("critical_weight") as string) || editingVersion.critical_weight,
        non_critical_weight: parseFloat(form.get("non_critical_weight") as string) || editingVersion.non_critical_weight,
        scoring_mode: form.get("scoring_mode") || editingVersion.scoring_mode,
        change_reason: form.get("change_reason") || undefined,
      });
      notify.success("Draft updated");
      setEditingVersion(null);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setUpdating(false);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      published: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      superseded: "bg-muted text-muted-foreground border-border/50",
    };
    const labels: Record<string, string> = { draft: "Draft", published: "Published", superseded: "Superseded" };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[status] || ""}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${status === "draft" ? "bg-amber-500" : status === "published" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
        {labels[status] || status}
      </span>
    );
  };

  if (weightsLoading && activeTab === "weights") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Settings2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">
                QA Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Service weights, scoring configuration, and parameter versioning
              </p>
            </div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 bg-foreground/5 rounded-xl p-1 w-fit">
            {(["weights", "versions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "weights" ? "Service Weights" : "Parameter Versions"}
              </button>
            ))}
          </div>

          {/* Service Weights Tab */}
          {activeTab === "weights" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card/40 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-xl overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/50 dark:bg-black/20">
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Service</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Mode</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">Critical Weight</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">Non-Critical Weight</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center">Sum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {(weights ?? []).map((w, i) => (
                      <motion.tr
                        key={w.service_type}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-primary/5 transition-colors"
                      >
                        <td className="px-6 py-4 font-bold text-foreground/80">{SERVICE_LABELS[w.service_type] ?? w.service_type}</td>
                        <td className="px-6 py-4">
                          <select
                            className="border border-border rounded-lg p-1.5 text-sm bg-card font-medium"
                            value={w.scoring_mode}
                            onChange={(e) => handleUpdate(w.service_type, "scoring_mode", e.target.value)}
                            disabled={saving === w.service_type}
                          >
                            <option value="weighted">Weighted</option>
                            <option value="flat">Flat</option>
                            <option value="no_category">No Category</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <input
                            type="number" step="0.05" min="0" max="1"
                            className="w-20 border border-border rounded-lg p-1.5 text-right text-sm bg-card font-medium"
                            value={w.critical_weight}
                            onChange={(e) => handleUpdate(w.service_type, "critical_weight", parseFloat(e.target.value))}
                            disabled={saving === w.service_type}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <input
                            type="number" step="0.05" min="0" max="1"
                            className="w-20 border border-border rounded-lg p-1.5 text-right text-sm bg-card font-medium"
                            value={w.non_critical_weight}
                            onChange={(e) => handleUpdate(w.service_type, "non_critical_weight", parseFloat(e.target.value))}
                            disabled={saving === w.service_type}
                          />
                        </td>
                        <td className={`px-6 py-4 text-center font-bold ${Math.abs(w.critical_weight + w.non_critical_weight - 1) < 0.01 ? "text-emerald-600" : "text-destructive"}`}>
                          {(w.critical_weight + w.non_critical_weight).toFixed(2)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Parameter Versions Tab */}
          {activeTab === "versions" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Manage draft, publish, and supersede parameter rule versions.
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 transition"
                >
                  <Plus className="w-4 h-4" /> New Draft
                </button>
              </div>

              {/* Create Draft Form */}
              <AnimatePresence>
                {createOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <form onSubmit={handleCreateDraft} className="bg-card/40 backdrop-blur-2xl border border-white/20 rounded-[2rem] p-6 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground/90">Create New Draft Version</h3>
                        <button type="button" onClick={() => setCreateOpen(false)} className="p-1 hover:bg-foreground/5 rounded-lg"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Service Type</span>
                          <select name="service_type" required className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary">
                            {SERVICE_TYPES.map((st) => (<option key={st} value={st}>{SERVICE_LABELS[st]}</option>))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Effective Period</span>
                          <select name="effective_period_id" required className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary">
                            <option value="">Select period</option>
                            {(periods ?? []).map((p: any) => (
                              <option key={p.id} value={p.id}>{String(p.month).padStart(2, "0")}/{p.year}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scoring Mode</span>
                          <select name="scoring_mode" defaultValue="weighted" className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary">
                            <option value="weighted">Weighted</option>
                            <option value="flat">Flat</option>
                            <option value="no_category">No Category</option>
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Critical Weight</span>
                            <input name="critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={0.5} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Non-Critical Weight</span>
                            <input name="non_critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={0.5} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                          </label>
                        </div>
                        <label className="block col-span-2">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change Reason</span>
                          <input name="change_reason" placeholder="Why is this version being created?" className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                        </label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                        <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 transition disabled:opacity-60">
                          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          {creating ? "Creating..." : "Create Draft"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Versions List */}
              {versionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (versions ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="font-bold">Belum ada versi aturan</p>
                  <p className="text-sm mt-1">Buat draft baru untuk memulai.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(versions ?? []).map((v, i) => (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-card/40 backdrop-blur-2xl border border-white/20 rounded-[2rem] p-5 shadow-xl"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-foreground/90">{SERVICE_LABELS[v.service_type] || v.service_type}</span>
                            {statusBadge(v.status)}
                            <span className="text-xs text-muted-foreground font-mono">v{v.version_number}</span>
                            {(v as any).indicator_count !== undefined && (
                              <span className="text-[11px] text-muted-foreground">· {(v as any).indicator_count} {(v as any).indicator_count === 1 ? "indicator" : "indicators"}</span>
                            )}
                            <button onClick={() => handleToggleExpand(v.id)} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition">
                              <ListChecks className="w-3 h-3" />
                              Indicators
                              {expandedVersionId === v.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>Mode: <strong className="text-foreground/80">{v.scoring_mode}</strong></span>
                            <span>Critical: <strong className="text-foreground/80">{v.critical_weight}</strong></span>
                            <span>Non-Critical: <strong className="text-foreground/80">{v.non_critical_weight}</strong></span>
                          </div>
                          {v.change_reason && <p className="text-xs text-muted-foreground italic">{v.change_reason}</p>}
                          <div className="flex gap-4 text-[10px] text-muted-foreground">
                            <span>Created: {new Date(v.created_at).toLocaleDateString("id-ID")}{v.created_by_user ? ` by ${v.created_by_user.full_name}` : ""}</span>
                            {v.published_at && <span>Published: {new Date(v.published_at).toLocaleDateString("id-ID")}{v.published_by_user ? ` by ${v.published_by_user.full_name}` : ""}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          {v.status === "draft" && (
                            <>
                              <button onClick={() => setEditingVersion(v)} className="inline-flex items-center gap-1 rounded-xl bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-500/20 border border-blue-500/20 transition">
                                <PenLine className="w-3 h-3" /> Edit
                              </button>
                              <button onClick={() => setActionTarget({ id: v.id, action: "publish" })} className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 transition">
                                <Check className="w-3 h-3" /> Publish
                              </button>
                            </>
                          )}
                          {v.status === "published" && (
                            <button onClick={() => setActionTarget({ id: v.id, action: "supersede" })} className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-foreground/10 border border-border transition">
                              <Archive className="w-3 h-3" /> Supersede
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Indicators */}
                      {expandedVersionId === v.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-4 border-t border-border/50 pt-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Indicators</h4>
                            {v.status === "draft" && (
                              <button onClick={() => setAddIndicatorVersionId(v.id)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80 transition">
                                <Plus className="w-3 h-3" /> Add from Library
                              </button>
                            )}
                          </div>

                          {/* Diff Summary */}
                          {compareVersion && v.status === "draft" && !versionIndicatorsLoading && (
                            <>
                              {compareIndicatorsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-primary py-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading comparison...</div>
                              ) : (
                                (() => {
                                  const draftNames = new Set(versionIndicators.map((i: any) => i.name));
                                  const pubNames = new Set(compareIndicators.map((i: any) => i.name));
                                  const added = versionIndicators.filter((i: any) => !pubNames.has(i.name));
                                  const removed = compareIndicators.filter((i: any) => !draftNames.has(i.name));
                                  const weightDiff = v.critical_weight !== compareVersion.critical_weight || v.non_critical_weight !== compareVersion.non_critical_weight;
                                  const modeDiff = v.scoring_mode !== compareVersion.scoring_mode;
                                  return (
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-1">
                                      <p className="text-xs font-bold text-blue-600">vs Published v{compareVersion.version_number}</p>
                                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-blue-600">
                                        {added.length > 0 && <span className="text-emerald-600 font-medium">+{added.length} added</span>}
                                        {removed.length > 0 && <span className="text-destructive font-medium">-{removed.length} removed</span>}
                                        {added.length === 0 && removed.length === 0 && <span>No indicator changes</span>}
                                        {weightDiff && <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">Weights changed</span>}
                                        {modeDiff && <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">Mode: {compareVersion.scoring_mode} → {v.scoring_mode}</span>}
                                      </div>
                                    </div>
                                  );
                                })()
                              )}
                            </>
                          )}

                          {versionIndicatorsLoading ? (
                            <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                          ) : versionIndicators.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2">No indicators assigned to this version.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-border">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-foreground/5 text-left">
                                    <th className="p-2.5 font-bold text-muted-foreground">Name</th>
                                    <th className="p-2.5 font-bold text-muted-foreground">Category</th>
                                    <th className="p-2.5 font-bold text-muted-foreground text-right">Bobot</th>
                                    <th className="p-2.5 font-bold text-muted-foreground text-center">NA</th>
                                    <th className="p-2.5 font-bold text-muted-foreground text-right">Threshold</th>
                                    {v.status === "draft" && <th className="p-2.5 w-8"></th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {versionIndicators.map((ind: any, idx: number) => {
                                    const isNew = v.status === "draft" && compareVersion && !compareIndicators.some((ci: any) => ci.name === ind.name);
                                    return (
                                      <tr key={ind.id} className={`hover:bg-foreground/5 transition-colors ${isNew ? "bg-emerald-500/5" : ""}`}>
                                        <td className="p-2.5 font-medium text-foreground/80">
                                          <span className="inline-flex items-center gap-1.5">
                                            {isNew && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                                            {ind.name}
                                          </span>
                                        </td>
                                        <td className="p-2.5">
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${ind.category === "critical" ? "bg-red-500/10 text-red-600" : ind.category === "non_critical" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>{ind.category}</span>
                                        </td>
                                        <td className="p-2.5 text-right font-medium">{ind.bobot}</td>
                                        <td className="p-2.5 text-center">{ind.has_na ? "✓" : "-"}</td>
                                        <td className="p-2.5 text-right">{ind.threshold ?? "-"}</td>
                                        {v.status === "draft" && (
                                          <td className="p-2.5 text-center">
                                            <button onClick={() => handleDeleteIndicator(ind.id)} className="p-1 text-muted-foreground hover:text-destructive transition">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Edit Draft Modal */}
              <AnimatePresence>
                {editingVersion && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md" onClick={() => setEditingVersion(null)}>
                    <motion.form
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onSubmit={handleUpdateDraft}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-card rounded-[2rem] shadow-2xl p-6 w-full max-w-lg mx-4 border border-border space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground/90">Edit Draft — {SERVICE_LABELS[editingVersion.service_type] || editingVersion.service_type} v{editingVersion.version_number}</h3>
                        <button type="button" onClick={() => setEditingVersion(null)} className="p-1 hover:bg-foreground/5 rounded-lg"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scoring Mode</span>
                          <select name="scoring_mode" defaultValue={editingVersion.scoring_mode} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary">
                            <option value="weighted">Weighted</option><option value="flat">Flat</option><option value="no_category">No Category</option>
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Critical Weight</span>
                            <input name="critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={editingVersion.critical_weight} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Non-Critical Weight</span>
                            <input name="non_critical_weight" type="number" step="0.05" min="0" max="1" defaultValue={editingVersion.non_critical_weight} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                          </label>
                        </div>
                        <label className="block col-span-2">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change Reason</span>
                          <input name="change_reason" placeholder="What changed?" defaultValue={editingVersion.change_reason || ""} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                        </label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setEditingVersion(null)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">Cancel</button>
                        <button type="submit" disabled={updating} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-60">
                          {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-3 h-3" />}
                          {updating ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </motion.form>
                  </div>
                )}
              </AnimatePresence>

              {/* Publish/Supersede Confirmation Modal */}
              {actionTarget && (() => {
                const tv = versions?.find((o) => o.id === actionTarget.id);
                const pv = tv && versions?.find((o) => o.service_type === tv.service_type && o.status === "published");
                const isExpanded = expandedVersionId === tv?.id;
                const indCount = isExpanded ? versionIndicators.length : null;
                const pubIndCount = isExpanded && pv && compareVersion?.id === pv.id ? compareIndicators.length : null;
                const indDiff = indCount !== null && pubIndCount !== null ? indCount - pubIndCount : null;
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md" onClick={() => setActionTarget(null)}>
                    <motion.form
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onSubmit={handleConfirmAction}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-card rounded-[2rem] shadow-2xl p-6 w-full max-w-md mx-4 border border-border space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground/90">{actionTarget.action === "publish" ? "Publish Version" : "Supersede Version"}</h3>
                        <button type="button" onClick={() => setActionTarget(null)} className="p-1 hover:bg-foreground/5 rounded-lg"><X className="w-4 h-4" /></button>
                      </div>
                      {actionTarget.action === "publish" && tv ? (
                        <div className="space-y-3">
                          <div className="bg-foreground/5 rounded-xl p-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground/80">{SERVICE_LABELS[tv.service_type] || tv.service_type} v{tv.version_number}</span>
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20">Draft → Published</span>
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span>Mode: <strong className="text-foreground/80">{tv.scoring_mode}</strong></span>
                              <span>Critical: <strong className="text-foreground/80">{tv.critical_weight}</strong></span>
                              <span>Non-Critical: <strong className="text-foreground/80">{tv.non_critical_weight}</strong></span>
                            </div>
                          </div>
                          {pv ? (
                            <div className="space-y-2">
                              <div className="bg-emerald-500/10 rounded-xl p-3 space-y-1 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-emerald-600">Published v{pv.version_number} <span className="text-muted-foreground font-normal">(will be superseded)</span></span>
                                </div>
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                  <span>Mode: <strong className="text-foreground/80">{pv.scoring_mode}</strong></span>
                                  <span>Critical: <strong className="text-foreground/80">{pv.critical_weight}</strong></span>
                                  <span>Non-Critical: <strong className="text-foreground/80">{pv.non_critical_weight}</strong></span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {indCount !== null && (
                                  <span className="px-2 py-1 rounded bg-foreground/5 text-muted-foreground">
                                    Indicators: <strong className="text-foreground/80">{indCount}</strong>
                                    {indDiff !== null && indDiff !== 0 && (
                                      <span className={indDiff > 0 ? "text-emerald-600 ml-1" : "text-destructive ml-1"}>({indDiff > 0 ? "+" : ""}{indDiff})</span>
                                    )}
                                  </span>
                                )}
                                {(tv.critical_weight !== pv.critical_weight || tv.non_critical_weight !== pv.non_critical_weight) && (
                                  <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600">Weights changed</span>
                                )}
                                {tv.scoring_mode !== pv.scoring_mode && (
                                  <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600">Mode: {pv.scoring_mode} → {tv.scoring_mode}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No previously published version — this will be the first active rule set for this service type.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">This will deactivate this version permanently.</p>
                      )}
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change Reason (optional)</span>
                        <input name="change_reason" placeholder="Why is this action being taken?" className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary" />
                      </label>
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setActionTarget(null)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">Cancel</button>
                        <button type="submit" disabled={actionLoading} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${actionTarget.action === "publish" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-muted-foreground hover:opacity-90"}`}>
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-3 h-3" />}
                          {actionLoading ? "Processing..." : actionTarget.action === "publish" ? "Publish" : "Supersede"}
                        </button>
                      </div>
                    </motion.form>
                  </div>
                );
              })()}

              {/* Add from Library Modal */}
              <AnimatePresence>
                {addIndicatorVersionId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md" onClick={() => setAddIndicatorVersionId(null)}>
                    <motion.form
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!addIndicatorVersionId) return;
                        setAddingIndicator(true);
                        const form = new FormData(e.currentTarget);
                        const indicatorId = form.get("indicator_id") as string;
                        const indicator = (allIndicators ?? []).find((i: any) => i.id === indicatorId);
                        if (!indicator) { setAddingIndicator(false); return; }
                        try {
                          await postApi(`/sidak/rule-versions/${addIndicatorVersionId}/indicators`, {
                            service_type: indicator.service_type, name: indicator.name, category: indicator.category,
                            bobot: indicator.bobot, has_na: indicator.has_na ?? false, threshold: indicator.threshold ?? undefined,
                            sort_order: versionIndicators.length, legacy_indicator_id: indicator.id,
                          });
                          notify.success("Indikator ditambahkan");
                          setAddIndicatorVersionId(null);
                          fetchVersionIndicators(addIndicatorVersionId);
                        } catch (e: any) { notify.error(e.message); } finally { setAddingIndicator(false); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-card rounded-[2rem] shadow-2xl p-6 w-full max-w-lg mx-4 border border-border space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground/90">Add Indicator from Library</h3>
                        <button type="button" onClick={() => setAddIndicatorVersionId(null)} className="p-1 hover:bg-foreground/5 rounded-lg"><X className="w-4 h-4" /></button>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select Indicator</span>
                        <select name="indicator_id" required className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-card outline-none focus:border-primary">
                          <option value="">-- Pilih indikator --</option>
                          {(allIndicators ?? []).map((i: any) => (
                            <option key={i.id} value={i.id}>{i.name} ({i.category}) — {SERVICE_LABELS[i.service_type] || i.service_type}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setAddIndicatorVersionId(null)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">Cancel</button>
                        <button type="submit" disabled={addingIndicator} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-60">
                          {addingIndicator ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-3 h-3" />}
                          {addingIndicator ? "Adding..." : "Add Indicator"}
                        </button>
                      </div>
                    </motion.form>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
