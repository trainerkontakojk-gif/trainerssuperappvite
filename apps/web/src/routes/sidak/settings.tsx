import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { QARuleIndicator, RuleVersion, ServiceType } from "@trainers/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { periodLabel } from "../../components/sidak/sidak-input.constants";
import { SERVICE_LABELS } from "./settings/constants";
import { CategoryWeightsSection } from "./settings/components/CategoryWeightsSection";
import { ConfirmDialog } from "../../components/sidak/ConfirmDialog";
import { IndicatorFormDialog } from "./settings/components/IndicatorFormDialog";
import { PublishRuleDialog } from "./settings/components/PublishRuleDialog";
import { RuleIndicatorsSection } from "./settings/components/RuleIndicatorsSection";
import { RuleVersionHeader } from "./settings/components/RuleVersionHeader";
import {
  RuleVersionList,
  RuleVersionSelect,
} from "./settings/components/RuleVersionList";
import { ServiceTabs } from "./settings/components/ServiceTabs";
import type { IndicatorFormState } from "./settings/types";
import {
  createEmptyIndicatorForm,
  findEffectiveBaseline,
  indicatorFormToPayload,
  indicatorToFormState,
  pickDefaultVersion,
} from "./settings/utils";

interface RuleVersionMeta {
  service_type: string;
  indicator_count: number;
  has_weight: boolean;
  draft_count: number;
  published_count: number;
}

interface Period {
  id: string;
  month: number;
  year: number;
}

type FormTarget =
  | { mode: "add" }
  | { mode: "edit"; indicator: QARuleIndicator };

