import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAgentDetail,
  type AgentDetailScope,
} from "../../hooks/useAgentDetail";
import { useSidakScope } from "../../hooks/useSidakScope";
import { useAgentQuickview } from "../../hooks/useAgentQuickview";
import AgentAuditDossier from "../../components/sidak/AgentAuditDossier";
import AgentCoachingBrief from "../../components/sidak/AgentCoachingBrief";
import AgentPerformanceQuickview from "../../components/sidak/AgentPerformanceQuickview";
import AgentProfileSidebar from "../../components/sidak/AgentProfileSidebar";
import AgentSwitcher from "../../components/sidak/AgentSwitcher";
import AgentTemuanTab, {
  type TemuanFocusRequest,
} from "../../components/sidak/AgentTemuanTab";
import AgentTrendTab from "../../components/sidak/AgentTrendTab";
import ContextControlBar from "../../components/sidak/ContextControlBar";
import EditTemuanModal from "../../components/sidak/EditTemuanModal";
import MonthRail from "../../components/sidak/MonthRail";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import SidakAgentDetailTabs from "../../components/sidak/SidakAgentDetailTabs";
import SidakAgentHeatmapPanel from "../../components/sidak/SidakAgentHeatmapPanel";
import type { SidakAgentDetailTab } from "../../components/sidak/sidak-agent-detail-tabs.constants";
import SidakSimulationHistory from "../../components/sidak/SidakSimulationHistory";
import {
  EMPTY_TEMUAN_FILTER,
  filterTemuan,
  isTemuanFilterActive,
  temuanMonthOptions,
  type TemuanFilter,
} from "../../utils/sidakTemuanFilter";
import {
  SIDAK_QA_TARGET,
  SIDAK_SCORE_TEXT,
  describeScoreChange,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";
import { SERVICE_LABELS } from "../../lib/scoring";
import {
  VALID_SERVICE_TYPES,
  type ServiceType,
  type SidakHeatmapTicketRef,
} from "@trainers/types";

function isServiceType(value: string): value is ServiceType {
  return (VALID_SERVICE_TYPES as readonly string[]).includes(value);
}

export default function SidakAgentDetailPage() {
  const { id } = useParams({ from: "/sidak/agents/$id" });
  // Tahun, layanan, dan rentang tren mengikuti cakupan bersama SIDAK, dan
  // perubahan di sini ikut menulisnya kembali.
  const { explicit: explicitScope, setScope } = useSidakScope();
  const [initialScope] = useState(() => ({
    year: explicitScope.tahun,
    service: explicitScope.layanan,
    startMonth: explicitScope.dari,
    endMonth: explicitScope.sampai,
  }));
  const handleScopeChange = useCallback(
    (patch: AgentDetailScope) =>
      setScope({
        ...(patch.year !== undefined ? { tahun: patch.year } : {}),
        ...(patch.service && isServiceType(patch.service)
          ? { layanan: patch.service }
          : {}),
        ...(patch.startMonth !== undefined ? { dari: patch.startMonth } : {}),
        ...(patch.endMonth !== undefined ? { sampai: patch.endMonth } : {}),
      }),
    [setScope],
  );
  const {
    data,
    loading,
    refetch,
    role,
    selectedYear,
    selectedService,
    selectedMonth,
    trendStartMonth,
    trendEndMonth,
    monthlySummaries,
    latestPeriod,
    previousPeriod,
    temuanDisplayItems,
    phantomSessionDisplayItems,
    topTickets,
    activeRootCauses,
    availableServiceTypes,
    monthsFull,
    editingTemuan,
    editForm,
    isSubmitting,
    deletingId,
    setEditForm,
    setEditingTemuan,
    handleYearChange,
    handleServiceChange,
    handleMonthSelect,
    handleTrendRangeChange,
    handleExport,
    handleInputAudit,
    handleEdit,
    handleEditSave,
    handleDelete,
    handleAgentChange,
  } = useAgentDetail(id, initialScope, handleScopeChange);
  const {
    data: quickviewData,
    loading: quickviewLoading,
    error: quickviewError,
    refetch: refetchQuickview,
  } = useAgentQuickview(id, selectedYear, selectedService);
  // Tab aktif disimpan di alamat (`?tab=`) supaya bisa dibagikan dan bertahan
  // saat dimuat ulang.
  const search = useSearch({ from: "/sidak/agents/$id" });
  const navigate = useNavigate({ from: "/sidak/agents/$id" });
  const urlTab: SidakAgentDetailTab = search.tab ?? "summary";
  // Tab berganti seketika di state lokal (fokus ke tiket butuh panelnya sudah
  // tampil); alamat menyusul lewat navigate. Back/forward ikut lewat urlTab.
  const [activeTab, setActiveTab] = useState<SidakAgentDetailTab>(urlTab);
  const [mountedTabs, setMountedTabs] = useState<Set<SidakAgentDetailTab>>(
    () => new Set<SidakAgentDetailTab>(["summary", urlTab]),
  );
  const [syncedUrlTab, setSyncedUrlTab] = useState(urlTab);
  if (urlTab !== syncedUrlTab) {
    setSyncedUrlTab(urlTab);
    setActiveTab(urlTab);
    if (!mountedTabs.has(urlTab)) {
      setMountedTabs(new Set(mountedTabs).add(urlTab));
    }
  }

  const handleTabChange = useCallback(
    (tab: SidakAgentDetailTab) => {
      setActiveTab(tab);
      void navigate({
        search: (prev) => ({
          ...prev,
          tab: tab === "summary" ? undefined : tab,
        }),
        replace: true,
      });
      setMountedTabs((current) => {
        if (current.has(tab)) return current;
        return new Set(current).add(tab);
      });
    },
    [navigate],
  );

  const [temuanFocus, setTemuanFocus] = useState<TemuanFocusRequest | null>(
    null,
  );
  const [temuanFilter, setTemuanFilter] =
    useState<TemuanFilter>(EMPTY_TEMUAN_FILTER);
  const temuanMonths = useMemo(
    () => temuanMonthOptions(temuanDisplayItems),
    [temuanDisplayItems],
  );
  // Bulan yang tidak ada lagi (tahun/layanan berganti) dianggap Semua bulan.
  const effectiveTemuanFilter = useMemo<TemuanFilter>(
    () =>
      temuanFilter.month !== null && !temuanMonths.includes(temuanFilter.month)
        ? { ...temuanFilter, month: null }
        : temuanFilter,
    [temuanFilter, temuanMonths],
  );
  const filteredTemuan = useMemo(
    () =>
      filterTemuan(
        temuanDisplayItems,
        phantomSessionDisplayItems,
        effectiveTemuanFilter,
      ),
    [temuanDisplayItems, phantomSessionDisplayItems, effectiveTemuanFilter],
  );
  const handleTicketSelect = useCallback(
    (ticketKey: string) => {
      if (!selectedMonth) return;
      setTemuanFilter(EMPTY_TEMUAN_FILTER);
      setTemuanFocus((current) => ({
        month: selectedMonth,
        year: selectedYear,
        ticketKey,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      handleTabChange("temuan");
    },
    [selectedMonth, selectedYear, handleTabChange],
  );

  // Tanggal di tab Heatmap membuka tiketnya di tab Temuan (bulan periode QA).
  const handleHeatmapTicket = useCallback(
    (ticket: SidakHeatmapTicketRef) => {
      setTemuanFilter(EMPTY_TEMUAN_FILTER);
      setTemuanFocus((current) => ({
        month: ticket.month,
        year: ticket.year,
        ticketKey: ticket.noTiket,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      handleTabChange("temuan");
    },
    [handleTabChange],
  );

  const handleRefresh = useCallback(() => {
    void refetch();
    void refetchQuickview();
  }, [refetch, refetchQuickview]);

  if (loading && !data) {
    return (
      <div
        className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
        role="status"
        aria-label="Memuat profil agen"
      >
        <Skeleton className="size-11 rounded-xl motion-reduce:animate-none" />
        <Skeleton className="h-28 rounded-xl motion-reduce:animate-none" />
        <Skeleton className="h-20 rounded-xl motion-reduce:animate-none" />
        <Skeleton className="h-12 rounded-xl motion-reduce:animate-none" />
        <Skeleton className="min-h-[24rem] rounded-xl motion-reduce:animate-none" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-full max-w-7xl items-center justify-center px-4 py-16 text-center sm:px-6 lg:px-8">
        <Empty className="max-w-lg border-0">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="size-14 rounded-xl bg-muted text-muted-foreground"
            >
              <AlertTriangle className="size-7" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="font-outfit text-xl font-bold">
              Agen tidak ditemukan
            </EmptyTitle>
            <EmptyDescription>
              Agen ini mungkin sudah dihapus, atau Anda tidak punya akses ke
              profilnya.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            render={<Link to="/sidak/agents" />}
            nativeButton={false}
            variant="outline"
            size="lg"
            className="min-h-11"
          >
            <ArrowLeft
              data-icon="inline-start"
              className="size-4"
              aria-hidden="true"
            />
            Kembali ke daftar agen
          </Button>
        </Empty>
      </div>
    );
  }

  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const activeLabel =
    latestPeriod && selectedMonth
      ? (monthsFull[selectedMonth - 1]?.slice(0, 3) ?? "") + " " + selectedYear
      : undefined;
  const rootCauseScopeLabel =
    latestPeriod && selectedMonth
      ? selectedMonth === 1
        ? activeLabel
        : "Jan–" +
          (monthsFull[selectedMonth - 1]?.slice(0, 3) ?? "") +
          " " +
          selectedYear
      : undefined;
  const activeTitle =
    latestPeriod && selectedMonth
      ? (monthsFull[selectedMonth - 1] ?? "") + " " + selectedYear
      : undefined;
  const latestSummary = monthlySummaries[monthlySummaries.length - 1] ?? null;
  const priorSummary = monthlySummaries[monthlySummaries.length - 2] ?? null;
  const latestDelta =
    latestSummary && priorSummary
      ? latestSummary.finalScore - priorSummary.finalScore
      : null;
  const serviceLabel = selectedService
    ? (SERVICE_LABELS[selectedService as ServiceType] ?? selectedService)
    : "—";
  const quickviewScopeLabel = "tahun " + selectedYear + " · " + serviceLabel;

  return (
    <div className="min-w-0 overflow-x-clip pb-16">
      <div className="mx-auto grid min-w-0 max-w-7xl items-start gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10 lg:px-8">
        <AgentProfileSidebar
          backAction={
            <Button
              render={<Link to="/sidak/agents" />}
              nativeButton={false}
              variant="outline"
              size="icon-lg"
              aria-label="Kembali ke daftar agen"
              title="Kembali ke daftar agen"
              className="size-10 shrink-0 text-muted-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          }
          nama={data.peserta.nama}
          tim={data.peserta.tim}
          batchName={data.peserta.batch_name}
          jabatan={data.peserta.jabatan}
          bergabungDate={data.peserta.bergabung_date}
          fotoUrl={data.peserta.foto_url}
          role={role}
          onRefresh={handleRefresh}
          refreshing={loading}
          onExport={(format) =>
            handleExport(format, {
              selectedMonth,
              trendStartMonth,
              trendEndMonth,
              quickview: quickviewData,
              isStaff,
            })
          }
          onInputAudit={handleInputAudit}
          switcher={
            <AgentSwitcher
              currentAgentId={id}
              year={selectedYear}
              onAgentChange={handleAgentChange}
            />
          }
          latestScore={
            latestSummary ? (
              <section aria-label="Skor terbaru" className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 text-sm font-normal text-fg2">
                    Skor {monthsFull[latestSummary.month - 1]}{" "}
                    {latestSummary.year}
                  </h2>
                  <span
                    className={`font-semibold tabular-nums ${SIDAK_SCORE_TEXT[sidakScoreTone(latestSummary.finalScore)]}`}
                  >
                    {latestSummary.finalScore.toFixed(1)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  <span
                    className={`font-medium ${SIDAK_SCORE_TEXT[sidakScoreTone(latestSummary.finalScore)]}`}
                  >
                    {sidakScoreLabel(latestSummary.finalScore)}
                  </span>
                  {" · "}
                  {latestDelta !== null && priorSummary
                    ? describeScoreChange(
                        latestDelta,
                        monthsFull[priorSummary.month - 1] ??
                          "bulan sebelumnya",
                      )
                    : "Belum ada bulan pembanding"}
                  {" · "}Target QA {SIDAK_QA_TARGET}%
                </p>
              </section>
            ) : null
          }
          quickview={
            <AgentPerformanceQuickview
              data={quickviewData}
              loading={quickviewLoading}
              error={quickviewError}
              scopeLabel={quickviewScopeLabel}
            />
          }
        />

        <SidakAgentDetailTabs
          activeTab={activeTab}
          mountedTabs={mountedTabs}
          onTabChange={handleTabChange}
          counts={loading ? undefined : { temuan: temuanDisplayItems.length }}
          toolbar={
            <ContextControlBar
              activeTab={activeTab}
              selectedYear={selectedYear}
              availableYears={data.availableYears}
              onYearChange={handleYearChange}
              selectedService={selectedService}
              availableServices={availableServiceTypes}
              onServiceChange={handleServiceChange}
              trendStartMonth={trendStartMonth}
              trendEndMonth={trendEndMonth}
              onTrendRangeChange={handleTrendRangeChange}
              temuanMonth={effectiveTemuanFilter.month}
              temuanMonths={temuanMonths}
              onTemuanMonthChange={(month) =>
                setTemuanFilter((current) => ({ ...current, month }))
              }
              temuanQuery={temuanFilter.query}
              onTemuanQueryChange={(query) =>
                setTemuanFilter((current) => ({ ...current, query }))
              }
            />
          }
          panels={{
            summary: (
              <div className="flex min-w-0 flex-col gap-8">
                {monthlySummaries.length === 0 ? (
                  <QaStatePanel
                    type="empty"
                    title={`Belum ada audit ${serviceLabel} di ${selectedYear}`}
                    description="Pilih tahun atau layanan lain, atau tambahkan audit lewat Input Audit."
                  />
                ) : (
                  <>
                    {latestPeriod && selectedMonth && activeTitle ? (
                      <AgentCoachingBrief
                        monthTitle={activeTitle}
                        month={selectedMonth}
                        year={selectedYear}
                        score={latestPeriod.finalScore}
                        previousScore={previousPeriod?.finalScore ?? null}
                        previousMonthName={
                          previousPeriod
                            ? monthsFull[previousPeriod.month - 1]
                            : undefined
                        }
                        findings={temuanDisplayItems}
                        tickets={topTickets}
                        causes={activeRootCauses}
                        onTicketSelect={handleTicketSelect}
                      />
                    ) : null}
                    <section
                      aria-labelledby="agent-monthly-score-heading"
                      className="flex min-w-0 flex-col gap-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <h2
                          id="agent-monthly-score-heading"
                          className="font-outfit text-lg font-bold tracking-tight text-foreground"
                        >
                          Skor per bulan
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Klik batang bulan untuk melihat tiket pengurang skor
                          dan akar masalahnya.
                        </p>
                      </div>
                      <MonthRail
                        summaries={monthlySummaries}
                        selectedMonth={selectedMonth}
                        onMonthSelect={handleMonthSelect}
                      />
                      {latestPeriod && (
                        <div className="pt-2">
                          <AgentAuditDossier
                            finalScore={latestPeriod.finalScore}
                            sessionCount={latestPeriod.sessionCount}
                            findingsCount={latestPeriod.findingsCount}
                            previousScore={previousPeriod?.finalScore ?? null}
                            previousMonthName={
                              previousPeriod
                                ? monthsFull[previousPeriod.month - 1]
                                : undefined
                            }
                            monthLabel={activeLabel}
                            monthTitle={activeTitle}
                            tickets={topTickets}
                            causes={activeRootCauses}
                            rootCauseMonthLabel={rootCauseScopeLabel}
                            onTicketSelect={handleTicketSelect}
                          />
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            ),
            trend: (
              <AgentTrendTab
                labels={data.personalTrend.labels}
                datasets={data.personalTrend.datasets}
                loading={loading}
                comparisonTable={data.comparisonTable}
              />
            ),
            temuan: (
              <div className="flex min-w-0 flex-col gap-5">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-outfit text-lg font-bold tracking-tight text-foreground">
                    Temuan audit
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Dikelompokkan per bulan dan nomor tiket, termasuk sesi audit
                    tanpa temuan.
                  </p>
                </div>
                <AgentTemuanTab
                  key={`${selectedYear}-${selectedService}`}
                  items={filteredTemuan.items}
                  phantomSessions={filteredTemuan.sessions}
                  filtered={isTemuanFilterActive(effectiveTemuanFilter)}
                  loading={loading}
                  deletingId={deletingId}
                  canEdit={role === "trainer" || role === "admin"}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  focusRequest={temuanFocus}
                />
              </div>
            ),
            heatmap: (
              <SidakAgentHeatmapPanel
                agentId={id}
                year={selectedYear}
                serviceType={selectedService}
                onOpenTicket={handleHeatmapTicket}
              />
            ),
            simulations: <SidakSimulationHistory agentId={id} />,
          }}
        />
      </div>

      <EditTemuanModal
        open={!!editingTemuan}
        indicatorName={editingTemuan?.indicatorName ?? ""}
        form={editForm}
        submitting={isSubmitting}
        onFormChange={(field, value) =>
          setEditForm((previous) => ({ ...previous, [field]: value }))
        }
        onSave={handleEditSave}
        onClose={() => setEditingTemuan(null)}
        tanggalLayanan={editingTemuan?.tanggal_layanan ?? null}
        tanggalSampel={editingTemuan?.tanggal_sampel ?? null}
      />
    </div>
  );
}
