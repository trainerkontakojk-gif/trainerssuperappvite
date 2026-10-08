import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import {
  formatQAIndicatorName,
  type QAIndicator,
  type QAPeriod,
  type QATemuan,
  type ServiceWeight,
  type ResolvedSidakInputConfig,
} from "@trainers/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import TemuanGroupGrid from "../../components/sidak/TemuanGroupGrid";
import SidakInputContextBar from "../../components/sidak/SidakInputContextBar";
import SidakInputSessionSummary from "../../components/sidak/SidakInputSessionSummary";
import SidakInputManualForm from "../../components/sidak/SidakInputManualForm";
import SidakInputImportPanel from "../../components/sidak/SidakInputImportPanel";
import {
  periodLabel,
  SERVICE_TYPES,
} from "../../components/sidak/sidak-input.constants";
import { calculateQAScoreFromTemuan, SERVICE_LABELS } from "../../lib/scoring";
import { resolveInitialInputService } from "../../lib/sidak-input-service";
import {
  normalizeAgentsResponse,
  type SidakInputAgent,
} from "../../lib/sidak-input-agents";
import { useTemuanEdit } from "./hooks/useTemuanEdit";
import { useTemuanForm, newEntry } from "./hooks/useTemuanForm";
import { useTemuanImport } from "./hooks/useTemuanImport";

type ServiceType = QAIndicator["service_type"];

function isServiceType(value: string | null): value is ServiceType {
  return value !== null && (SERVICE_TYPES as string[]).includes(value);
}

