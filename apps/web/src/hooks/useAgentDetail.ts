import { useState, useMemo, useCallback, useEffect } from "react";
import { useApi, putApi, deleteApi, fetchApi } from "./useApi";
import { VALID_SERVICE_TYPES } from "@trainers/types";
import type { AgentDetailData, QATemuan } from "@trainers/types";
import { useAuthStore } from "../store/authStore";

interface TicketScore {
  no_tiket: string;
  deduction: number;
  count: number;
  heaviestParam: string;
  isSamplingQa: boolean;
}

interface CoachingInsight {
  parameter: string;
  count: number;
  recommendation: string;
  isCritical: boolean;
}

export interface TemuanDisplayItem {
  id: string;
  month: number;
  year: number;
  indicatorName: string;
  category: string;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
}

export interface EditFormState {
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
}

const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 12) return `${months} bln`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} thn ${rem} bln` : `${years} thn`;
}

export function useAgentDetail(agentId: string) {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "agent";

  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedService, setSelectedService] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [trendStartMonth, setTrendStartMonth] = useState(1);
  const [trendEndMonth, setTrendEndMonth] = useState(currentMonth);
  const [activeSection, setActiveSection] = useState("summary");
  const [trendMounted, setTrendMounted] = useState(false);
  const [temuanMounted, setTemuanMounted] = useState(false);
  const [editingTemuan, setEditingTemuan] = useState<TemuanDisplayItem | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ nilai: 3, ketidaksesuaian: "", sebaiknya: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [agentsInTeam, setAgentsInTeam] = useState<{ id: string; nama: string }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(false);

  const isStaffRole = role === "trainer" || role === "admin" || role === "leader";

  // Fetch folders on mount
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  useEffect(() => {
    if (!isStaffRole) { setFoldersLoaded(true); return; }
    fetchApi<{ id: string; name: string }[]>("/sidak/folders")
      .then((res) => { setTeams(res ?? []); setFoldersLoaded(true); })
      .catch(() => setFoldersLoaded(true));
  }, [isStaffRole]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(selectedYear));
    if (selectedService) p.set("service_type", selectedService);
    p.set("startMonth", String(trendStartMonth));
    p.set("endMonth", String(trendEndMonth));
    return p.toString();
  }, [selectedYear, selectedService, trendStartMonth, trendEndMonth]);

  const { data, loading, refetch } = useApi<AgentDetailData>(
    `/sidak/agents/${agentId}?${queryParams}`,
  );
  const periodSummaries = data?.periodSummaries;
  const temuan = data?.temuan;
  const indicators = data?.indicators;

  // Init selectedService to first available service once data loads
  useEffect(() => {
    if (!data || !data.periodSummaries) return;
    const svcs = [...new Set((data.periodSummaries ?? []).map((s) => s.serviceType))];
    if (svcs.length === 0) return;
    if (selectedService && svcs.includes(selectedService)) return;
    setSelectedService(svcs[0]);
  }, [data, selectedService]);

  // Init selectedTeam from peserta data once loaded
  useEffect(() => {
    if (!data || !foldersLoaded || isStaffRole === false) return;
    const initTeam = data.peserta?.batch_name ?? data.peserta?.tim ?? "";
    if (initTeam) setSelectedTeam(initTeam);
  }, [data, foldersLoaded]);

  // Fetch agents when selectedTeam changes
  useEffect(() => {
    if (!selectedTeam || !isStaffRole) { setAgentsInTeam([]); return; }
    setLoadingAgents(true);
    const encoded = encodeURIComponent(selectedTeam);
    fetchApi<{ id: string; nama: string }[]>(`/sidak/folders/${encoded}/agents`)
      .then((res) => setAgentsInTeam(res ?? []))
      .catch(() => setAgentsInTeam([]))
      .finally(() => setLoadingAgents(false));
  }, [selectedTeam, isStaffRole]);

  const monthlySummaries = useMemo(() => {
    if (!periodSummaries) return [];
    return periodSummaries
      .filter((s) => selectedService === "all" || s.serviceType === selectedService)
      .sort((a, b) => a.month - b.month);
  }, [periodSummaries, selectedService]);

  const latestPeriod = useMemo(() => {
    if (selectedMonth !== null) {
      return monthlySummaries.find((s) => s.month === selectedMonth) ?? monthlySummaries[monthlySummaries.length - 1];
    }
    return monthlySummaries[monthlySummaries.length - 1];
  }, [monthlySummaries, selectedMonth]);

  const previousPeriod = useMemo(() => {
    if (!latestPeriod || monthlySummaries.length < 2) return null;
    const idx = monthlySummaries.findIndex((s) => s.month === latestPeriod.month);
    if (idx > 0) return monthlySummaries[idx - 1];
    return null;
  }, [monthlySummaries, latestPeriod]);

  const temuanDisplayItems = useMemo((): TemuanDisplayItem[] => {
    if (!temuan) return [];
    const periodMap = new Map(
      (periodSummaries ?? []).map((s) => [s.id, { month: s.month, year: s.year }])
    );

    return temuan
      .filter((t: any) => {
        if (selectedService === "all") return true;
        return t.service_type === selectedService;
      })
      .map((t: any) => {
        const pi = periodMap.get(t.period_id) ?? { month: 0, year: 0 };
        const ind = indicators?.find((i) => i.id === t.indicator_id);
        return {
          id: t.id,
          month: pi.month,
          year: pi.year,
          indicatorName: ind?.name ?? "Unknown",
          category: ind?.category ?? "non_critical",
          nilai: t.nilai ?? 0,
          ketidaksesuaian: t.ketidaksesuaian ?? null,
          sebaiknya: t.sebaiknya ?? null,
          no_tiket: t.no_tiket ?? null,
        };
      })
      .filter((t) => t.month > 0);
  }, [temuan, periodSummaries, indicators, selectedService]);

  const topTickets = useMemo((): TicketScore[] => {
    if (!temuan || !indicators) return [];
    const ticketMap = new Map<string, { items: QATemuan[]; isSamplingQa: boolean }>();

    for (const t of temuan) {
      if (selectedService !== "all" && t.service_type !== selectedService) continue;
      const rawTicket = (t.no_tiket ?? "").trim();
      const ticketKey = rawTicket || `audit-${t.id}`;
      const entry = ticketMap.get(ticketKey);
      const isSampling = ticketKey.startsWith("__PHANTOM__") || (t as any).is_phantom_padding === true;
      if (entry) {
        entry.items.push(t);
        if (isSampling) entry.isSamplingQa = true;
      } else {
        ticketMap.set(ticketKey, { items: [t], isSamplingQa: isSampling });
      }
    }

    const results: TicketScore[] = [];
    for (const [ticket, { items, isSamplingQa }] of ticketMap) {
      let maxDeduction = 0;
      let heaviestParam = "";
      for (const item of items) {
        const ind = indicators.find((i) => i.id === item.indicator_id);
        const weight = ind?.bobot ?? 1;
        const nilai = item.nilai ?? 0;
        const penalty = ((3 - nilai) / 3) * weight;
        if (penalty > maxDeduction) {
          maxDeduction = penalty;
          heaviestParam = ind?.name || "Unknown";
        }
      }
      const minScore = items.reduce((max, item) => {
        const weight = indicators.find((i) => i.id === item.indicator_id)?.bobot ?? 1;
        const nilai = item.nilai ?? 0;
        return Math.min(max, (nilai / 3) * weight * 100);
      }, 100);
      const scoreDeduction = Math.round((100 - minScore) * 10) / 10;
      results.push({
        no_tiket: ticket,
        deduction: scoreDeduction,
        count: items.length,
        heaviestParam,
        isSamplingQa,
      });
    }

    return results
      .filter((t) => t.deduction > 0)
      .sort((a, b) => b.deduction - a.deduction)
      .slice(0, 5);
  }, [temuan, indicators, selectedService]);

  const automatedCoaching = useMemo((): CoachingInsight | null => {
    if (!temuan || !indicators || temuan.length === 0) return null;
    const criticals = temuan.filter((t) => t.nilai === 0);
    const target = criticals.length > 0 ? criticals : temuan.filter((t) => t.nilai === 1);
    if (target.length === 0) return null;
    const counts: Record<string, number> = {};
    let exampleSebaiknya = "";
    target.forEach((t) => {
      const ind = indicators.find((i) => i.id === t.indicator_id);
      const name = ind?.name ?? "Unknown";
      counts[name] = (counts[name] || 0) + 1;
      if (t.sebaiknya) exampleSebaiknya = t.sebaiknya;
    });
    const topParam = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return {
      parameter: topParam[0],
      count: topParam[1],
      recommendation: exampleSebaiknya || "Tingkatkan kualitas pada parameter ini.",
      isCritical: criticals.length > 0,
    };
  }, [temuan, indicators]);

  const masaKerja = useMemo(() => {
    return computeTenure(data?.peserta?.bergabung_date ?? null);
  }, [data?.peserta?.bergabung_date]);

  const availableServiceTypes = useMemo(() => {
    if (!temuan) return [];
    return VALID_SERVICE_TYPES.filter((svc) =>
      temuan.some((t) => t.service_type === svc),
    );
  }, [temuan]);

  const handleExport = useCallback(async () => {
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.utils.book_new();

      const summaryData: any[][] = [
        ["Nama", data?.peserta.nama ?? ""],
        ["Tim", data?.peserta.tim ?? ""],
        ["Batch", data?.peserta.batch_name ?? ""],
        ["Jabatan", data?.peserta.jabatan ?? ""],
        ["Tahun", String(selectedYear)],
        [""],
        ["Bulan", "Skor Final", "NC Score", "CR Score", "Sesi", "Temuan"],
        ...monthlySummaries.map((s) => [s.label, s.finalScore, s.nonCriticalScore, s.criticalScore, s.sessionCount, s.findingsCount]),
      ];
      const ws = xlsx.utils.aoa_to_sheet(summaryData);
      xlsx.utils.book_append_sheet(wb, ws, "Ringkasan");

      xlsx.writeFile(wb, `Laporan_Audit_${data?.peserta.nama ?? agentId}_${selectedYear}.xlsx`);
    } catch {
      // silent
    }
  }, [data, selectedYear, monthlySummaries, agentId]);

  const handleInputAudit = useCallback(() => {
    window.location.assign(`/sidak/input?agent_id=${agentId}&year=${selectedYear}`);
  }, [agentId, selectedYear]);

  const handleEdit = useCallback((item: TemuanDisplayItem) => {
    setEditingTemuan(item);
    setEditForm({
      nilai: item.nilai,
      ketidaksesuaian: item.ketidaksesuaian ?? "",
      sebaiknya: item.sebaiknya ?? "",
    });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingTemuan) return;
    setIsSubmitting(true);
    try {
      await putApi(`/sidak/temuan/${editingTemuan.id}`, editForm);
      setEditingTemuan(null);
      refetch();
    } catch {
      // silent
    } finally {
      setIsSubmitting(false);
    }
  }, [editingTemuan, editForm, refetch]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteApi(`/sidak/temuan/${id}`);
      refetch();
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }, [refetch]);

  const handleYearChange = useCallback((year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    setTrendMounted(false);
    setTemuanMounted(false);
    const isCurrent = year === new Date().getFullYear();
    setTrendStartMonth(1);
    setTrendEndMonth(isCurrent ? new Date().getMonth() + 1 : 12);
  }, []);

  const handleServiceChange = useCallback((svc: string) => {
    setSelectedService(svc);
    setSelectedMonth(null);
  }, []);

  const handleMonthSelect = useCallback((month: number) => {
    setSelectedMonth((prev) => (prev === month ? null : month));
  }, []);

  const handleTrendRangeChange = useCallback((start: number, end: number) => {
    setTrendStartMonth(start);
    setTrendEndMonth(end);
  }, []);

  const handleSectionVisible = useCallback((section: string) => {
    setActiveSection(section);
    if (section === "trend") setTrendMounted(true);
    if (section === "temuan") setTemuanMounted(true);
  }, []);

  const handleTeamChange = useCallback((team: string) => {
    setSelectedTeam(team);
  }, []);

  const handleAgentChange = useCallback((newAgentId: string) => {
    window.location.assign(`/sidak/agents/${newAgentId}`);
  }, []);

  return {
    data,
    loading,
    refetch,
    role,
    selectedYear,
    selectedService,
    selectedMonth,
    trendStartMonth,
    trendEndMonth,
    activeSection,
    trendMounted,
    temuanMounted,
    monthlySummaries,
    latestPeriod,
    previousPeriod,
    temuanDisplayItems,
    topTickets,
    automatedCoaching,
    masaKerja,
    availableServiceTypes,
    monthsFull: MONTHS_FULL,
    teams,
    agentsInTeam,
    selectedTeam,
    loadingAgents,
    handleTeamChange,
    handleAgentChange,
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
    handleSectionVisible,
    handleExport,
    handleInputAudit,
    handleEdit,
    handleEditSave,
    handleDelete,
  };
}
