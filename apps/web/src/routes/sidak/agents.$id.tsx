import { useParams, Link } from "@tanstack/react-router";
import { useAgentDetail } from "../../hooks/useAgentDetail";
import {
  ArrowLeft, AlertTriangle, RefreshCw,
  BarChart2, ShieldCheck, Activity,
} from "lucide-react";
import AgentProfileBar from "../../components/sidak/AgentProfileBar";
import ContextControlBar from "../../components/sidak/ContextControlBar";
import MonthRail from "../../components/sidak/MonthRail";
import ScoreDetailCard from "../../components/sidak/ScoreDetailCard";
import TopTicketsCard from "../../components/sidak/TopTicketsCard";
import AiInsightCard from "../../components/sidak/AiInsightCard";
import AgentTrendTab from "../../components/sidak/AgentTrendTab";
import AgentTemuanTab from "../../components/sidak/AgentTemuanTab";
import EditTemuanModal from "../../components/sidak/EditTemuanModal";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import TabSkeleton from "../../components/sidak/TabSkeleton";
import { useRef, useEffect } from "react";

const SECTIONS = [
  { id: "summary", label: "Ringkasan Skor" },
  { id: "trend", label: "Grafik Tren" },
  { id: "temuan", label: "Daftar Temuan" },
];

export default function SidakAgentDetailPage() {
  const { id } = useParams({ from: "/sidak/agents/$id" });
  const {
    data, loading, refetch, role,
    selectedYear, selectedService, selectedMonth,
    trendStartMonth, trendEndMonth,
    activeSection, trendMounted, temuanMounted,
    monthlySummaries, latestPeriod, previousPeriod,
    temuanDisplayItems, topTickets,
    automatedCoaching, masaKerja,
    availableServiceTypes, monthsFull,
    editingTemuan, editForm, isSubmitting, deletingId,
    setEditForm, setEditingTemuan,
    handleYearChange, handleServiceChange, handleMonthSelect,
    handleTrendRangeChange, handleSectionVisible,
    handleExport, handleInputAudit,
    handleEdit, handleEditSave, handleDelete,
    teams, agentsInTeam, selectedTeam, loadingAgents,
    handleTeamChange, handleAgentChange,
  } = useAgentDetail(id);

  const summaryRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const temuanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute("data-section");
            if (section) handleSectionVisible(section);
          }
        }
      },
      { rootMargin: "-80px 0px -55% 0px" },
    );

    const refs = [summaryRef, trendRef, temuanRef];
    refs.forEach((r) => { if (r.current) observer.observe(r.current); });
    return () => observer.disconnect();
  }, [handleSectionVisible, data]);

  if (loading && !data) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <div className="h-6 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-lg font-bold">Agent Tidak Ditemukan</h2>
        <p className="mb-6 text-sm text-muted-foreground">Data agent tidak tersedia atau telah dihapus.</p>
        <Link to="/sidak/agents" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Direktori
        </Link>
      </div>
    );
  }

  const activeLabel = latestPeriod && selectedMonth
    ? `${monthsFull[selectedMonth - 1]?.slice(0, 3) ?? ""} ${selectedYear}`
    : undefined;

  return (
    <div className="space-y-6 pb-24 overflow-x-hidden">
      {/* Back + Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center px-6 lg:px-8 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/sidak/agents" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SIDAK PERSONAL AUDIT</p>
            <h1 className="font-outfit text-sm font-bold tracking-tight text-foreground">{data.peserta.nama}</h1>
          </div>
        </div>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Memuat..." : "Refresh"}
        </button>
      </div>

      {/* Profile Bar */}
      <div className="px-6 lg:px-8">
        <AgentProfileBar
          nama={data.peserta.nama}
          tim={data.peserta.tim}
          batchName={data.peserta.batch_name}
          jabatan={data.peserta.jabatan}
          bergabungDate={data.peserta.bergabung_date}
          fotoUrl={data.peserta.foto_url}
          role={role}
          onExport={handleExport}
          onInputAudit={handleInputAudit}
        />
      </div>

      {/* Context Control Bar */}
      <ContextControlBar
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

      {/* Nav Tabs (sticky) */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex gap-4 overflow-x-auto sm:gap-8 no-scrollbar">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => {
                  handleSectionVisible(sec.id);
                  const ref = sec.id === "summary" ? summaryRef : sec.id === "trend" ? trendRef : temuanRef;
                  ref.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`border-b-2 py-3 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap transition-all ${
                  activeSection === sec.id
                    ? "border-foreground text-foreground font-bold"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-12">
        {/* ── SECTION: RINGKASAN SKOR ── */}
        <div ref={summaryRef} data-section="summary" id="section-summary" className="scroll-mt-24 space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold leading-tight tracking-tight text-foreground">Analisis Performa Bulanan</h3>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tahun {selectedYear} &bull; Layanan {selectedService.toUpperCase()}
              </p>
            </div>
          </div>

          {monthlySummaries.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-12">
              <QaStatePanel
                type="empty"
                title="Data belum tersedia"
                description={`Belum ada ringkasan skor untuk layanan ${selectedService.toUpperCase()} di tahun ${selectedYear}.`}
                className="mx-auto max-w-lg"
              />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Month Rail */}
              <MonthRail summaries={monthlySummaries} selectedMonth={selectedMonth} onMonthSelect={handleMonthSelect} />

              {/* Active Detail Panel */}
              {latestPeriod && (
                <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12 xl:gap-6">
                  {/* Score Card — 4 cols */}
                  <div className="xl:col-span-4">
                    <ScoreDetailCard
                      finalScore={latestPeriod.finalScore}
                      sessionCount={latestPeriod.sessionCount}
                      previousScore={previousPeriod?.finalScore ?? null}
                      findingsCount={latestPeriod.findingsCount}
                      monthLabel={activeLabel}
                    />
                  </div>

                  {/* Top Tickets + AI Insight — 8 cols */}
                  <div className="space-y-5 xl:col-span-8">
                    <TopTicketsCard tickets={topTickets} />
                    <AiInsightCard insight={automatedCoaching} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION: GRAFIK TREN ── */}
        <div ref={trendRef} data-section="trend" id="section-trend" className="scroll-mt-20 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold leading-tight tracking-tight text-foreground">Tren Pergerakan Skor</h3>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rentang Statistik: {monthsFull[trendStartMonth - 1]?.slice(0, 3)} &ndash; {monthsFull[trendEndMonth - 1]?.slice(0, 3)} {selectedYear}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {trendMounted && selectedService ? (
              <AgentTrendTab
                labels={data.personalTrend.labels}
                datasets={data.personalTrend.datasets}
                loading={loading && !trendMounted}
              />
            ) : (
              <TabSkeleton />
            )}
          </div>
        </div>

        {/* ── SECTION: DAFTAR TEMUAN ── */}
        <div ref={temuanRef} data-section="temuan" id="section-temuan" className="scroll-mt-20 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold leading-tight tracking-tight text-foreground">Riwayat Temuan Detil</h3>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dikelompokkan per bulan audit</p>
            </div>
          </div>
          {temuanMounted ? (
            <AgentTemuanTab
              key={`${selectedYear}-${selectedService}`}
              items={temuanDisplayItems}
              loading={loading}
              deletingId={deletingId}
              canEdit={role === "trainer" || role === "admin"}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <TabSkeleton />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditTemuanModal
        open={!!editingTemuan}
        indicatorName={editingTemuan?.indicatorName ?? ""}
        form={editForm}
        submitting={isSubmitting}
        onFormChange={(field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))}
        onSave={handleEditSave}
        onClose={() => setEditingTemuan(null)}
      />
    </div>
  );
}
