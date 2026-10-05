import { useCallback, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
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
import { useAgentDetail } from "../../hooks/useAgentDetail";
import { useAgentQuickview } from "../../hooks/useAgentQuickview";
import AgentAuditDossier from "../../components/sidak/AgentAuditDossier";
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
  SIDAK_QA_TARGET,
  SIDAK_SCORE_TEXT,
  describeScoreChange,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";
import { SERVICE_LABELS } from "../../lib/scoring";
import type { ServiceType } from "@trainers/types";

export default function SidakAgentDetailPage() {
  const { id } = useParams({ from: "/sidak/agents/$id" });
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
  } = useAgentDetail(id);
  const {
    data: quickviewData,
    loading: quickviewLoading,
    error: quickviewError,
    refetch: refetchQuickview,
  } = useAgentQuickview(id, selectedYear, selectedService);
  const [activeTab, setActiveTab] = useState<SidakAgentDetailTab>("summary");
  const [mountedTabs, setMountedTabs] = useState<Set<SidakAgentDetailTab>>(
    () => new Set(["summary"]),
  );

  const handleTabChange = useCallback((tab: SidakAgentDetailTab) => {
    setActiveTab(tab);
    setMountedTabs((current) => {
      if (current.has(tab)) return current;
      return new Set(current).add(tab);
    });
  }, []);

  const [temuanFocus, setTemuanFocus] = useState<TemuanFocusRequest | null>(
    null,
  );
  const handleTicketSelect = useCallback(
    (ticketKey: string) => {
      if (!selectedMonth) return;
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
              <section
                aria-label="Skor terbaru"
                className="flex flex-col gap-1"
              >
                <h2 className="text-xs font-medium text-muted-foreground">
                  Skor terbaru · {monthsFull[latestSummary.month - 1]}{" "}
                  {latestSummary.year}
                </h2>
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`font-outfit text-4xl font-bold leading-none tracking-tight tabular-nums ${SIDAK_SCORE_TEXT[sidakScoreTone(latestSummary.finalScore)]}`}
                  >
                    {latestSummary.finalScore.toFixed(1)}
                    <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                      %
                    </span>
                  </span>
                  <span
                    className={`text-sm font-semibold ${SIDAK_SCORE_TEXT[sidakScoreTone(latestSummary.finalScore)]}`}
                  >
                    {sidakScoreLabel(latestSummary.finalScore)}
                  </span>
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
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
                        Klik batang bulan untuk melihat tiket pengurang skor dan
                        akar masalahnya.
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
                  items={temuanDisplayItems}
                  phantomSessions={phantomSessionDisplayItems}
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
