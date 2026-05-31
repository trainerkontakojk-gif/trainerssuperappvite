import { useApi, getApi, putApi, postApi, deleteApi } from "../../hooks/useApi";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Plus, Trash2,
  History, Rocket, AlertTriangle,
  GitBranch, Pencil
} from "lucide-react";
import { notify } from "../../lib/toast";
import type { ServiceType, RuleVersion, QARuleIndicator } from "@trainers/types";
import { SERVICE_LABELS, formatPeriodLabel } from "./settings/constants";
import { RuleVersionPicker } from "./settings/components/RuleVersionPicker";
import { ServiceWeightsPanel } from "./settings/components/ServiceWeightsPanel";
import { RuleIndicatorsPanel } from "./settings/components/RuleIndicatorsPanel";
import { PublishRulePanel } from "./settings/components/PublishRulePanel";

interface RuleVersionMeta {
  service_type: string;
  indicator_count: number;
  has_weight: boolean;
  draft_count: number;
  published_count: number;
}

export default function SidakSettingsPage() {
  const [activeTeam, setActiveTeam] = useState<ServiceType>("call");
  const [selectedVersion, setSelectedVersion] = useState<RuleVersion | null>(null);
  const [draftIndicators, setDraftIndicators] = useState<QARuleIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [meta, setMeta] = useState<RuleVersionMeta | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [publishPeriodId, setPublishPeriodId] = useState<string>("");
  const [previewVersion, setPreviewVersion] = useState<RuleVersion | null>(null);
  const [publishConfirmed, setPublishConfirmed] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"critical" | "non_critical" | "none">("non_critical");
  const [newBobot, setNewBobot] = useState("10");
  const [newHasNa, setNewHasNa] = useState(false);
  const [newThreshold, setNewThreshold] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [savingNew, setSavingNew] = useState(false);

  const [editIndId, setEditIndId] = useState<string | null>(null);
  const [editState, setEditState] = useState<{
    name: string; category: "critical" | "non_critical" | "none";
    bobot: string; has_na: boolean; threshold: string; sort_order: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: versions, loading: versionsLoading, refetch: refetchVersions } = useApi<RuleVersion[]>(
    `/sidak/rule-versions?service_type=${activeTeam}`
  );
  const { data: periods } = useApi<{ id: string; month: number; year: number }[]>("/sidak/periods");

  // Selection logic: Draft first, then published, then latest version
  useEffect(() => {
    if (versions && (versions as RuleVersion[]).length > 0) {
      setMeta(null);
      const stillExists = selectedVersion ? versions.find(v => v.id === selectedVersion.id) : null;
      if (stillExists) {
        setSelectedVersion(stillExists);
      } else {
        const draft = versions.find((v) => v.status === "draft");
        const published = versions.find((v) => v.status === "published");
        const latest = [...versions].sort((a, b) => b.version_number - a.version_number)[0];
        setSelectedVersion(draft || published || latest || versions[0]);
      }
    } else {
      setSelectedVersion(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions?.length, activeTeam]);

  useEffect(() => {
    if (!versionsLoading && (!versions || versions.length === 0)) {
      let cancelled = false;
      getApi<RuleVersionMeta>(`/sidak/rule-versions/meta?service_type=${activeTeam}`)
        .then((result) => { if (!cancelled) setMeta(result); })
        .catch(() => { if (!cancelled) setMeta(null); });
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam, versionsLoading, versions?.length]);

  const fetchVersionIndicators = useCallback(async (versionId: string) => {
    setLoadingIndicators(true);
    try {
      const res = await getApi<QARuleIndicator[]>(`/sidak/rule-versions/${versionId}/indicators`);
      setDraftIndicators(res ?? []);
    } catch {
      setDraftIndicators([]);
    } finally {
      setLoadingIndicators(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVersion) {
      fetchVersionIndicators(selectedVersion.id);
    } else {
      setDraftIndicators([]);
    }
  }, [selectedVersion, fetchVersionIndicators]);

  const getPeriodLabel = (periodId: string) => {
    const period = periods?.find((p) => p.id === periodId);
    if (!period) return "-";
    return formatPeriodLabel(period.month, period.year);
  };

  const getPreviewVersionNumber = () => {
    if (!selectedVersion || !publishPeriodId) return 0;
    if (selectedVersion.effective_period_id === publishPeriodId) {
      return selectedVersion.version_number;
    }
    const versionsInTarget = versions?.filter((v) => v.effective_period_id === publishPeriodId) || [];
    if (versionsInTarget.length === 0) return 1;
    return Math.max(...versionsInTarget.map((v) => v.version_number)) + 1;
  };

  const handleCreateDraft = async (sourceId?: string) => {
    try {
      const draft = await postApi<RuleVersion>("/sidak/rule-versions", {
        service_type: activeTeam,
        source_version_id: sourceId,
      });
      notify.success(sourceId ? "Draft revisi berhasil dibuat!" : "Draft baru berhasil dibuat!");
      refetchVersions();
      setSelectedVersion(draft);
    } catch (e: any) {
      notify.error(e.message || "Gagal membuat draft");
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm("Hapus draft ini?")) return;
    try {
      await deleteApi(`/sidak/rule-versions/${id}`);
      notify.success("Draft berhasil dihapus");
      refetchVersions();
      if (selectedVersion?.id === id) {
        setSelectedVersion(null);
      }
    } catch (e: any) {
      notify.error(e.message || "Gagal menghapus draft");
    }
  };

  const handlePublish = async () => {
    if (!selectedVersion || !publishPeriodId) return;
    setIsPublishing(true);
    try {
      await postApi(`/sidak/rule-versions/${selectedVersion.id}/publish`, {
        change_reason: changeReason || undefined,
        effective_period_id: publishPeriodId,
      });
      notify.success("Rule version berhasil dipublish!");
      setPreviewVersion(null);
      setChangeReason("");
      setPublishConfirmed(false);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal mempublish rules");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAddIndicator = async () => {
    if (!selectedVersion) return;
    const bobotVal = parseFloat(newBobot) / 100;
    setSavingNew(true);
    try {
      const categoryVal = selectedVersion.scoring_mode === "no_category" ? "none" : newCategory;
      await postApi(`/sidak/rule-versions/${selectedVersion.id}/indicators`, {
        service_type: activeTeam,
        name: newName,
        category: categoryVal,
        bobot: bobotVal,
        has_na: newHasNa,
        threshold: newThreshold ? parseFloat(newThreshold) : undefined,
        sort_order: parseInt(newSortOrder) || 0,
      });
      notify.success("Parameter berhasil ditambahkan ke draft.");
      setNewName("");
      setNewHasNa(false);
      setNewThreshold("");
      setNewSortOrder("0");
      setShowAddForm(false);
      fetchVersionIndicators(selectedVersion.id);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal menambahkan parameter");
    } finally {
      setSavingNew(false);
    }
  };

  const handleSaveEditIndicator = async () => {
    if (!selectedVersion || !editIndId || !editState) return;
    setSavingEdit(true);
    try {
      const categoryVal = selectedVersion.scoring_mode === "no_category" ? "none" : editState.category;
      await putApi(`/sidak/rule-versions/${selectedVersion.id}/indicators/${editIndId}`, {
        name: editState.name,
        category: categoryVal,
        bobot: parseFloat(editState.bobot) / 100,
        has_na: editState.has_na,
        threshold: editState.threshold ? parseFloat(editState.threshold) : undefined,
        sort_order: parseInt(editState.sort_order) || 0,
      });
      notify.success("Parameter berhasil diperbarui.");
      setEditIndId(null);
      setEditState(null);
      fetchVersionIndicators(selectedVersion.id);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal memperbarui parameter");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteIndicator = async (id: string) => {
    if (!selectedVersion) return;
    try {
      await deleteApi(`/sidak/rule-versions/${selectedVersion.id}/indicators/${id}`);
      notify.success("Parameter dihapus dari draft.");
      fetchVersionIndicators(selectedVersion.id);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal menghapus parameter");
    }
  };

  const isDraft = selectedVersion?.status === "draft";

  const publishedWhenDraftEmpty = isDraft && draftIndicators.length === 0
    ? versions?.find((v) => v.status === "published")
    : null;

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header Sticky */}
      <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-card/50 backdrop-blur-xl border-b border-border sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <History className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Versioning Parameter QA</h1>
          </div>
        </div>

        <div className="flex gap-2">
          {selectedVersion?.status === "draft" && (
            <>
              <button
                onClick={() => {
                  setPreviewVersion(selectedVersion);
                  setPublishConfirmed(false);
                  setPublishPeriodId(selectedVersion.effective_period_id || "");
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
              >
                <Rocket className="w-3.5 h-3.5" />
                Publish
              </button>
              <button
                onClick={() => handleDeleteDraft(selectedVersion.id)}
                className="flex items-center gap-2 px-4 py-2 bg-destructive hover:bg-destructive/90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-destructive/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Draft
              </button>
            </>
          )}
          {selectedVersion?.status === "published" && (
            <button
              onClick={() => handleCreateDraft(selectedVersion.id)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Create Revision
            </button>
          )}
          {!selectedVersion && !versionsLoading && (!versions || !versions.some((v) => v.status === "draft")) && (
            <button
              onClick={() => handleCreateDraft()}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Draft Baru
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Sidebar: Version History */}
        <RuleVersionPicker
          activeTeam={activeTeam}
          setActiveTeam={setActiveTeam}
          versions={versions}
          versionsLoading={versionsLoading}
          selectedVersion={selectedVersion}
          setSelectedVersion={setSelectedVersion}
          meta={meta}
          getPeriodLabel={getPeriodLabel}
          handleCreateDraft={handleCreateDraft}
          handleDeleteDraft={handleDeleteDraft}
        />

        {/* Main Content: Version Detail & Editor */}
        <section className="flex-1 overflow-y-auto bg-foreground/[0.01] p-4 lg:p-8">
          <AnimatePresence mode="wait">
            {selectedVersion ? (
              <motion.div
                key={selectedVersion.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                {/* Status Banner */}
                <PublishRulePanel
                  selectedVersion={selectedVersion}
                  getPeriodLabel={getPeriodLabel}
                  setShowAddForm={setShowAddForm}
                  newThreshold={newThreshold}
                  setNewThreshold={setNewThreshold}
                  newSortOrder={newSortOrder}
                  setNewSortOrder={setNewSortOrder}
                />

                {/* Weights & Mode Panel */}
                <ServiceWeightsPanel
                  selectedVersion={selectedVersion}
                  isDraft={isDraft}
                  setSelectedVersion={setSelectedVersion}
                />

                {/* Parameters List */}
                <RuleIndicatorsPanel
                  loadingIndicators={loadingIndicators}
                  draftIndicators={draftIndicators}
                  publishedWhenDraftEmpty={publishedWhenDraftEmpty}
                  isDraft={isDraft}
                  handleCreateDraft={handleCreateDraft}
                  handleDeleteIndicator={handleDeleteIndicator}
                  setEditIndId={setEditIndId}
                  setEditState={setEditState}
                />
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center py-20">
                <div className="text-center p-8 border border-border bg-card/40 rounded-3xl max-w-sm mx-auto shadow-xl">
                  <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-sm font-bold text-foreground/80">Pilih atau buat versi rules untuk melihat detail</p>
                  <p className="text-xs text-muted-foreground mt-1">Gunakan panel di sebelah kiri untuk melihat riwayat versi parameter QA.</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Add Parameter Modal */}
        {showAddForm && selectedVersion && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={() => setShowAddForm(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl space-y-6"
            >
              <h2 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
                <Plus className="w-6 h-6 text-primary" /> Tambah Parameter
              </h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Nama Parameter</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="Masukkan nama parameter..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Kategori</label>
                    <select
                      value={newCategory}
                      disabled={selectedVersion.scoring_mode === "no_category"}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none disabled:opacity-50"
                    >
                      <option value="non_critical">Non-Critical</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot (%)</label>
                    <input
                      type="number"
                      value={newBobot}
                      onChange={(e) => setNewBobot(e.target.value)}
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setNewHasNa(!newHasNa)}
                  className={`flex items-center justify-between w-full p-4 rounded-2xl border transition-all ${
                    newHasNa ? "bg-primary/10 border-primary/30" : "bg-foreground/5 border-border"
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-widest opacity-70">Bisa N/A</span>
                  <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-all ${newHasNa ? "bg-primary" : "bg-foreground/20"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${newHasNa ? "translate-x-4" : ""}`} />
                  </div>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddIndicator}
                  disabled={savingNew || !newName.trim()}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {savingNew ? "Menyimpan..." : "Tambah Parameter"}
                </button>
                <button onClick={() => setShowAddForm(false)} className="px-8 py-4 bg-foreground/5 text-muted-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-foreground/10 transition">
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Edit Parameter Modal */}
        {editIndId && editState && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={() => { setEditIndId(null); setEditState(null); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl space-y-6"
            >
              <h2 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
                <Pencil className="w-6 h-6 text-primary" /> Edit Parameter
              </h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Nama Parameter</label>
                  <input
                    value={editState.name}
                    onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                    className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Kategori</label>
                    <select
                      value={editState.category}
                      disabled={selectedVersion?.scoring_mode === "no_category"}
                      onChange={(e) => setEditState({ ...editState, category: e.target.value as any })}
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none disabled:opacity-50"
                    >
                      <option value="non_critical">Non-Critical</option>
                      <option value="critical">Critical</option>
                      {selectedVersion?.scoring_mode === "no_category" && <option value="none">Semua Parameter</option>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot (%)</label>
                    <input
                      type="number"
                      value={editState.bobot}
                      onChange={(e) => setEditState({ ...editState, bobot: e.target.value })}
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Threshold</label>
                    <input
                      type="number"
                      value={editState.threshold}
                      onChange={(e) => setEditState({ ...editState, threshold: e.target.value })}
                      placeholder="0"
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Urutan (sort_order)</label>
                    <input
                      type="number"
                      value={editState.sort_order}
                      onChange={(e) => setEditState({ ...editState, sort_order: e.target.value })}
                      placeholder="0"
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setEditState({ ...editState, has_na: !editState.has_na })}
                  className={`flex items-center justify-between w-full p-4 rounded-2xl border transition-all ${
                    editState.has_na ? "bg-primary/10 border-primary/30" : "bg-foreground/5 border-border"
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-widest opacity-70">Bisa N/A</span>
                  <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-all ${editState.has_na ? "bg-primary" : "bg-foreground/20"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editState.has_na ? "translate-x-4" : ""}`} />
                  </div>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEditIndicator}
                  disabled={savingEdit || !editState.name.trim()}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
                <button
                  onClick={() => {
                    setEditIndId(null);
                    setEditState(null);
                  }}
                  className="px-8 py-4 bg-foreground/5 text-muted-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-foreground/10 transition"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Publish Preview Modal */}
        {previewVersion && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={() => setPreviewVersion(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Rocket className="w-10 h-10 text-emerald-600 animate-bounce" />
              </div>
              <h2 className="text-xl font-black text-foreground text-center uppercase tracking-widest">Preview & Publish</h2>

              <div className="space-y-1.5 mb-6">
                <label className="text-[10px] font-black uppercase text-muted-foreground px-1 block">
                  Target Periode Efektif <span className="text-red-500">*</span>
                </label>
                <select
                  value={publishPeriodId}
                  onChange={(e) => setPublishPeriodId(e.target.value)}
                  className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none cursor-pointer hover:border-primary transition-all"
                >
                  {periods?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPeriodLabel(p.month, p.year)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview Info */}
              <div className="space-y-3 bg-foreground/5 rounded-2xl p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Service:</span>
                  <span className="font-black">{SERVICE_LABELS[previewVersion.service_type]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Version:</span>
                  <span className="font-black">v{getPreviewVersionNumber()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Scoring Mode:</span>
                  <span className="font-black uppercase">{previewVersion.scoring_mode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Total Parameter:</span>
                  <span className="font-black">{draftIndicators.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Critical Weight:</span>
                  <span className="font-black">{Math.round(previewVersion.critical_weight * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Non-Critical Weight:</span>
                  <span className="font-black">{Math.round(previewVersion.non_critical_weight * 100)}%</span>
                </div>
              </div>

              {/* Indicator List */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Parameter</p>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-border/50 rounded-xl p-2 bg-foreground/[0.01]">
                  {draftIndicators.map((ind) => (
                    <div key={ind.id} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                      <span className="font-medium text-foreground/80">{ind.name}</span>
                      <span className="font-black text-muted-foreground">
                        {Math.round(ind.bobot * 100)}% ({ind.category === "none" ? "semua" : ind.category.replace("_", " ")})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Change Reason (required for revisions/when created_from_version_id is set) */}
              {previewVersion.created_from_version_id !== null && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-muted-foreground px-1 block">
                    Alasan Revisi <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Jelaskan mengapa parameter ini direvisi..."
                    className="w-full px-4 py-3 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none resize-none h-20"
                  />
                </div>
              )}

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-wider">
                  Setelah dipublish, rule ini tidak dapat diubah lagi (Immutable). Versi published sebelumnya akan menjadi superseded.
                </p>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-foreground/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishConfirmed}
                  onChange={(e) => setPublishConfirmed(e.target.checked)}
                  className="w-5 h-5 accent-primary rounded"
                />
                <span className="text-xs font-bold text-foreground">Saya telah meninjau parameter dan bobot di atas</span>
              </label>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || !publishConfirmed || (previewVersion.created_from_version_id !== null && !changeReason.trim())}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all"
                >
                  {isPublishing ? "Mempublish..." : "Ya, Publish Sekarang"}
                </button>
                <button
                  onClick={() => {
                    setPreviewVersion(null);
                    setChangeReason("");
                    setPublishConfirmed(false);
                  }}
                  className="w-full py-4 bg-foreground/5 text-muted-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-foreground/10 transition"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
