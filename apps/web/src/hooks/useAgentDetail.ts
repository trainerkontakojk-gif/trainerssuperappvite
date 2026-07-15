import { useState, useMemo, useCallback, useEffect } from "react";
import { useApi } from "./useApi";
import { sidakClient, unwrapResponse } from "../lib/api";
import { VALID_SERVICE_TYPES } from "@trainers/types";
import type {
  AgentDetailData,
  ServiceType,
  RootCauseResult,
} from "@trainers/types";
import { useAuthStore } from "../store/authStore";
import {
  calculateSessionScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
} from "../lib/scoring";

interface TicketScore {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  totalPenaltyWeight: number;
  isSamplingQa: boolean;
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

const MONTHS_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
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
  const [editingTemuan, setEditingTemuan] = useState<TemuanDisplayItem | null>(
    null,
  );
  const [editForm, setEditForm] = useState<EditFormState>({
    nilai: 3,
    ketidaksesuaian: "",
    sebaiknya: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [agentsInTeam, setAgentsInTeam] = useState<
    { id: string; nama: string }[]
  >([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(false);

  const isStaffRole =
    role === "trainer" || role === "admin" || role === "leader";

  // Fetch folders on mount
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  useEffect(() => {
    if (!isStaffRole) {
      setFoldersLoaded(true);
      return;
    }
    (
      unwrapResponse(sidakClient.folders.$get()) as Promise<
        { id: string; name: string }[]
      > as any
    )
      .then((res: any) => {
        setTeams(res ?? []);
        setFoldersLoaded(true);
      })
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
    if (selectedService && data.initialService !== selectedService) return;
    const svcs = [
      ...new Set((data.periodSummaries ?? []).map((s) => s.serviceType)),
    ];
    if (svcs.length === 0) return;
    if (selectedService && (svcs as string[]).includes(selectedService)) return;
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
    if (!selectedTeam || !isStaffRole) {
      setAgentsInTeam([]);
      return;
    }
    setLoadingAgents(true);
    const encoded = encodeURIComponent(selectedTeam);
    (
      unwrapResponse(
        sidakClient.folders[":folder"].agents.$get({
          param: { folder: encoded },
        }),
      ) as Promise<any>
    )
      .then((res) => setAgentsInTeam(res ?? []))
      .catch(() => setAgentsInTeam([]))
      .finally(() => setLoadingAgents(false));
  }, [selectedTeam, isStaffRole]);

  const monthlySummaries = useMemo(() => {
    if (!periodSummaries) return [];
    return periodSummaries
      .filter(
        (s) => selectedService === "all" || s.serviceType === selectedService,
      )
      .sort((a, b) => a.month - b.month);
  }, [periodSummaries, selectedService]);

  useEffect(() => {
    if (monthlySummaries.length === 0) {
      if (selectedMonth !== null) {
        setSelectedMonth(null);
      }
      return;
    }

    const hasActiveMonth =
      selectedMonth !== null &&
      monthlySummaries.some((summary) => summary.month === selectedMonth);

    if (!hasActiveMonth) {
      setSelectedMonth(monthlySummaries[monthlySummaries.length - 1].month);
    }
  }, [monthlySummaries, selectedMonth]);

  const latestPeriod = useMemo(() => {
    if (selectedMonth !== null) {
      return (
        monthlySummaries.find((s) => s.month === selectedMonth) ??
        monthlySummaries[monthlySummaries.length - 1]
      );
    }
    return monthlySummaries[monthlySummaries.length - 1];
  }, [monthlySummaries, selectedMonth]);

  const previousPeriod = useMemo(() => {
    if (!latestPeriod || monthlySummaries.length < 2) return null;
    const idx = monthlySummaries.findIndex(
      (s) => s.month === latestPeriod.month,
    );
    if (idx > 0) return monthlySummaries[idx - 1];
    return null;
  }, [monthlySummaries, latestPeriod]);

  const temuanDisplayItems = useMemo((): TemuanDisplayItem[] => {
    if (!temuan) return [];
    const periodMap = new Map(
      (periodSummaries ?? []).map((s) => [
        s.id,
        { month: s.month, year: s.year },
      ]),
    );

    return temuan
      .filter((t: any) => {
        if (selectedService === "all") return true;
        return t.service_type === selectedService;
      })
      .filter((t: any) => indicators?.some((i) => i.id === t.indicator_id))
      .map((t: any) => {
        const pi = periodMap.get(t.period_id) ?? { month: 0, year: 0 };
        const ind = indicators?.find((i) => i.id === t.indicator_id);
        return {
          id: t.id,
          month: pi.month,
          year: pi.year,
          indicatorName: ind?.name ?? "",
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
    if (!data || !temuan || !indicators || !data.periodSummaries) return [];
    if (!selectedMonth) return [];

    const serviceIndicators = indicators.filter(
      (i) => i.service_type === selectedService,
    );
    if (serviceIndicators.length === 0) return [];

    const activeServiceWeight =
      data.weights?.[selectedService as ServiceType] ??
      DEFAULT_SERVICE_WEIGHTS[selectedService as ServiceType] ??
      DEFAULT_SERVICE_WEIGHTS.call;

    const periodMonthMap = new Map(
      data.periodSummaries.map((s) => [s.id, s.month]),
    );

    const monthFindings = temuan.filter((t) => {
      if (selectedService !== "all" && t.service_type !== selectedService)
        return false;
      return periodMonthMap.get(t.period_id) === selectedMonth;
    });

    const ticketMap: Record<
      string,
      {
        no_tiket: string;
        totalPenaltyWeight: number;
        findingCount: number;
        heaviestParam: string;
        maxPenaltyWeight: number;
        isSamplingQa: boolean;
        sessionFindings: { indicator_id: string; nilai: number }[];
      }
    > = {};

    for (const f of monthFindings) {
      const rawTicket = (f.no_tiket ?? "").trim();
      const ticketKey = rawTicket ? rawTicket.toUpperCase() : `audit-${f.id}`;
      const ind = serviceIndicators.find((i) => i.id === f.indicator_id);
      if (!ind) continue;
      const weight = ind?.bobot ?? 0;
      const nilai = Number.isFinite(f.nilai)
        ? Math.max(0, Math.min(3, Number(f.nilai)))
        : 3;
      const penaltyWeight = ((3 - nilai) / 3) * weight;
      const paramName = ind?.name || "Unknown";

      if (!ticketMap[ticketKey]) {
        ticketMap[ticketKey] = {
          no_tiket: ticketKey,
          totalPenaltyWeight: 0,
          findingCount: 0,
          heaviestParam: paramName,
          maxPenaltyWeight: penaltyWeight,
          isSamplingQa:
            ticketKey.startsWith("__PHANTOM__") ||
            (f as any).is_phantom_padding === true,
          sessionFindings: [],
        };
      }

      const entry = ticketMap[ticketKey];
      entry.totalPenaltyWeight += penaltyWeight;
      entry.findingCount += 1;
      if (
        ticketKey.startsWith("__PHANTOM__") ||
        (f as any).is_phantom_padding === true
      ) {
        entry.isSamplingQa = true;
      }
      entry.sessionFindings.push({
        indicator_id: f.indicator_id,
        nilai,
      });

      if (penaltyWeight > entry.maxPenaltyWeight) {
        entry.maxPenaltyWeight = penaltyWeight;
        entry.heaviestParam = paramName;
      }
    }

    return Object.values(ticketMap)
      .map((ticket) => {
        const sessionScore = calculateSessionScoreFromTemuan(
          serviceIndicators,
          ticket.sessionFindings,
          activeServiceWeight,
        );
        const scoreDeduction = Math.max(0, 100 - sessionScore);
        return {
          no_tiket: ticket.no_tiket,
          scoreDeduction,
          totalPenaltyWeight: ticket.totalPenaltyWeight,
          findingCount: ticket.findingCount,
          heaviestParam: ticket.heaviestParam,
          isSamplingQa: ticket.isSamplingQa,
        };
      })
      .filter((ticket) => ticket.scoreDeduction > 0)
      .sort((a, b) => {
        if (b.scoreDeduction !== a.scoreDeduction)
          return b.scoreDeduction - a.scoreDeduction;
        if (b.totalPenaltyWeight !== a.totalPenaltyWeight)
          return b.totalPenaltyWeight - a.totalPenaltyWeight;
        return b.findingCount - a.findingCount;
      })
      .slice(0, 5);
  }, [data, temuan, indicators, selectedService, selectedMonth]);

  const activeRootCauses = useMemo((): RootCauseResult[] => {
    const rootCauses = data?.rootCauses;
    if (!rootCauses || !latestPeriod) return [];
    const ytdPeriodIds = new Set(
      monthlySummaries
        .filter((summary) => summary.year === latestPeriod.year)
        .filter((summary) => summary.month <= latestPeriod.month)
        .filter(
          (summary) =>
            selectedService === "all" || summary.serviceType === selectedService,
        )
        .map((summary) => summary.id),
    );

    return rootCauses
      .map((cause) => {
        const activePeriods = cause.periods.filter(
          (period) =>
            ytdPeriodIds.has(period.periodId) &&
            (selectedService === "all" ||
              period.serviceType === selectedService),
        );
        if (activePeriods.length === 0) return null;
        const findingsCount = activePeriods.reduce(
          (sum, period) => sum + period.findingsCount,
          0,
        );
        const affectedTickets = activePeriods.reduce(
          (sum, period) => sum + period.affectedTickets,
          0,
        );
        const criticalFindingsCount = activePeriods.reduce(
          (sum, period) => sum + period.criticalFindingsCount,
          0,
        );
        const activePeriodIds = new Set(
          activePeriods.map((period) => period.periodId),
        );
        return {
          ...cause,
          findingsCount,
          affectedTickets,
          criticalFindingsCount,
          evidence: cause.evidence.filter(
            (item) =>
              item.periodId !== null && activePeriodIds.has(item.periodId),
          ),
          periods: activePeriods,
        };
      })
      .filter((cause): cause is NonNullable<typeof cause> => cause !== null)
      .sort((a, b) => {
        if (b.findingsCount !== a.findingsCount)
          return b.findingsCount - a.findingsCount;
        if (b.affectedTickets !== a.affectedTickets)
          return b.affectedTickets - a.affectedTickets;
        if (b.criticalFindingsCount !== a.criticalFindingsCount)
          return b.criticalFindingsCount - a.criticalFindingsCount;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.label.localeCompare(b.label);
      });
  }, [data, latestPeriod, monthlySummaries, selectedService]);

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
        ...monthlySummaries.map((s) => [
          s.label,
          s.finalScore,
          s.nonCriticalScore,
          s.criticalScore,
          s.sessionCount,
          s.findingsCount,
        ]),
      ];
      const ws = xlsx.utils.aoa_to_sheet(summaryData);
      xlsx.utils.book_append_sheet(wb, ws, "Ringkasan");

      xlsx.writeFile(
        wb,
        `Laporan_Audit_${data?.peserta.nama ?? agentId}_${selectedYear}.xlsx`,
      );
    } catch {
      // silent
    }
  }, [data, selectedYear, monthlySummaries, agentId]);

  const handleInputAudit = useCallback(() => {
    const folder = data?.peserta?.batch_name || data?.peserta?.tim || "";
    const params = new URLSearchParams({ folder, agent_id: agentId });
    window.location.assign(`/sidak/input?${params.toString()}`);
  }, [agentId, data]);

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
      await unwrapResponse(
        sidakClient.temuan[":id"].$put({
          param: { id: editingTemuan.id },
          json: editForm,
        }),
      );
      setEditingTemuan(null);
      refetch();
    } catch {
      // silent
    } finally {
      setIsSubmitting(false);
    }
  }, [editingTemuan, editForm, refetch]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await unwrapResponse(
          sidakClient.temuan[":id"].$delete({ param: { id } }),
        );
        refetch();
      } catch {
        // silent
      } finally {
        setDeletingId(null);
      }
    },
    [refetch],
  );

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
    activeRootCauses,
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
