import { useState, useMemo, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import type { QAIndicator, QAPeriod, QATemuan, ServiceWeight, RuleVersion, AgentDirectoryResponse, ResolvedSidakInputConfig } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, FolderOpen, User as UserIcon, CalendarDays, Plus,
  Upload, Check, ChevronRight, AlertCircle,
  AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import TemuanGroupGrid from "../../components/sidak/TemuanGroupGrid";
import SidakInputScoreCard from "../../components/sidak/SidakInputScoreCard";
import SidakSelectionCard from "../../components/sidak/SidakSelectionCard";
import SidakSelectionGrid from "../../components/sidak/SidakSelectionGrid";
import SidakInputManualForm from "../../components/sidak/SidakInputManualForm";
import SidakInputImportPanel from "../../components/sidak/SidakInputImportPanel";
import {
  resolveServiceTypeFromTeam, calculateQAScoreFromTemuan,
} from "../../lib/scoring";
import { useTemuanEdit } from "./hooks/useTemuanEdit";
import { useTemuanForm, newEntry } from "./hooks/useTemuanForm";
import { useTemuanImport } from "./hooks/useTemuanImport";

const MONTHS = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember",
];

type Step = "folder" | "agent" | "period" | "list";

const SERVICE_TYPES = ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"];
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

interface AgentEntry {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
  jabatan?: string | null;
}

export function normalizeAgentsResponse(raw: unknown): AgentEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.agents)) return obj.agents as AgentEntry[];
  if (Array.isArray(raw)) return raw as AgentEntry[];
  return [];
}

