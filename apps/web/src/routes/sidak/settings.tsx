import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Plus,
  Trash2,
  History,
  Rocket,
  GitBranch,
} from "lucide-react";
import { notify } from "../../lib/toast";
import type {
  ServiceType,
  RuleVersion,
  QARuleIndicator,
} from "@trainers/types";
import { formatPeriodLabel, SERVICE_LABELS } from "./settings/constants";
import { RuleVersionPicker } from "./settings/components/RuleVersionPicker";
import { ServiceWeightsPanel } from "./settings/components/ServiceWeightsPanel";
import { RuleIndicatorsPanel } from "./settings/components/RuleIndicatorsPanel";
import { PublishRulePanel } from "./settings/components/PublishRulePanel";

import type { IndicatorFormState } from "./settings/types";
import { indicatorFormToPayload, indicatorToFormState } from "./settings/utils";
import { AddIndicatorModal } from "./settings/components/AddIndicatorModal";
import { EditIndicatorModal } from "./settings/components/EditIndicatorModal";
import { PublishPreviewModal } from "./settings/components/PublishPreviewModal";

interface RuleVersionMeta {
  service_type: string;
  indicator_count: number;
  has_weight: boolean;
  draft_count: number;
  published_count: number;
}

export default function SidakSettingsPage() {
  const [activeTeam, setActiveTeam] = useState<ServiceType>("call");
  const [selectedVersion, setSelectedVersion] = useState<RuleVersion | null>(
    null,
  );
  const [draftIndicators, setDraftIndicators] = useState<QARuleIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [meta, setMeta] = useState<RuleVersionMeta | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [publishPeriodId, setPublishPeriodId] = useState<string>("");
  const [previewVersion, setPreviewVersion] = useState<RuleVersion | null>(
    null,
  );
  const [publishConfirmed, setPublishConfirmed] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const [editIndId, setEditIndId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<IndicatorFormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const {
    data: versions,
    loading: versionsLoading,
    refetch: refetchVersions,
  } = useApi<RuleVersion[]>(`/sidak/rule-versions?service_type=${activeTeam}`);
  const { data: periods } =
    useApi<{ id: string; month: number; year: number }[]>("/sidak/periods");

  // Selection logic: Draft first, then published, then latest version
  useEffect(() => {
    if (versions && (versions as RuleVersion[]).length > 0) {
      setMeta(null);
      const stillExists = selectedVersion
        ? versions.find((v) => v.id === selectedVersion.id)
        : null;
      if (stillExists) {
        setSelectedVersion(stillExists);
      } else {
        const draft = versions.find((v) => v.status === "draft");
        const published = versions.find((v) => v.status === "published");
        const latest = [...versions].sort(
          (a, b) => b.version_number - a.version_number,
        )[0];
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
      sidakClient["rule-versions"].meta
        .$get({ query: { service_type: activeTeam } })
        .then((res: Response) => unwrapResponse(res))
        .then((result: any) => {
          if (!cancelled) setMeta(result as RuleVersionMeta);
        })
        .catch(() => {
          if (!cancelled) setMeta(null);
        });
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam, versionsLoading, versions?.length]);

  const fetchVersionIndicators = useCallback(async (versionId: string) => {
    setLoadingIndicators(true);
    try {
      const res = await unwrapResponse(
        await sidakClient["rule-versions"][":id"].indicators.$get({
          param: { id: versionId },
        }),
      );
      setDraftIndicators((res as QARuleIndicator[]) ?? []);
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
    const versionsInTarget =
      versions?.filter((v) => v.effective_period_id === publishPeriodId) || [];
    if (versionsInTarget.length === 0) return 1;
    return Math.max(...versionsInTarget.map((v) => v.version_number)) + 1;
  };

  const handleCreateDraft = async (sourceId?: string) => {
    try {
      const draft = await unwrapResponse(
        await sidakClient["rule-versions"].$post({
          json: {
            service_type: activeTeam,
            source_version_id: sourceId,
          },
        }),
      );
      notify.success(
        sourceId
          ? "Draft revisi berhasil dibuat!"
          : "Draft baru berhasil dibuat!",
      );
      refetchVersions();
      setSelectedVersion(draft as RuleVersion);
    } catch (e: any) {
      notify.error(e.message || "Gagal membuat draft");
    }
  };

  const handleDeleteDraft = async (id: string) => {
    const v = versions?.find((x) => x.id === id);
    const periodLabel = v ? getPeriodLabel(v.effective_period_id) : "";
    const svcLabel = SERVICE_LABELS[activeTeam] || activeTeam;
    const msg = v
      ? `Hapus draft v${v.version_number} untuk ${svcLabel} efektif ${periodLabel}? Versi published tidak akan berubah.`
      : "Hapus draft ini?";
    if (!confirm(msg)) return;
    try {
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].$delete({ param: { id } }),
      );
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
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].publish.$post({
          param: { id: selectedVersion.id },
          json: {
            change_reason: changeReason || undefined,
            effective_period_id: publishPeriodId,
          },
        }),
      );
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

  const handleAddIndicator = async (form: IndicatorFormState) => {
    if (!selectedVersion) return;
    setSavingNew(true);
    try {
      const payload = indicatorFormToPayload(
        form,
        selectedVersion.scoring_mode,
      );
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].indicators.$post({
          param: { id: selectedVersion.id },
          json: {
            service_type: activeTeam,
            ...payload,
          },
        }),
      );
      notify.success("Parameter berhasil ditambahkan ke draft.");
      setShowAddForm(false);
      fetchVersionIndicators(selectedVersion.id);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal menambahkan parameter");
    } finally {
      setSavingNew(false);
    }
  };

  const handleSaveEditIndicator = async (form: IndicatorFormState) => {
    if (!selectedVersion || !editIndId) return;
    setSavingEdit(true);
    try {
      const payload = indicatorFormToPayload(
        form,
        selectedVersion.scoring_mode,
      );
      await unwrapResponse(
        await sidakClient["rule-versions"][":versionId"].indicators[
          ":indicatorId"
        ].$put({
          param: { versionId: selectedVersion.id, indicatorId: editIndId },
          json: payload,
        }),
      );
      notify.success("Parameter berhasil diperbarui.");
      setEditIndId(null);
      setEditForm(null);
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
      await unwrapResponse(
        await sidakClient["rule-versions"][":versionId"].indicators[
          ":indicatorId"
        ].$delete({
          param: { versionId: selectedVersion.id, indicatorId: id },
        }),
      );
      notify.success("Parameter dihapus dari draft.");
      fetchVersionIndicators(selectedVersion.id);
      refetchVersions();
    } catch (e: any) {
      notify.error(e.message || "Gagal menghapus parameter");
    }
  };

  const isDraft = selectedVersion?.status === "draft";

  const publishedWhenDraftEmpty =
    isDraft && draftIndicators.length === 0
      ? versions?.find((v) => v.status === "published")
      : null;

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header Sticky */}
      <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground">
              <History className="w-4 h-4" />
            </div>
            <h1 className="font-outfit text-lg font-bold text-foreground">
              Versioning Parameter QA
            </h1>
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
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
              >
                <Rocket className="w-3.5 h-3.5" />
                Publish
              </button>
              <button
                onClick={() => handleDeleteDraft(selectedVersion.id)}
                className="flex items-center gap-2 px-4 py-2 bg-destructive hover:bg-destructive/90 text-white rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Draft
              </button>
            </>
          )}
          {selectedVersion?.status === "published" && (
            <button
              onClick={() => handleCreateDraft(selectedVersion.id)}
              className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Create Revision
            </button>
          )}
          {!selectedVersion &&
            !versionsLoading &&
            (!versions || !versions.some((v) => v.status === "draft")) && (
              <button
                onClick={() => handleCreateDraft()}
                className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
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
        <section className="flex-1 overflow-y-auto p-4 lg:p-8">
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
                  selectedVersion={selectedVersion}
                  isDraft={isDraft}
                  handleCreateDraft={handleCreateDraft}
                  handleDeleteIndicator={handleDeleteIndicator}
                  onEditIndicator={(indicator) => {
                    setEditIndId(indicator.id);
                    setEditForm(indicatorToFormState(indicator));
                  }}
                />
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center py-20">
                <div className="text-center p-8 border border-border bg-surface rounded-2xl max-w-sm mx-auto">
                  <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="font-outfit text-sm font-bold text-foreground">
                    Pilih atau buat versi rules untuk melihat detail
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gunakan panel di sebelah kiri untuk melihat riwayat versi
                    parameter QA.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <AnimatePresence>
        {showAddForm && selectedVersion && (
          <AddIndicatorModal
            scoringMode={selectedVersion.scoring_mode}
            serviceType={activeTeam}
            saving={savingNew}
            onClose={() => setShowAddForm(false)}
            onSubmit={handleAddIndicator}
          />
        )}
        {editIndId && editForm && selectedVersion && (
          <EditIndicatorModal
            initialForm={editForm}
            scoringMode={selectedVersion.scoring_mode}
            serviceType={activeTeam}
            saving={savingEdit}
            onClose={() => {
              setEditIndId(null);
              setEditForm(null);
            }}
            onSubmit={handleSaveEditIndicator}
          />
        )}
        {previewVersion && (
          <PublishPreviewModal
            previewVersion={previewVersion}
            periods={periods ?? undefined}
            draftIndicators={draftIndicators}
            publishPeriodId={publishPeriodId}
            setPublishPeriodId={setPublishPeriodId}
            changeReason={changeReason}
            setChangeReason={setChangeReason}
            publishConfirmed={publishConfirmed}
            setPublishConfirmed={setPublishConfirmed}
            isPublishing={isPublishing}
            getPreviewVersionNumber={getPreviewVersionNumber}
            onPublish={handlePublish}
            onClose={() => setPreviewVersion(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
