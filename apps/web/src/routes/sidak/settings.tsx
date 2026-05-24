import { useApi, getApi, putApi, postApi, deleteApi } from "../../hooks/useApi";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Plus, Trash2, Info,
  Check, History, Clock, Rocket, AlertTriangle,
  GitBranch, X, Loader2, Pencil
} from "lucide-react";
import { notify } from "../../lib/toast";
import type { ServiceType, RuleVersion, QARuleIndicator } from "@trainers/types";

const TEAMS: ServiceType[] = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"];

const SERVICE_LABELS: Record<string, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

const CAT_LABEL: Record<string, string> = {
  non_critical: "Non-Critical Error",
  critical: "Critical Error",
  none: "Semua Parameter",
};

const CAT_COLOR: Record<string, string> = {
  non_critical: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
  none: "bg-muted text-muted-foreground border-border",
};

const formatPeriodLabel = (month?: number, year?: number) => {
  if (!month || !year) return "-";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${months[month - 1]} ${year}`;
};

export default function SidakSettingsPage() {
  const [activeTeam, setActiveTeam] = useState<ServiceType>("call");
  const [selectedVersion, setSelectedVersion] = useState<RuleVersion | null>(null);
  const [draftIndicators, setDraftIndicators] = useState<QARuleIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);

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
    if (versions && versions.length > 0) {
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
  }, [versions]);

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
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card/30 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-1 p-1 bg-foreground/5 rounded-xl border border-border">
              {TEAMS.map((team) => (
                <button
                  key={team}
                  onClick={() => setActiveTeam(team)}
                  className={`flex-1 min-w-[60px] py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                    activeTeam === team ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-foreground/5"
                  }`}
                >
                  {SERVICE_LABELS[team]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Riwayat Versi</p>
              {versionsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-foreground/5 animate-pulse rounded-2xl border border-border/50" />
                  ))}
                </div>
              ) : !versions || versions.length === 0 ? (
                <div className="p-4 text-center border-2 border-dashed border-border rounded-2xl">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Belum ada versi</p>
                  <button onClick={() => handleCreateDraft()} className="mt-2 text-[10px] font-black text-primary uppercase underline">
                    Buat Baseline
                  </button>
                </div>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(v)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        selectedVersion?.id === v.id
                          ? "bg-primary/5 border-primary shadow-sm shadow-primary/10"
                          : "bg-card border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                            v.status === "draft"
                              ? "bg-amber-500/20 text-amber-600 border border-amber-500/20"
                              : v.status === "superseded"
                              ? "bg-muted text-muted-foreground border border-border"
                              : "bg-emerald-500/20 text-emerald-600 border border-emerald-500/20"
                          }`}
                        >
                          {v.status}
                        </span>
                        <span className="text-[9px] font-bold text-muted-foreground">
                          {new Date(v.created_at).toLocaleDateString("id-ID")}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-foreground">v{v.version_number}</span>
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          Efektif: {getPeriodLabel(v.effective_period_id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 opacity-60 group-hover:opacity-100 text-[10px] font-bold text-muted-foreground uppercase">
                        <Clock className="w-3 h-3" />
                        <span>{v.scoring_mode} Mode</span>
                      </div>
                    </button>

                    {v.status === "draft" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(v.id);
                        }}
                        className="absolute bottom-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-destructive/20"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

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
                {selectedVersion.status === "published" ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex items-start gap-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Check className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                        Versi Aktif (Published) v{selectedVersion.version_number}
                      </h2>
                      <p className="text-sm text-emerald-600/80 font-medium leading-relaxed mt-1">
                        Versi ini bersifat <strong>immutable</strong> dan digunakan untuk kalkulasi periode{" "}
                        <strong>{getPeriodLabel(selectedVersion.effective_period_id)}</strong> dan seterusnya hingga ada versi baru.
                      </p>
                    </div>
                  </div>
                ) : selectedVersion.status === "superseded" ? (
                  <div className="bg-muted border border-border rounded-3xl p-6 flex items-start gap-4">
                    <div className="w-12 h-12 bg-foreground/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <History className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-foreground/80">
                        Versi Lama (Superseded) v{selectedVersion.version_number}
                      </h2>
                      <p className="text-sm text-muted-foreground font-medium leading-relaxed mt-1">
                        Versi ini telah digantikan oleh versi yang lebih baru. Data historis yang menggunakan versi ini tetap dipertahankan.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <Pencil className="w-6 h-6 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-black text-amber-700 dark:text-amber-400">
                          Draft Rules v{selectedVersion.version_number}
                        </h2>
                        <p className="text-sm text-amber-600/80 font-medium leading-relaxed mt-1">
                          Anda dapat mengubah parameter dan bobot pada draft ini. Publish draft ini untuk menjadikannya rule efektif mulai bulan tertentu.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span className="text-[10px] font-black uppercase text-amber-700">
                            Target: {getPeriodLabel(selectedVersion.effective_period_id)}
                          </span>
                        </div>
                      </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Threshold</label>
                    <input
                      type="number"
                      value={newThreshold}
                      onChange={(e) => setNewThreshold(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Urutan (sort_order)</label>
                    <input
                      type="number"
                      value={newSortOrder}
                      onChange={(e) => setNewSortOrder(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
                    />
                  </div>
                </div>
                <button
                      onClick={() => setShowAddForm(true)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition"
                    >
                      Tambah Parameter
                    </button>
                  </div>
                )}

                {/* Weights & Mode Panel */}
                <div className="bg-card rounded-[2.5rem] border border-border p-8 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Konfigurasi Bobot & Mode
                    </h3>
                    <span className="px-3 py-1 bg-foreground/5 border border-border rounded-full text-[10px] font-black uppercase">
                      {selectedVersion.scoring_mode} Mode
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot Non-Critical</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          disabled={!isDraft || selectedVersion.scoring_mode === "no_category"}
                          value={selectedVersion.non_critical_weight * 100}
                          onChange={async (e) => {
                            const ncVal = parseInt(e.target.value) / 100;
                            const cVal = (100 - parseInt(e.target.value)) / 100;
                            try {
                              const updated = await putApi<RuleVersion>(`/sidak/rule-versions/${selectedVersion.id}`, {
                                non_critical_weight: ncVal,
                                critical_weight: cVal,
                              });
                              setSelectedVersion(updated);
                            } catch (err: any) {
                              notify.error(err.message || "Gagal mengupdate bobot");
                            }
                          }}
                          className="flex-1 accent-primary disabled:opacity-30 cursor-pointer"
                        />
                        <span className="w-12 text-center font-black text-sm">{Math.round(selectedVersion.non_critical_weight * 100)}%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot Critical</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          disabled={true}
                          value={selectedVersion.critical_weight * 100}
                          className="flex-1 accent-red-500 opacity-50"
                        />
                        <span className="w-12 text-center font-black text-sm text-red-500">{Math.round(selectedVersion.critical_weight * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  {isDraft && selectedVersion.scoring_mode !== "no_category" && (
                    <div className="flex gap-2 pt-4 border-t border-border">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Info className="w-3 h-3 text-primary" /> Geser slider untuk mengubah proporsi kontribusi antar kategori.
                      </p>
                    </div>
                  )}
                </div>

                {/* Parameters List */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Daftar Parameter</h3>

                  {loadingIndicators ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 bg-card animate-pulse rounded-2xl border border-border" />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm divide-y divide-border">
                      {draftIndicators.length === 0 ? (
                        <div className="p-12 text-center space-y-4">
                          <Info className="w-12 h-12 text-muted-foreground/20 mx-auto" />
                          <p className="text-sm font-bold text-muted-foreground">Belum ada parameter di versi ini.</p>
                          {publishedWhenDraftEmpty && (
                            <div className="inline-flex flex-col items-center gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                              <p className="text-xs text-amber-600/80">
                                Versi published <span className="font-black">v{publishedWhenDraftEmpty.version_number}</span> sudah memiliki parameter.
                              </p>
                              <button
                                onClick={() => handleCreateDraft(publishedWhenDraftEmpty.id)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Create Revision dari Published
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        draftIndicators.map((ind) => (
                          <div key={ind.id} className="group p-4 lg:px-8 hover:bg-foreground/[0.01] transition-all flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="w-12 text-center flex-shrink-0">
                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-wider ${CAT_COLOR[ind.category as any] || CAT_COLOR.none}`}>
                                  {Math.round(ind.bobot * 100)}%
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{ind.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border uppercase tracking-widest ${CAT_COLOR[ind.category as any] || CAT_COLOR.none}`}>
                                    {CAT_LABEL[ind.category as any] ? CAT_LABEL[ind.category as any].replace(" Error", "") : ind.category}
                                  </span>
                                  {ind.has_na && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-foreground/5 text-muted-foreground border border-border">N/A</span>}
                                  {ind.sort_order != null && ind.sort_order > 0 && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">#{ind.sort_order}</span>
                                  )}
                                  {ind.threshold != null && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">Th: {ind.threshold}</span>
                                  )}
                                  {ind.legacy_indicator_id && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Linked</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isDraft && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                <button
                                  onClick={() => {
                                    setEditIndId(ind.id);
                                    setEditState({
                                      name: ind.name,
                                      category: ind.category,
                                      bobot: String(Math.round(ind.bobot * 100)),
                                      has_na: ind.has_na,
                                      threshold: ind.threshold != null ? String(ind.threshold) : "",
                                      sort_order: String(ind.sort_order ?? 0),
                                    });
                                  }}
                                  className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteIndicator(ind.id)}
                                  className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
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