export default function SidakInputPage() {
  const [step, setStep] = useState<Step>("folder");
  const [showAllData, setShowAllData] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<QAPeriod | null>(null);
  const [selectedService, setSelectedService] = useState<QAIndicator["service_type"]>("call");
  const [activeWeight, setActiveWeight] = useState<ServiceWeight | null>(null);

  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "trainer";

  const { data: folders } = useApi<{ id: string; name: string }[]>("/sidak/folders");
  const { data: periods } = useApi<QAPeriod[]>("/sidak/periods");
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [temuan, setTemuan] = useState<QATemuan[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Resolved Config State
  const [resolvedIndicators, setResolvedIndicators] = useState<QAIndicator[]>([]);
  const [ruleVersionId, setRuleVersionId] = useState<string | null>(null);
  const [hasDraftVersion, setHasDraftVersion] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const activeIndicators = resolvedIndicators;

  const unlinkedIndicatorIds = useMemo(() => {
    const set = new Set<string>();
    resolvedIndicators.forEach((i: any) => {
      if (i.ruleIndicatorId && !i.legacyIndicatorId) {
        set.add(i.ruleIndicatorId);
      }
    });
    return set;
  }, [resolvedIndicators]);

  const loadResolvedConfig = useCallback(async (service: QAIndicator["service_type"], periodId?: string) => {
    setLoadingConfig(true);
    setResolvedIndicators([]);
    setActiveWeight(null);
    setRuleVersionId(null);
    setHasDraftVersion(false);
    try {
      const response = await sidakClient["resolved-input-config"].$get({ query: { service_type: service, ...(periodId ? { period_id: periodId } : {}) } });
      const res = (await unwrapResponse(response)) as ResolvedSidakInputConfig;
      if (res) {
        setResolvedIndicators(res.indicators || []);
        setActiveWeight(res.weight || null);
        setRuleVersionId(res.ruleVersionId || null);
        setHasDraftVersion(!!res.hasDraftVersion);
      }
    } catch (err) {
      console.error("Gagal memuat konfigurasi input SIDAK:", err);
      setErrorMsg("Gagal memuat parameter");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Initialize Hooks
  const editHook = useTemuanEdit({
    temuan,
    setTemuan,
    setErrorMsg,
    setSuccessMsg,
  });

  const formHook = useTemuanForm({
    selectedAgent,
    selectedPeriod,
    selectedService,
    activeIndicators,
    unlinkedIndicatorIds,
    temuan,
    setTemuan,
    setErrorMsg,
    setSuccessMsg,
  });

  const importHook = useTemuanImport({
    selectedAgent,
    selectedPeriod,
    selectedService,
    activeIndicators,
    unlinkedIndicatorIds,
    temuan,
    setTemuan,
    setErrorMsg,
    setSuccessMsg,
  });

  const { setEntries } = formHook;

  const indicatorLookup = useMemo(() => {
    const map = new Map<string, QAIndicator>();
    activeIndicators.forEach((i) => map.set(i.id, i));
    return map;
  }, [activeIndicators]);

  const indicatorLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    activeIndicators.forEach((i) => map.set(i.id, i.name));
    return map;
  }, [activeIndicators]);

  const displayFolders = folders ?? [];

  const handleAgentClick = async (agent: AgentEntry) => {
    setSelectedAgent(agent);
    setSelectedPeriod(null);
    setTemuan([]);
    setLoading(true);
    setErrorMsg(null);

    try {
      const agentService = resolveServiceTypeFromTeam(agent.tim) as QAIndicator["service_type"];
      setSelectedService(agentService);
      await loadResolvedConfig(agentService);
      setStep("period");
    } catch {
      setErrorMsg("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodClick = async (period: QAPeriod) => {
    if (!selectedAgent) return;
    setSelectedPeriod(period);
    setLoading(true);
    setErrorMsg(null);

    try {
      const svc = selectedService;
      const [_, result] = await Promise.all([
        loadResolvedConfig(svc, period.id),
        unwrapResponse(await sidakClient.temuan.$get({ query: { peserta_id: selectedAgent.id, period_id: period.id, service_type: svc, limit: "200" } })),
      ]);
      setTemuan((result as { items: QATemuan[] }).items ?? []);
      setStep("list");
    } catch {
      setErrorMsg("Gagal memuat temuan");
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = useCallback(async (newService: QAIndicator["service_type"]) => {
    setSelectedService(newService);
    setLoading(true);
    setErrorMsg(null);
    setTemuan([]);
    setEntries([newEntry()]);
    importHook.setImportRows([]);
    importHook.setImportFile(null);
    try {
      await loadResolvedConfig(newService, selectedPeriod?.id);
      if (selectedAgent && selectedPeriod) {
        const result = await unwrapResponse(await sidakClient.temuan.$get({ query: { peserta_id: selectedAgent.id, period_id: selectedPeriod.id, service_type: newService, limit: "200" } }));
      setTemuan((result as { items: QATemuan[] }).items ?? []);
      }
    } catch {
      setErrorMsg("Gagal memuat data untuk layanan baru");
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, selectedPeriod, loadResolvedConfig, setEntries, importHook]);

  const handleFolderClick = async (folder: string) => {
    setSelectedFolder(folder);
    setSelectedAgent(null);
    setSelectedPeriod(null);
    setTemuan([]);
    setLoading(true);

    try {
      const year = new Date().getFullYear();
      const result = await unwrapResponse(await sidakClient.agents.$get({ query: { year: String(year) } }));
      const allAgents = normalizeAgentsResponse(result);
      const folderAgents = allAgents.filter(
        (a) => (a.batch_name ?? "").toLowerCase() === folder.toLowerCase(),
      );
      setAgents(folderAgents);
      setStep("agent");
    } catch {
      setErrorMsg("Gagal memuat agen");
    } finally {
      setLoading(false);
    }
  };

  const loadFolderAndPreSelectAgent = useCallback(async (folder: string, agentId: string) => {
    setErrorMsg(null);
    try {
      const year = new Date().getFullYear();
      const result = await unwrapResponse(await sidakClient.agents.$get({ query: { year: String(year) } }));
      const allAgents = normalizeAgentsResponse(result);
      const folderAgents = allAgents.filter(
        (a) => (a.batch_name ?? "").toLowerCase() === folder.toLowerCase(),
      );
      const found = folderAgents.find((a) => a.id === agentId);
      if (!found) {
        setErrorMsg("Agen tidak ditemukan. Silakan pilih manual.");
        setAgents(folderAgents);
        setSelectedFolder(folder);
        setStep("agent");
        return;
      }
      setAgents(folderAgents);
      setSelectedFolder(folder);
      setSelectedAgent(found);
      const agentService = resolveServiceTypeFromTeam(found.tim) as QAIndicator["service_type"];
      setSelectedService(agentService);
      await loadResolvedConfig(agentService);
      setStep("period");
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      setErrorMsg("Gagal memuat data. Silakan pilih manual.");
    }
  }, [loadResolvedConfig]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const folder = params.get("folder");
    const agentId = params.get("agent_id");
    if (folder && agentId) {
      loadFolderAndPreSelectAgent(folder, agentId);
    }
  }, [loadFolderAndPreSelectAgent]);

  const groupedTemuan = useMemo(() => {
    const groups: { key: string; label: string | null; items: QATemuan[] }[] = [];
    const keyToGroup = new Map<string, number>();
    temuan.forEach((t) => {
      const key = t.no_tiket?.trim() || `__solo_${t.id}`;
      if (!keyToGroup.has(key)) {
        keyToGroup.set(key, groups.length);
        groups.push({ key, label: t.no_tiket?.trim() || null, items: [] });
      }
      groups[keyToGroup.get(key)!].items.push(t);
    });
    return groups;
  }, [temuan]);

  const liveScore = useMemo(() => {
    if (!activeIndicators.length || !activeWeight) return null;
    return calculateQAScoreFromTemuan(
      activeIndicators,
      temuan.map((t) => ({ indicator_id: t.indicator_id, nilai: t.nilai, no_tiket: t.no_tiket })),
      activeWeight,
    );
  }, [temuan, activeIndicators, activeWeight]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    activeIndicators.forEach((i) => {
      if (i.category) map.set(i.id, i.category);
    });
    return map;
  }, [activeIndicators]);

  const scoringMode = activeWeight?.scoring_mode ?? "weighted";

  const resetToStep = (target: Step) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    formHook.resetForm();
    editHook.setDeletingId(null);
    editHook.setEditingId(null);
    if (target === "folder") {
      setSelectedFolder(null);
      setSelectedAgent(null);
      setSelectedPeriod(null);
      setTemuan([]);
    } else if (target === "agent") {
      setSelectedAgent(null);
      setSelectedPeriod(null);
      setTemuan([]);
    } else if (target === "period") {
      setSelectedPeriod(null);
      setTemuan([]);
    }
    setStep(target);
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* COMPACT BREADCRUMB */}
          <div className="flex items-center gap-1 text-[10px] md:text-xs font-semibold uppercase tracking-wide whitespace-nowrap overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => resetToStep("folder")}
              className={`transition-colors shrink-0 ${step === "folder" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Folder
            </button>
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            <button
              type="button"
              onClick={() => selectedFolder && resetToStep("agent")}
              disabled={!selectedFolder}
              className={`transition-colors truncate max-w-[120px] ${step === "agent" ? "text-foreground" : selectedFolder ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30"}`}
            >
              {selectedFolder || "Agen"}
            </button>
            {selectedFolder && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <button
                  type="button"
                  onClick={() => selectedAgent && resetToStep("period")}
                  disabled={!selectedAgent}
                  className={`transition-colors truncate max-w-[120px] ${step === "period" ? "text-foreground" : selectedAgent ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30"}`}
                >
                  {selectedAgent?.nama || "Agen"}
                </button>
              </>
            )}
            {selectedAgent && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <span className={`truncate max-w-[120px] ${step === "list" ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "Periode"}
                </span>
              </>
            )}
          </div>

          {/* MESSAGES */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3.5 rounded-lg bg-red-500/5 border border-red-500/25 text-red-650 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3.5 rounded-lg bg-green-500/5 border border-green-500/25 text-emerald-600 text-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4 shrink-0" />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* STEP 1: FOLDER SELECTION */}
          {step === "folder" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-outfit text-lg font-bold text-foreground">
                    Pilih Folder
                  </h2>
                </div>
                <button
                  data-testid="show-all-toggle"
                  type="button"
                  onClick={() => {
                    setShowAllData(!showAllData);
                    setSelectedFolder(null);
                    setSelectedAgent(null);
                    setSelectedPeriod(null);
                    setTemuan([]);
                    setStep("folder");
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all border border-border ${
                    showAllData
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {showAllData ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showAllData ? "Data Terfilter" : "Tampilkan Semua"}
                </button>
              </div>

              {displayFolders.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada folder"
                  description="Tidak ada folder yang tersedia untuk input temuan."
                />
              ) : (
                <SidakSelectionGrid testId="folder-selection-grid">
                  {displayFolders.map((f, i) => (
                    <SidakSelectionCard
                      key={f.id}
                      delay={i * 0.02}
                      icon={<FolderOpen className="h-5 w-5" />}
                      title={f.name}
                      onClick={() => handleFolderClick(f.name)}
                      testId="folder-selection-card"
                    />
                  ))}
                </SidakSelectionGrid>
              )}
            </motion.div>
          )}

          {/* STEP 2: AGENT SELECTION */}
          {step === "agent" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-outfit text-lg font-bold text-foreground">
                    Pilih Agen
                  </h2>
                </div>
              </div>

              {loading ? (
                <SidakSelectionGrid testId="agent-selection-skeleton">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="min-h-32 rounded-xl border border-border bg-surface/50 p-5 animate-pulse">
                      <div className="h-11 w-11 rounded bg-foreground/10" />
                      <div className="mt-5 h-3 w-28 rounded bg-foreground/10" />
                      <div className="mt-2 h-2.5 w-20 rounded bg-foreground/10" />
                    </div>
                  ))}
                </SidakSelectionGrid>
              ) : agents.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Tidak ada agen"
                  description={`Tidak ditemukan agen untuk folder "${selectedFolder}".`}
                />
              ) : (
                <SidakSelectionGrid testId="agent-selection-grid">
                  {agents.map((agent, i) => (
                    <SidakSelectionCard
                      key={agent.id}
                      delay={i * 0.02}
                      icon={<span className="text-sm font-black">{agent.nama.charAt(0).toUpperCase()}</span>}
                      title={agent.nama}
                      subtitle={agent.batch_name || agent.tim || "-"}
                      onClick={() => handleAgentClick(agent)}
                      testId="agent-selection-card"
                    />
                  ))}
                </SidakSelectionGrid>
              )}
            </motion.div>
          )}

          {/* STEP 3: PERIOD SELECTION */}
          {step === "period" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-outfit text-lg font-bold text-foreground">
                    Pilih Periode
                  </h2>
                </div>
              </div>

              {loading ? (
                <SidakSelectionGrid testId="period-selection-skeleton">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="min-h-32 rounded-xl border border-border bg-surface/50 p-5 animate-pulse">
                      <div className="h-11 w-11 rounded bg-foreground/10" />
                      <div className="mt-5 h-3 w-24 rounded bg-foreground/10" />
                      <div className="mt-2 h-2.5 w-16 rounded bg-foreground/10" />
                    </div>
                  ))}
                </SidakSelectionGrid>
              ) : !periods || periods.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada periode"
                  description="Tidak ada periode audit yang tersedia."
                />
              ) : (
                <SidakSelectionGrid testId="period-selection-grid">
                  {periods.map((p, i) => (
                    <SidakSelectionCard
                      key={p.id}
                      delay={i * 0.02}
                      icon={<span className="text-sm font-black text-indigo-500">{String(p.month).padStart(2, "0")}</span>}
                      title={MONTHS[p.month - 1]}
                      subtitle={String(p.year)}
                      onClick={() => handlePeriodClick(p)}
                      testId="period-selection-card"
                    />
                  ))}
                </SidakSelectionGrid>
              )}
            </motion.div>
          )}

          {/* STEP 4: TEMUAN LIST */}
          {step === "list" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => resetToStep("period")}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h1 className="font-outfit text-2xl font-bold tracking-tight text-foreground">
                      Daftar Temuan
                    </h1>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1 ml-9">
                    {selectedAgent?.nama}
                    {" · "}
                    {selectedPeriod && `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}`}
                    {" · "}
                    {SERVICE_LABELS[selectedService]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {role !== "leader" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          importHook.setShowImport(!importHook.showImport);
                          importHook.setImportTab("download");
                          importHook.setImportRows([]);
                          importHook.setImportFile(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-foreground hover:bg-muted text-xs font-semibold uppercase tracking-wide transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Import
                      </button>
                      {!formHook.showForm && !importHook.showImport && (
                        <button
                          type="button"
                          onClick={formHook.handlePerfectScore}
                          disabled={formHook.saving || formHook.hasBadFindings}
                          className={
                            formHook.hasBadFindings
                              ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wide cursor-not-allowed opacity-50"
                              : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border hover:bg-muted text-emerald-600 text-xs font-semibold uppercase tracking-wide transition-colors"
                          }
                          title={
                            formHook.hasBadFindings
                              ? "Sesi tanpa temuan hanya bisa dibuat jika belum ada laporan temuan buruk."
                              : ""
                          }
                        >
                          <Check className="w-3.5 h-3.5" />
                          {formHook.hasBadFindings ? "Sudah Ada Temuan" : "Sesi Tanpa Temuan"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => formHook.setShowForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold uppercase tracking-wide hover:opacity-90 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Konfigurasi Audit card */}
              <div className="bg-surface rounded-xl border border-border p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Konfigurasi Audit
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
                      Layanan Audit
                    </label>
                    <select
                      value={selectedService}
                      onChange={(e) => handleServiceChange(e.target.value as QAIndicator["service_type"])}
                      className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground cursor-pointer"
                    >
                      {SERVICE_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {SERVICE_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
                      Tim Agent
                    </label>
                    <div className="flex items-center h-10 px-3 rounded-lg border border-border bg-background text-sm text-muted-foreground">
                      {selectedAgent?.tim || selectedAgent?.batch_name || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estimasi Skor card */}
              <SidakInputScoreCard
                liveScore={liveScore}
                activeWeight={activeWeight}
                agentName={selectedAgent?.nama ?? ""}
                periodLabel={selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : ""}
              />

              {/* Draft warning banner */}
              {hasDraftVersion && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/25 text-amber-600 font-medium text-sm flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Ada draft parameter yang belum dipublikasikan. Input temuan saat ini menggunakan parameter versi terakhir yang published.
                </motion.div>
              )}

              {selectedPeriod && !loadingConfig && !ruleVersionId && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/25 text-amber-600 font-medium text-sm flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Belum ada parameter yang berlaku untuk {SERVICE_LABELS[selectedService]} pada periode ini. Cek Settings QA untuk mempublish parameter yang sesuai.
                </motion.div>
              )}

              {/* Info bar */}
              <div className="p-3 rounded-lg bg-surface border border-border text-sm text-muted-foreground flex items-center gap-3">
                <span>Total temuan: <strong className="text-foreground">{temuan.length}</strong></span>
                <span className="text-muted-foreground/30">|</span>
                <span>Group: <strong className="text-foreground">{groupedTemuan.length}</strong></span>
              </div>

              {/* ADD FORM */}
              <AnimatePresence>
                {formHook.showForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <SidakInputManualForm
                      entries={formHook.entries}
                      noTiket={formHook.noTiket}
                      onSetNoTiket={formHook.setNoTiket}
                      onUpdateEntry={formHook.updateEntry}
                      onAddEntry={() => formHook.setEntries((prev) => [...prev, newEntry()])}
                      onRemoveEntry={(uid) => formHook.setEntries((prev) => prev.filter((e) => e.uid !== uid))}
                      onSave={formHook.handleSave}
                      onCancel={formHook.resetForm}
                      activeIndicators={activeIndicators}
                      scoringMode={scoringMode}
                      saving={formHook.saving}
                      previewing={formHook.previewing}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* IMPORT PANEL */}
              <AnimatePresence>
                {importHook.showImport && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <SidakInputImportPanel
                      show={importHook.showImport}
                      onClose={importHook.handleImportClose}
                      importTab={importHook.importTab}
                      onSetImportTab={importHook.setImportTab}
                      importRows={importHook.importRows}
                      importFile={importHook.importFile}
                      generatingTemplate={importHook.generatingTemplate}
                      parsing={importHook.parsing}
                      importing={importHook.importing}
                      onDownloadTemplate={importHook.handleDownloadTemplate}
                      onFileUpload={importHook.handleFileUpload}
                      onImportSave={importHook.handleImportSave}
                      disabled={activeIndicators.length === 0}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TEMUAN LIST */}
              {loading ? (
                <div
                  data-testid="temuan-grid-skeleton"
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="min-h-40 rounded-2xl bg-card/50 border border-border animate-pulse"
                    />
                  ))}
                </div>
              ) : groupedTemuan.length === 0 ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada temuan"
                  description="Belum ada data temuan untuk agen ini pada periode dan layanan yang dipilih."
                  action={
                    <button
                      type="button"
                      onClick={() => formHook.setShowForm(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold uppercase tracking-wide"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Temuan
                    </button>
                  }
                />
              ) : (
                <TemuanGroupGrid
                  groups={groupedTemuan}
                  indicatorLabelMap={indicatorLabelMap}
                  categoryMap={categoryMap}
                  editingId={editHook.editingId}
                  editNilai={editHook.editNilai}
                  editKetidaksesuaian={editHook.editKetidaksesuaian}
                  editSebaiknya={editHook.editSebaiknya}
                  deletingId={editHook.deletingId}
                  canEdit={role !== "leader"}
                  onStartEdit={editHook.startEdit}
                  onCancelEdit={editHook.cancelEdit}
                  onSaveEdit={editHook.handleSaveEdit}
                  onDelete={editHook.handleDelete}
                  setEditNilai={editHook.setEditNilai}
                  setEditKetidaksesuaian={editHook.setEditKetidaksesuaian}
                  setEditSebaiknya={editHook.setEditSebaiknya}
                />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