export default function SidakSettingsPage() {
  const [activeTeam, setActiveTeam] = useState<ServiceType>("call");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meta, setMeta] = useState<RuleVersionMeta | null>(null);

  const {
    data: versionRows,
    loading: versionsLoading,
    error: versionsError,
    refetch: refetchVersions,
  } = useApi<RuleVersion[]>(`/sidak/rule-versions?service_type=${activeTeam}`);
  const { data: periodRows } = useApi<Period[]>("/sidak/periods");
  const periods = useMemo(() => periodRows ?? [], [periodRows]);

  // `useApi` mempertahankan data lama saat path berganti; saring per layanan aktif.
  const versions = useMemo(
    () => (versionRows ?? []).filter((v) => v.service_type === activeTeam),
    [versionRows, activeTeam],
  );
  const initialLoading = versionsLoading && versions.length === 0;

  // Seleksi diturunkan dari daftar terbaru berdasarkan id, bukan disimpan sebagai objek.
  const selectedVersion = useMemo(
    () =>
      versions.find((v) => v.id === selectedId) ?? pickDefaultVersion(versions),
    [versions, selectedId],
  );
  const isDraft = selectedVersion?.status === "draft";

  const getPeriodLabel = useCallback(
    (periodId: string) => {
      const period = periods.find((p) => p.id === periodId);
      return period ? periodLabel(period) : "-";
    },
    [periods],
  );

  // Meta (jumlah parameter baseline) hanya relevan saat layanan belum punya versi.
  useEffect(() => {
    setMeta(null);
    if (versionsLoading || versionsError || versions.length > 0) return;
    let cancelled = false;
    sidakClient["rule-versions"].meta
      .$get({ query: { service_type: activeTeam } })
      .then((res: Response) => unwrapResponse(res))
      .then((result: unknown) => {
        if (!cancelled) setMeta(result as RuleVersionMeta);
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam, versionsLoading, versionsError, versions.length]);

  // ── Parameter versi terpilih ──
  const [indicators, setIndicators] = useState<QARuleIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const indicatorsRequest = useRef(0);
  const indicatorsVersionId = useRef<string | null>(null);

  const loadIndicators = useCallback(async (versionId: string) => {
    const request = ++indicatorsRequest.current;
    if (indicatorsVersionId.current !== versionId) {
      indicatorsVersionId.current = versionId;
      setIndicators([]);
      setLoadingIndicators(true);
    }
    try {
      const rows = await unwrapResponse(
        await sidakClient["rule-versions"][":id"].indicators.$get({
          param: { id: versionId },
        }),
      );
      if (request === indicatorsRequest.current)
        setIndicators((rows as QARuleIndicator[]) ?? []);
    } catch {
      if (request === indicatorsRequest.current) setIndicators([]);
    } finally {
      if (request === indicatorsRequest.current) setLoadingIndicators(false);
    }
  }, []);

  const selectedVersionId = selectedVersion?.id ?? null;
  useEffect(() => {
    if (selectedVersionId) void loadIndicators(selectedVersionId);
    else {
      indicatorsVersionId.current = null;
      setIndicators([]);
    }
  }, [selectedVersionId, loadIndicators]);

  const changeTeam = (team: ServiceType) => {
    setActiveTeam(team);
    setSelectedId(null);
  };

  // ── Draft / revisi ──
  const [busy, setBusy] = useState(false);

  const handleCreateDraft = async (sourceId?: string) => {
    setBusy(true);
    try {
      const draft = (await unwrapResponse(
        await sidakClient["rule-versions"].$post({
          json: { service_type: activeTeam, source_version_id: sourceId },
        }),
      )) as RuleVersion;
      notify.success(
        sourceId ? "Draft revisi berhasil dibuat." : "Draft baru berhasil dibuat.",
      );
      await refetchVersions();
      setSelectedId(draft.id);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Gagal membuat draft");
    } finally {
      setBusy(false);
    }
  };

  const [confirmDraftDelete, setConfirmDraftDelete] = useState(false);
  const handleDeleteDraft = async () => {
    if (!selectedVersion) return;
    setBusy(true);
    try {
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].$delete({
          param: { id: selectedVersion.id },
        }),
      );
      notify.success("Draft berhasil dihapus.");
      setConfirmDraftDelete(false);
      setSelectedId(null);
      await refetchVersions();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Gagal menghapus draft");
    } finally {
      setBusy(false);
    }
  };

  // ── Bobot kategori (dipanggil sekali per commit oleh useCategoryWeightDraft) ──
  const saveWeight = useCallback(
    async (versionId: string, nonCriticalPercent: number) => {
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].$put({
          param: { id: versionId },
          json: {
            non_critical_weight: nonCriticalPercent / 100,
            critical_weight: (100 - nonCriticalPercent) / 100,
          },
        }),
      );
      await refetchVersions();
    },
    [refetchVersions],
  );

  // ── Publish ──
  const [publishOpen, setPublishOpen] = useState(false);
  // Snapshot draft saat dialog dibuka: dialog tetap terpasang selama animasi
  // tutup walau daftar versi sudah diperbarui (draft menjadi Berlaku).
  const [publishVersion, setPublishVersion] = useState<RuleVersion | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishPeriodId, setPublishPeriodId] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  // Selama dialog terbuka, pakai baris terbaru (mis. bobot yang baru tersimpan
  // saat blur sebelum Publish diklik); snapshot hanya cadangan saat animasi tutup.
  const dialogVersion = publishVersion
    ? (versions.find((v) => v.id === publishVersion.id && v.status === "draft") ??
      publishVersion)
    : null;

  const openPublish = () => {
    if (!selectedVersion) return;
    setPublishVersion(selectedVersion);
    setPublishPeriodId(selectedVersion.effective_period_id || "");
    setChangeReason("");
    setPublishConfirmed(false);
    setPublishOpen(true);
  };

  const getPreviewVersionNumber = () => {
    if (!dialogVersion || !publishPeriodId) return 0;
    if (dialogVersion.effective_period_id === publishPeriodId) {
      return dialogVersion.version_number;
    }
    const inTarget = versions.filter(
      (v) => v.effective_period_id === publishPeriodId,
    );
    if (inTarget.length === 0) return 1;
    return Math.max(...inTarget.map((v) => v.version_number)) + 1;
  };

  const baseline = useMemo(
    () =>
      publishOpen && publishPeriodId
        ? findEffectiveBaseline(versions, periods, publishPeriodId)
        : null,
    [publishOpen, publishPeriodId, versions, periods],
  );

  const handlePublish = async () => {
    if (!publishVersion || !publishPeriodId) return;
    setPublishing(true);
    try {
      await unwrapResponse(
        await sidakClient["rule-versions"][":id"].publish.$post({
          param: { id: publishVersion.id },
          json: {
            change_reason: changeReason.trim() || undefined,
            effective_period_id: publishPeriodId,
          },
        }),
      );
      notify.success("Versi aturan berhasil dipublish.");
      setPublishOpen(false);
      await refetchVersions();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Gagal mempublish versi");
    } finally {
      setPublishing(false);
    }
  };

  // ── Parameter: tambah / edit / hapus ──
  const [formTarget, setFormTarget] = useState<FormTarget>({ mode: "add" });
  const [formOpen, setFormOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QARuleIndicator | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSubmitIndicator = async (form: IndicatorFormState) => {
    if (!selectedVersion) return;
    setSavingForm(true);
    try {
      const payload = indicatorFormToPayload(form, selectedVersion.scoring_mode);
      if (formTarget.mode === "add") {
        await unwrapResponse(
          await sidakClient["rule-versions"][":id"].indicators.$post({
            param: { id: selectedVersion.id },
            json: { service_type: activeTeam, ...payload },
          }),
        );
        notify.success("Parameter berhasil ditambahkan ke draft.");
      } else {
        await unwrapResponse(
          await sidakClient["rule-versions"][":versionId"].indicators[
            ":indicatorId"
          ].$put({
            param: {
              versionId: selectedVersion.id,
              indicatorId: formTarget.indicator.id,
            },
            json: payload,
          }),
        );
        notify.success("Parameter berhasil diperbarui.");
      }
      setFormOpen(false);
      void loadIndicators(selectedVersion.id);
      void refetchVersions();
    } catch (e) {
      notify.error(
        e instanceof Error
          ? e.message
          : formTarget.mode === "add"
            ? "Gagal menambahkan parameter"
            : "Gagal memperbarui parameter",
      );
    } finally {
      setSavingForm(false);
    }
  };

  const handleDeleteIndicator = async () => {
    if (!selectedVersion || !deleteTarget) return;
    setDeleting(true);
    try {
      await unwrapResponse(
        await sidakClient["rule-versions"][":versionId"].indicators[
          ":indicatorId"
        ].$delete({
          param: {
            versionId: selectedVersion.id,
            indicatorId: deleteTarget.id,
          },
        }),
      );
      notify.success("Parameter dihapus dari draft.");
      setDeleteTarget(null);
      void loadIndicators(selectedVersion.id);
      void refetchVersions();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Gagal menghapus parameter");
    } finally {
      setDeleting(false);
    }
  };

  const publishedForRevision =
    isDraft && indicators.length === 0
      ? (versions.find((v) => v.status === "published") ?? null)
      : null;

  const hasList = versions.length > 0 || initialLoading;

  const renderDetail = () => {
    if (versionsError && versions.length === 0) {
      return (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Gagal memuat versi aturan: {versionsError}</span>
            <Button
              type="button"
              variant="outline"
              className="h-[44px] px-4"
              onClick={() => void refetchVersions()}
            >
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    if (initialLoading) {
      return (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-[56px] w-2/3" />
          <Skeleton className="h-[88px] w-full" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[48px] w-full" />
          ))}
        </div>
      );
    }
    if (!selectedVersion) {
      const hasBaseline = (meta?.indicator_count ?? 0) > 0;
      return (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-6">
          <h2 className="text-base font-semibold text-foreground">
            Belum ada versi untuk {SERVICE_LABELS[activeTeam]}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {hasBaseline
              ? `Baseline tersedia: ${meta?.indicator_count} parameter. Buat baseline untuk menampilkan detail versi.`
              : "Belum ada parameter baseline untuk layanan ini. Buat draft baru untuk mulai menyusun parameter."}
          </p>
          <Button
            type="button"
            className="h-[44px] px-4"
            disabled={busy}
            onClick={() => void handleCreateDraft()}
          >
            <Plus aria-hidden="true" />
            {hasBaseline ? "Buat baseline" : "Buat draft baru"}
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-8">
        <RuleVersionHeader
          version={selectedVersion}
          periodLabel={getPeriodLabel(selectedVersion.effective_period_id)}
          busy={busy}
          onPublish={openPublish}
          onDeleteDraft={() => setConfirmDraftDelete(true)}
          onCreateRevision={() => void handleCreateDraft(selectedVersion.id)}
        />
        <CategoryWeightsSection
          version={selectedVersion}
          isDraft={isDraft}
          save={saveWeight}
        />
        <RuleIndicatorsSection
          version={selectedVersion}
          indicators={indicators}
          loading={loadingIndicators}
          isDraft={isDraft}
          publishedForRevision={publishedForRevision}
          onAdd={() => {
            setFormTarget({ mode: "add" });
            setFormOpen(true);
          }}
          onEdit={(indicator) => {
            setFormTarget({ mode: "edit", indicator });
            setFormOpen(true);
          }}
          onDelete={setDeleteTarget}
          onCreateRevision={(sourceId) => void handleCreateDraft(sourceId)}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-6 md:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="space-y-1">
            <h1 className="font-outfit text-2xl font-bold tracking-tight text-foreground">
              Parameter QA
            </h1>
            <p className="text-sm text-muted-foreground">
              Kelola versi aturan penilaian per layanan: bobot, parameter, dan
              periode berlakunya.
            </p>
          </header>

          <ServiceTabs value={activeTeam} onChange={changeTeam} />

          <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            {hasList ? (
              <>
                <RuleVersionList
                  versions={versions}
                  loading={initialLoading}
                  selectedId={selectedVersion?.id ?? null}
                  onSelect={setSelectedId}
                  getPeriodLabel={getPeriodLabel}
                />
                {versions.length > 0 && (
                  <RuleVersionSelect
                    versions={versions}
                    selectedId={selectedVersion?.id ?? null}
                    onSelect={setSelectedId}
                    getPeriodLabel={getPeriodLabel}
                  />
                )}
              </>
            ) : null}
            <div
              className={`min-w-0 ${hasList ? "lg:col-start-2 lg:row-start-1" : "lg:col-span-2"}`}
            >
              {renderDetail()}
            </div>
          </div>
        </div>
      </div>

      <IndicatorFormDialog
        open={formOpen && Boolean(selectedVersion)}
        mode={formTarget.mode}
        initialForm={
          formTarget.mode === "edit"
            ? indicatorToFormState(formTarget.indicator)
            : createEmptyIndicatorForm()
        }
        scoringMode={selectedVersion?.scoring_mode ?? "weighted"}
        serviceType={activeTeam}
        saving={savingForm}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmitIndicator}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus parameter?"
        description={`Parameter "${deleteTarget?.name ?? ""}" akan dihapus dari draft ini. Versi yang sudah berlaku tidak berubah.`}
        confirmLabel="Hapus"
        busy={deleting}
        onConfirm={() => void handleDeleteIndicator()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirmDraftDelete && isDraft}
        title="Hapus draft?"
        description={
          selectedVersion
            ? `Draft v${selectedVersion.version_number} untuk ${SERVICE_LABELS[activeTeam]} (efektif ${getPeriodLabel(selectedVersion.effective_period_id)}) akan dihapus. Versi yang sudah berlaku tidak berubah.`
            : ""
        }
        confirmLabel="Hapus draft"
        busy={busy}
        onConfirm={() => void handleDeleteDraft()}
        onCancel={() => setConfirmDraftDelete(false)}
      />

      {dialogVersion && (
        <PublishRuleDialog
          open={publishOpen}
          version={dialogVersion}
          baseline={baseline}
          periods={periods}
          draftIndicators={indicators}
          periodId={publishPeriodId}
          onPeriodChange={setPublishPeriodId}
          reason={changeReason}
          onReasonChange={setChangeReason}
          confirmed={publishConfirmed}
          onConfirmedChange={setPublishConfirmed}
          publishing={publishing}
          previewVersionNumber={getPreviewVersionNumber()}
          onPublish={() => void handlePublish()}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}