export default function SidakInputPage() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<SidakInputAgent | null>(
    null,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<QAPeriod | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceType | "">("");
  const [activeWeight, setActiveWeight] = useState<ServiceWeight | null>(null);
  const [initialized, setInitialized] = useState(false);

  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "trainer";
  const reduceMotion = useReducedMotion();

  const { data: folders, error: foldersError } =
    useApi<{ id: string; name: string }[]>("/sidak/folders");
  const { data: periods, error: periodsError } =
    useApi<QAPeriod[]>("/sidak/periods");
  const [agents, setAgents] = useState<SidakInputAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [temuan, setTemuan] = useState<QATemuan[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<
    | {
        kind: "workspace";
        agent: SidakInputAgent;
        period: QAPeriod | null;
        service: ServiceType;
      }
    | { kind: "agents"; folder: string }
    | null
  >(null);

  // Resolved Config State
  const [resolvedIndicators, setResolvedIndicators] = useState<QAIndicator[]>(
    [],
  );
  const [ruleVersionId, setRuleVersionId] = useState<string | null>(null);
  const [hasDraftVersion, setHasDraftVersion] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Token permintaan: respons lama tidak boleh menimpa konteks yang lebih baru.
  const contextSeq = useRef(0);
  const agentsSeq = useRef(0);

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

  const clearResolvedConfig = useCallback(() => {
    setResolvedIndicators([]);
    setActiveWeight(null);
    setRuleVersionId(null);
    setHasDraftVersion(false);
  }, []);

  const loadResolvedConfig = useCallback(
    async (
      service: ServiceType,
      periodId: string | undefined,
      isCurrent: () => boolean,
    ) => {
      setLoadingConfig(true);
      clearResolvedConfig();
      try {
        const response = await sidakClient["resolved-input-config"].$get({
          query: {
            service_type: service,
            ...(periodId ? { period_id: periodId } : {}),
          },
        });
        const res = (await unwrapResponse(
          response,
        )) as ResolvedSidakInputConfig;
        if (!isCurrent()) return;
        if (res) {
          setResolvedIndicators(res.indicators || []);
          setActiveWeight(res.weight || null);
          setRuleVersionId(res.ruleVersionId || null);
          setHasDraftVersion(!!res.hasDraftVersion);
        }
      } catch (err) {
        console.error("Gagal memuat konfigurasi input SIDAK:", err);
        if (isCurrent()) setErrorMsg("Gagal memuat parameter");
      } finally {
        if (isCurrent()) setLoadingConfig(false);
      }
    },
    [clearResolvedConfig],
  );

  /**
   * Muat parameter (+ temuan bila periode sudah dipilih) untuk satu konteks.
   * Tanpa layanan (tim Mix) tidak ada yang dimuat.
   */
  const loadWorkspace = useCallback(
    async (
      agent: SidakInputAgent | null,
      period: QAPeriod | null,
      service: ServiceType | "",
    ) => {
      const seq = ++contextSeq.current;
      const isCurrent = () => seq === contextSeq.current;
      setTemuan([]);
      setErrorMsg(null);
      setRetryTarget(null);

      if (!agent || !service) {
        clearResolvedConfig();
        setLoadingConfig(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [, result] = await Promise.all([
          loadResolvedConfig(service, period?.id, isCurrent),
          period
            ? unwrapResponse(
                await sidakClient.temuan.$get({
                  query: {
                    peserta_id: agent.id,
                    period_id: period.id,
                    service_type: service,
                    limit: "200",
                  },
                }),
              )
            : Promise.resolve(null),
        ]);
        if (!isCurrent()) return;
        if (result) setTemuan((result as { items: QATemuan[] }).items ?? []);
      } catch {
        if (!isCurrent()) return;
        setErrorMsg("Gagal memuat temuan");
        setRetryTarget({ kind: "workspace", agent, period, service });
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [loadResolvedConfig, clearResolvedConfig],
  );

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

  const indicatorLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    activeIndicators.forEach((i) => map.set(i.id, formatQAIndicatorName(i)));
    return map;
  }, [activeIndicators]);

  const folderOptions = useMemo(() => {
    const list = folders ?? [];
    if (selectedFolder && !list.some((f) => f.name === selectedFolder)) {
      return [...list, { id: `url:${selectedFolder}`, name: selectedFolder }];
    }
    return list;
  }, [folders, selectedFolder]);

  const periodOptions = useMemo(
    () =>
      [...(periods ?? [])].sort(
        (a, b) => b.year - a.year || b.month - a.month,
      ),
    [periods],
  );

  /** Tutup form/import dan batalkan edit/hapus saat konteks berganti. */
  const closeWorkspaceUi = () => {
    setSuccessMsg(null);
    formHook.resetForm();
    editHook.setDeletingId(null);
    editHook.setEditingId(null);
    importHook.handleImportClose();
  };

  const fetchFolderAgents = useCallback(
    async (folder: string): Promise<SidakInputAgent[]> => {
      const year = new Date().getFullYear();
      const result = await unwrapResponse(
        await sidakClient.agents.$get({ query: { year: String(year) } }),
      );
      return normalizeAgentsResponse(result).filter(
        (a) => (a.batch_name ?? "").toLowerCase() === folder.toLowerCase(),
      );
    },
    [],
  );

  const loadAgentsForFolder = useCallback(
    async (folder: string) => {
      const seq = ++agentsSeq.current;
      setLoadingAgents(true);
      try {
        const list = await fetchFolderAgents(folder);
        if (seq === agentsSeq.current) setAgents(list);
      } catch {
        if (seq !== agentsSeq.current) return;
        setAgents([]);
        setErrorMsg("Gagal memuat agen");
        setRetryTarget({ kind: "agents", folder });
      } finally {
        if (seq === agentsSeq.current) setLoadingAgents(false);
      }
    },
    [fetchFolderAgents],
  );

  const handleRetry = () => {
    if (!retryTarget) return;
    setErrorMsg(null);
    setRetryTarget(null);
    if (retryTarget.kind === "agents") {
      void loadAgentsForFolder(retryTarget.folder);
    } else {
      void loadWorkspace(
        retryTarget.agent,
        retryTarget.period,
        retryTarget.service,
      );
    }
  };

  const handleFolderChange = (folder: string) => {
    if (folder === selectedFolder) return;
    closeWorkspaceUi();
    contextSeq.current += 1;
    setErrorMsg(null);
    setRetryTarget(null);
    setSelectedFolder(folder);
    setSelectedAgent(null);
    setSelectedPeriod(null);
    setSelectedService("");
    setTemuan([]);
    clearResolvedConfig();
    setLoading(false);
    setAgents([]);
    void loadAgentsForFolder(folder);
  };

  const handleAgentChange = (agent: SidakInputAgent) => {
    if (agent.id === selectedAgent?.id) return;
    closeWorkspaceUi();
    const service = resolveInitialInputService(agent.tim);
    setSelectedAgent(agent);
    setSelectedService(service);
    void loadWorkspace(agent, selectedPeriod, service);
  };

  const handlePeriodChange = (periodId: string) => {
    const period = periodOptions.find((p) => p.id === periodId);
    if (!period || period.id === selectedPeriod?.id) return;
    closeWorkspaceUi();
    setSelectedPeriod(period);
    void loadWorkspace(selectedAgent, period, selectedService);
  };

  const handleServiceChange = (service: ServiceType) => {
    if (service === selectedService) return;
    closeWorkspaceUi();
    setSelectedService(service);
    void loadWorkspace(selectedAgent, selectedPeriod, service);
  };

  // Konteks awal dari URL: ?folder=&agent_id=&period_id=&service=
  const initStarted = useRef(false);
  useEffect(() => {
    if (initStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const folder = params.get("folder");
    const agentId = params.get("agent_id");
    const periodId = params.get("period_id");
    const serviceParam = params.get("service");

    if (!folder) {
      initStarted.current = true;
      setInitialized(true);
      return;
    }
    // Periode di URL hanya bisa dicocokkan setelah daftar periode dimuat.
    if (periodId && periods === null && !periodsError) return;
    initStarted.current = true;

    void (async () => {
      setSelectedFolder(folder);
      const seq = ++agentsSeq.current;
      setLoadingAgents(true);
      try {
        const folderAgents = await fetchFolderAgents(folder);
        if (seq !== agentsSeq.current) return;
        setAgents(folderAgents);
        const found = agentId
          ? folderAgents.find((a) => a.id === agentId)
          : undefined;
        if (agentId && !found) {
          setErrorMsg("Agen tidak ditemukan. Silakan pilih manual.");
        }
        if (found) {
          const period =
            (periodId ? periods?.find((p) => p.id === periodId) : null) ?? null;
          const service = isServiceType(serviceParam)
            ? serviceParam
            : resolveInitialInputService(found.tim);
          setSelectedAgent(found);
          setSelectedPeriod(period);
          setSelectedService(service);
          void loadWorkspace(found, period, service);
        }
      } catch {
        if (seq === agentsSeq.current) {
          setErrorMsg("Gagal memuat data. Silakan pilih manual.");
        }
      } finally {
        if (seq === agentsSeq.current) setLoadingAgents(false);
        setInitialized(true);
      }
    })();
  }, [periods, periodsError, fetchFolderAgents, loadWorkspace]);

  // Sinkronkan konteks ke URL (replaceState) agar reload mempertahankannya.
  useEffect(() => {
    if (!initialized) return;
    const params = new URLSearchParams();
    if (selectedFolder) params.set("folder", selectedFolder);
    if (selectedAgent) params.set("agent_id", selectedAgent.id);
    if (selectedPeriod) params.set("period_id", selectedPeriod.id);
    if (selectedService) params.set("service", selectedService);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [
    initialized,
    selectedFolder,
    selectedAgent,
    selectedPeriod,
    selectedService,
  ]);

  const groupedTemuan = useMemo(() => {
    const groups: { key: string; label: string | null; items: QATemuan[] }[] =
      [];
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
      temuan.map((t) => ({
        indicator_id: t.indicator_id,
        nilai: t.nilai,
        no_tiket: t.no_tiket,
      })),
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

  const serviceRequired =
    selectedAgent !== null && resolveInitialInputService(selectedAgent.tim) === "";
  const ready =
    selectedAgent !== null && selectedPeriod !== null && selectedService !== "";
  const showConfigWarning =
    ready &&
    !loadingConfig &&
    (hasDraftVersion || !ruleVersionId);

  const expandMotion = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto" },
        exit: { opacity: 0, height: 0 },
      };

  const renderEmptyContext = () => {
    if (folders && folders.length === 0) {
      return (
        <QaStatePanel
          type="empty"
          title="Belum ada folder"
          description="Tidak ada folder yang tersedia untuk input temuan."
        />
      );
    }
    if (periods && periods.length === 0 && selectedAgent) {
      return (
        <QaStatePanel
          type="empty"
          title="Belum ada periode"
          description="Tidak ada periode audit yang tersedia."
        />
      );
    }
    if (selectedFolder && !loadingAgents && agents.length === 0 && !errorMsg) {
      return (
        <QaStatePanel
          type="empty"
          title="Tidak ada agen"
          description={`Tidak ditemukan agen untuk folder "${selectedFolder}".`}
        />
      );
    }
    const next = !selectedFolder
      ? "Pilih folder untuk memulai."
      : !selectedAgent
        ? "Pilih agen untuk melanjutkan."
        : !selectedPeriod
          ? "Pilih periode untuk melihat temuan."
          : "Pilih layanan audit untuk memuat temuan.";
    return (
      <p className="py-6 text-sm text-muted-foreground">{next}</p>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-6 md:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="space-y-1">
            <h1 className="font-outfit text-2xl font-bold tracking-tight text-foreground">
              Input Temuan
            </h1>
            <p className="text-sm text-muted-foreground">
              Pilih agen dan periode, lalu catat temuan audit per tiket.
            </p>
          </header>

          <SidakInputContextBar
            folders={folderOptions}
            folder={selectedFolder}
            onFolderChange={handleFolderChange}
            agents={agents}
            agent={selectedAgent}
            loadingAgents={loadingAgents}
            onAgentChange={handleAgentChange}
            periods={periodOptions}
            periodId={selectedPeriod?.id ?? null}
            onPeriodChange={handlePeriodChange}
            service={selectedService}
            onServiceChange={handleServiceChange}
            serviceRequired={serviceRequired}
          />

          {/* PESAN STATUS */}
          {errorMsg ? (
            <QaStatePanel
              type="error"
              compact
              title={errorMsg}
              action={
                retryTarget ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-[44px]"
                    onClick={handleRetry}
                  >
                    Coba lagi
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {foldersError && !folders ? (
            <QaStatePanel
              type="error"
              compact
              title="Daftar folder belum dapat dimuat. Muat ulang halaman."
            />
          ) : null}
          {successMsg ? (
            <QaStatePanel type="success" compact title={successMsg} />
          ) : null}
          {showConfigWarning ? (
            <QaStatePanel
              type="warning"
              compact
              title="Konfigurasi parameter perlu dicek"
              description={
                !ruleVersionId
                  ? `Belum ada parameter yang berlaku untuk ${selectedService ? SERVICE_LABELS[selectedService] : "layanan ini"} pada periode ini. Cek Settings QA untuk mempublish parameter yang sesuai.${hasDraftVersion ? " Ada juga draft parameter yang belum dipublikasikan." : ""}`
                  : "Ada draft parameter yang belum dipublikasikan. Input temuan saat ini menggunakan parameter versi terakhir yang published."
              }
            />
          ) : null}

          {!ready ? (
            renderEmptyContext()
          ) : (
            <div className="space-y-5">
              <SidakInputSessionSummary
                liveScore={liveScore}
                activeWeight={activeWeight}
                temuanCount={temuan.length}
                ticketCount={groupedTemuan.length}
                actions={
                  role !== "leader" ? (
                    <>
                      {!formHook.showForm && !importHook.showImport && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-[44px] px-4"
                          onClick={formHook.handlePerfectScore}
                          disabled={formHook.saving || formHook.hasBadFindings}
                          title={
                            formHook.hasBadFindings
                              ? "Sesi tanpa temuan hanya bisa dibuat jika belum ada laporan temuan buruk."
                              : undefined
                          }
                        >
                          <Check aria-hidden="true" />
                          {formHook.hasBadFindings
                            ? "Sudah Ada Temuan"
                            : "Sesi Tanpa Temuan"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-[44px] px-4"
                        onClick={() => {
                          importHook.setShowImport(!importHook.showImport);
                          importHook.setImportTab("download");
                          importHook.setImportRows([]);
                          importHook.setImportFile(null);
                        }}
                      >
                        <Upload aria-hidden="true" />
                        Import
                      </Button>
                      <Button
                        type="button"
                        className="h-[44px] px-4"
                        onClick={() => formHook.setShowForm(true)}
                      >
                        <Plus aria-hidden="true" />
                        Tambah
                      </Button>
                    </>
                  ) : null
                }
              />

              {/* ADD FORM */}
              <AnimatePresence>
                {formHook.showForm && (
                  <motion.div
                    {...expandMotion}
                    className="overflow-hidden"
                  >
                    <SidakInputManualForm
                      entries={formHook.entries}
                      noTiket={formHook.noTiket}
                      tanggalLayanan={formHook.tanggalLayanan}
                      tanggalSampel={formHook.tanggalSampel}
                      onSetNoTiket={formHook.setNoTiket}
                      onSetTanggalLayanan={formHook.setTanggalLayanan}
                      onSetTanggalSampel={formHook.setTanggalSampel}
                      onUpdateEntry={formHook.updateEntry}
                      onAddEntry={() =>
                        formHook.setEntries((prev) => [...prev, newEntry()])
                      }
                      onRemoveEntry={(uid) =>
                        formHook.setEntries((prev) =>
                          prev.filter((e) => e.uid !== uid),
                        )
                      }
                      onSave={formHook.handleSave}
                      onCancel={formHook.resetForm}
                      activeIndicators={activeIndicators}
                      scoringMode={scoringMode}
                      serviceType={selectedService as ServiceType}
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
                    {...expandMotion}
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
                      serviceType={selectedService as ServiceType}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TEMUAN LIST */}
              {loading ? (
                <div
                  data-testid="temuan-grid-skeleton"
                  aria-hidden="true"
                  className="space-y-2"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : groupedTemuan.length === 0 && !errorMsg ? (
                <QaStatePanel
                  type="empty"
                  title="Belum ada temuan"
                  description={`Belum ada data temuan untuk ${selectedAgent?.nama ?? "agen ini"} pada ${selectedPeriod ? periodLabel(selectedPeriod) : "periode"} dan layanan ${selectedService ? SERVICE_LABELS[selectedService] : ""}.`}
                  action={
                    role !== "leader" ? (
                      <Button
                        type="button"
                        className="h-[44px] px-4"
                        onClick={() => formHook.setShowForm(true)}
                      >
                        <Plus aria-hidden="true" />
                        Tambah Temuan
                      </Button>
                    ) : undefined
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
                  editTanggalLayanan={editHook.editTanggalLayanan}
                  editTanggalSampel={editHook.editTanggalSampel}
                  deletingId={editHook.deletingId}
                  canEdit={role !== "leader"}
                  onStartEdit={editHook.startEdit}
                  onCancelEdit={editHook.cancelEdit}
                  onSaveEdit={editHook.handleSaveEdit}
                  onDelete={editHook.handleDelete}
                  setEditNilai={editHook.setEditNilai}
                  setEditKetidaksesuaian={editHook.setEditKetidaksesuaian}
                  setEditSebaiknya={editHook.setEditSebaiknya}
                  setEditTanggalLayanan={editHook.setEditTanggalLayanan}
                  setEditTanggalSampel={editHook.setEditTanggalSampel}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
