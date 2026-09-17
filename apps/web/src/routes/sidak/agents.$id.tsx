import { useCallback, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
} from "@/components/ui/card";
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
import AgentProfileBar from "../../components/sidak/AgentProfileBar";
import AgentTemuanTab from "../../components/sidak/AgentTemuanTab";
import AgentTrendTab from "../../components/sidak/AgentTrendTab";
import ContextControlBar from "../../components/sidak/ContextControlBar";
import EditTemuanModal from "../../components/sidak/EditTemuanModal";
import MonthRail from "../../components/sidak/MonthRail";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import SidakAgentDetailTabs from "../../components/sidak/SidakAgentDetailTabs";
import type { SidakAgentDetailTab } from "../../components/sidak/sidak-agent-detail-tabs.constants";
import SidakSimulationHistory from "../../components/sidak/SidakSimulationHistory";

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
    teams,
    agentsInTeam,
    selectedTeam,
    loadingAgents,
    handleTeamChange,
    handleAgentChange,
  } = useAgentDetail(id);
  const {
    data: quickviewData,
    loading: quickviewLoading,
    error: quickviewError,
    refetch: refetchQuickview,
  } = useAgentQuickview(id, selectedYear, selectedService);
  const [activeTab, setActiveTab] = useState<SidakAgentDetailTab>("summary");
  const [mountedTabs, setMountedTabs] = useState<
    Set<SidakAgentDetailTab>
  >(() => new Set(["summary"]));

  const handleTabChange = useCallback((tab: SidakAgentDetailTab) => {
    setActiveTab(tab);
    setMountedTabs((current) => {
      if (current.has(tab)) return current;
      return new Set(current).add(tab);
    });
  }, []);

  const handleRefresh = useCallback(() => {
    void refetch();
    void refetchQuickview();
  }, [refetch, refetchQuickview]);

  if (loading && !data) {
    return (
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8" role="status" aria-label="Memuat profil agen">
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
            <EmptyMedia variant="icon" className="size-14 rounded-xl bg-muted text-muted-foreground">
              <AlertTriangle className="size-7" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="font-outfit text-xl font-bold">Agen tidak ditemukan</EmptyTitle>
            <EmptyDescription>
              Data agen ini tidak tersedia atau sudah tidak ada.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            render={<Link to="/sidak/agents" />}
            nativeButton={false}
            variant="outline"
            size="lg"
            className="min-h-11"
          >
            <ArrowLeft data-icon="inline-start" className="size-4" aria-hidden="true" />
            Kembali ke daftar agen
          </Button>
        </Empty>
      </div>
    );
  }

  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const activeLabel =
    latestPeriod && selectedMonth
      ? (monthsFull[selectedMonth - 1]?.slice(0, 3) ?? "") +
        " " +
        selectedYear
      : undefined;
  const rootCauseScopeLabel =
    latestPeriod && selectedMonth
      ? selectedMonth === 1
        ? activeLabel
        : "Jan-" +
          (monthsFull[selectedMonth - 1]?.slice(0, 3) ?? "") +
          " " +
          selectedYear
      : undefined;
  const quickviewScopeLabel =
    "Tahun " +
    selectedYear +
    " · Layanan " +
    (selectedService ? selectedService.toUpperCase() : "—");

  return (
    <div className="min-w-0 overflow-x-hidden pb-16">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            render={<Link to="/sidak/agents" />}
            nativeButton={false}
            variant="outline"
            size="icon-lg"
            aria-label="Kembali ke daftar agen"
            className="min-h-11 min-w-11 shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <p className="text-sm font-semibold text-muted-foreground">
            SIDAK · Profil Agen
          </p>
        </div>

        <AgentProfileBar
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
        />

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
          role={role}
          teams={teams}
          selectedTeam={selectedTeam}
          onTeamChange={handleTeamChange}
          agentsInTeam={agentsInTeam}
          selectedAgentId={id}
          onAgentChange={handleAgentChange}
          loadingAgents={loadingAgents}
        />

          <SidakAgentDetailTabs
          activeTab={activeTab}
          mountedTabs={mountedTabs}
          onTabChange={handleTabChange}
          panels={{
            summary: (
              <div className="flex min-w-0 flex-col gap-6">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="size-10 shrink-0 rounded-xl bg-muted p-0 text-muted-foreground">
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  </Badge>
                  <div className="min-w-0">
                    <h2 className="font-outfit text-xl font-bold tracking-tight text-foreground">
                      Ringkasan skor
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Skor, pengurang, dan diagnosis pada periode yang dipilih.
                    </p>
                  </div>
                </div>

                <AgentPerformanceQuickview
                  data={quickviewData}
                  loading={quickviewLoading}
                  error={quickviewError}
                  scopeLabel={quickviewScopeLabel}
                />

                {monthlySummaries.length === 0 ? (
                  <Card className="border-border bg-surface p-4 ring-0 sm:p-6">
                    <QaStatePanel
                      type="empty"
                      title="Data belum tersedia"
                      description={
                        "Belum ada ringkasan skor untuk layanan " +
                        selectedService.toUpperCase() +
                        " pada tahun " +
                        selectedYear +
                        "."
                      }
                      className="mx-auto max-w-lg"
                    />
                  </Card>
                ) : (
                  <div className="flex flex-col gap-6">
                    <MonthRail
                      summaries={monthlySummaries}
                      selectedMonth={selectedMonth}
                      onMonthSelect={handleMonthSelect}
                    />
                    {latestPeriod && (
                      <AgentAuditDossier
                        finalScore={latestPeriod.finalScore}
                        sessionCount={latestPeriod.sessionCount}
                        findingsCount={latestPeriod.findingsCount}
                        previousScore={previousPeriod?.finalScore ?? null}
                        monthLabel={activeLabel}
                        tickets={topTickets}
                        causes={activeRootCauses}
                        rootCauseMonthLabel={rootCauseScopeLabel}
                      />
                    )}
                  </div>
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
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="size-10 shrink-0 rounded-xl bg-muted p-0 text-muted-foreground">
                    <Activity className="size-5" aria-hidden="true" />
                  </Badge>
                  <div className="min-w-0">
                    <h2 className="font-outfit text-xl font-bold tracking-tight text-foreground">
                      Temuan audit
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Temuan dan sesi tanpa temuan dikelompokkan berdasarkan
                      bulan dan tiket.
                    </p>
                  </div>
                </div>
                <AgentTemuanTab
                  items={temuanDisplayItems}
                  phantomSessions={phantomSessionDisplayItems}
                  loading={loading}
                  deletingId={deletingId}
                  canEdit={role === "trainer" || role === "admin"}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
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
      />
    </div>
  );
}
