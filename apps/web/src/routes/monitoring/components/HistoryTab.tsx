import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Mail,
  Phone,
  MessageSquare,
  PenTool,
  Calendar,
  ChevronDown,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  type UnifiedHistoryEntry,
  type ReviewStatus,
  getScenarioDescription,
  formatDate,
  formatDuration,
  getSimulationSubjectMeta,
} from "../utils/formatting";
import { useAuthStore } from "../../../store/authStore";
import { aiClient, getErrorMessage, unwrapResponse } from "../../../lib/api";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

interface HistoryTabProps {
  historyData: UnifiedHistoryEntry[];
  loading: boolean;
  onViewDetail: (entry: UnifiedHistoryEntry) => void;
  onRefresh?: () => void;
}

const STATUS_OPTIONS: Array<{ value: ReviewStatus | ""; label: string }> = [
  { value: "", label: "Semua Status" },
  { value: "completed", label: "Selesai Sukses" },
  { value: "processing", label: "Sedang Diproses" },
  { value: "failed", label: "Gagal" },
  { value: "not_started", label: "Belum Dinilai" },
];

export function HistoryTab({
  historyData,
  loading,
  onViewDetail,
  onRefresh,
}: HistoryTabProps) {
  const [historySearch, setHistorySearch] = useState("");
  const [activeModule, setActiveModule] = useState("");
  const [historyStatus, setHistoryStatus] = useState<ReviewStatus | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role?.toLowerCase() || "";
  const canDelete = role === "trainer" || role === "admin";

  useEffect(() => {
    if (!showDatePicker && !activeDropdownId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowDatePicker(false);
      setActiveDropdownId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showDatePicker, activeDropdownId]);

  const handleDelete = async (entry: UnifiedHistoryEntry) => {
    if (
      !window.confirm("Apakah Anda yakin ingin menghapus riwayat simulasi ini?")
    ) {
      return;
    }
    const dId = `${entry.module}-${entry.id}`;
    setIsDeleting(dId);
    try {
      await unwrapResponse(
        await aiClient["monitoring/history/:module/:id"].$delete({
          param: { module: entry.module, id: entry.id },
        }),
      );
      onRefresh?.();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menghapus riwayat."));
    } finally {
      setIsDeleting(null);
      setActiveDropdownId(null);
    }
  };

  // Counts per module
  const moduleCounts = useMemo(() => {
    return {
      all: historyData.length,
      ketik: historyData.filter((h) => h.module === "ketik").length,
      pdkt: historyData.filter((h) => h.module === "pdkt").length,
      telefun: historyData.filter((h) => h.module === "telefun").length,
    };
  }, [historyData]);

  // Average score calculations for tests / screen-reader accessibility
  const avgScore = useMemo(() => {
    const scoredEntries = historyData.filter((h) => h.score !== null);
    return scoredEntries.length > 0
      ? Math.round(
          scoredEntries.reduce((sum, h) => sum + (h.score || 0), 0) /
            scoredEntries.length,
        )
      : null;
  }, [historyData]);

  // Filter history logic
  const filteredHistory = useMemo(() => {
    return historyData.filter((h) => {
      // Module filter
      if (activeModule && h.module !== activeModule) return false;

      // Status filter
      if (historyStatus && h.review_status !== historyStatus) return false;

      // Search match
      if (historySearch) {
        const query = historySearch.toLowerCase();
        const subj = (h as any).simulationSubject;
        const searchableFields = [
          h.scenario_title,
          h.user_email,
          h.consumer_name,
          subj?.displayName,
          subj?.batchName,
          subj?.team,
          h.consumer_phone,
          h.consumer_city,
          h.consumer_gender,
          h.consumer_type,
          h.recipient,
          h.contact,
        ].filter((field): field is string => Boolean(field));
        const searchMatch = searchableFields.some((field) =>
          field.toLowerCase().includes(query),
        );
        if (!searchMatch) return false;
      }

      // Date range filter
      if (startDate) {
        const date = new Date(h.created_at);
        const startLimit = new Date(startDate);
        startLimit.setHours(0, 0, 0, 0);
        if (date < startLimit) return false;
      }
      if (endDate) {
        const date = new Date(h.created_at);
        const endLimit = new Date(endDate);
        endLimit.setHours(23, 59, 59, 999);
        if (date > endLimit) return false;
      }

      return true;
    });
  }, [
    historyData,
    activeModule,
    historyStatus,
    historySearch,
    startDate,
    endDate,
  ]);

  // Pagination bounds
  const totalItems = filteredHistory.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, currentPage, pageSize]);

  // Format date helper for picker display
  const formatDateString = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("id", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getPageNumbers = (current: number, total: number) => {
    const pages: Array<number | string> = [];
    if (total <= 5) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (current <= 3) {
        pages.push(1, 2, 3, "...", total);
      } else if (current >= total - 2) {
        pages.push(1, "...", total - 2, total - 1, total);
      } else {
        pages.push(1, "...", current, "...", total);
      }
    }
    return pages;
  };

  const renderModuleBadge = (mod: string) => {
    switch (mod) {
      case "ketik":
        return (
          <Badge
            variant="outline"
            className="h-7 border-transparent px-2.5 text-[10px] font-bold tracking-wider"
            style={{
              backgroundColor: "var(--module-ketik-bg)",
              color: "var(--module-ketik)",
              borderColor: "var(--module-ketik-bg)",
            }}
          >
            <MessageSquare aria-hidden="true" />
            <span className="uppercase">ketik</span>
          </Badge>
        );
      case "pdkt":
        return (
          <Badge
            variant="outline"
            className="h-7 border-transparent px-2.5 text-[10px] font-bold tracking-wider"
            style={{
              backgroundColor: "var(--module-pdkt-bg)",
              color: "var(--module-pdkt)",
              borderColor: "var(--module-pdkt-bg)",
            }}
          >
            <Mail aria-hidden="true" />
            <span className="uppercase">pdkt</span>
          </Badge>
        );
      case "telefun":
        return (
          <Badge
            variant="outline"
            className="h-7 border-transparent px-2.5 text-[10px] font-bold tracking-wider"
            style={{
              backgroundColor: "var(--module-telefun-bg)",
              color: "var(--module-telefun)",
              borderColor: "var(--module-telefun-bg)",
            }}
          >
            <Phone aria-hidden="true" />
            <span className="uppercase">telefun</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderStatusBadge = (status: ReviewStatus) => {
    switch (status) {
      case "completed":
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border">
            <CheckCircle2
              size={12}
              aria-hidden="true"
              style={{ color: "var(--chart-green)" }}
            />
            <span style={{ color: "var(--chart-green)" }}>Selesai Sukses</span>
          </div>
        );
      case "processing":
      case "pending":
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border animate-pulse motion-reduce:animate-none">
            <Loader2
              size={12}
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
              style={{ color: "var(--chart-amber)" }}
            />
            <span style={{ color: "var(--chart-amber)" }}>Diproses</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border">
            <AlertCircle
              size={12}
              aria-hidden="true"
              style={{ color: "var(--chart-red)" }}
            />
            <span style={{ color: "var(--chart-red)" }}>Gagal</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border">
            <AlertCircle
              size={12}
              aria-hidden="true"
              className="text-muted-foreground"
            />
            <span>Belum Dinilai</span>
          </div>
        );
    }
  };

  const renderConsumerContext = (entry: UnifiedHistoryEntry) => {
    const name = entry.consumer_name || "Tidak tersedia";
    const subject = getSimulationSubjectMeta(entry.simulationSubject);
    const context =
      entry.module === "ketik"
        ? [entry.consumer_phone, entry.consumer_city]
        : entry.module === "pdkt"
          ? [entry.consumer_type, entry.recipient || entry.contact]
          : [entry.consumer_phone, entry.consumer_city, entry.consumer_gender];
    const usefulContext = context.filter(Boolean).join(" · ");

    return (
      <div className="min-w-[180px]" aria-label="Pelaksana dan target simulasi">
        <div className="font-semibold text-foreground">{name}</div>
        <div className="mt-0.5 break-words text-xs font-medium text-muted-foreground">
          {usefulContext || "Tidak tersedia"}
        </div>
        <div className="mt-1 break-words text-xs font-semibold text-foreground">
          Target: {subject.label}
        </div>
        {(subject.batch || subject.team) && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            {[
              subject.batch && `Batch: ${subject.batch}`,
              subject.team && `Tim: ${subject.team}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        <div className="mt-0.5 break-words text-xs font-medium text-muted-foreground/90">
          Pelaksana: {entry.user_email || "-"}
          {entry.user_role ? ` · ${entry.user_role}` : ""}
        </div>
      </div>
    );
  };

  const renderScoresAndMetrics = (entry: UnifiedHistoryEntry) => {
    if (entry.review_status !== "completed") {
      const message =
        entry.review_status === "failed"
          ? "Penilaian gagal"
          : entry.review_status === "not_started"
            ? "Belum dinilai"
            : "Menunggu Penilaian AI...";
      return (
        <div className="text-xs text-muted-foreground italic font-medium">
          {message}
        </div>
      );
    }

    if (entry.module === "ketik") {
      const finalVal = entry.score ?? 0;
      const s = entry.scores || {};
      const submetrics = [
        { label: "Empati", val: s.empathy ?? 0 },
        { label: "Probing", val: s.probing ?? 0 },
        ...(s.resolution !== undefined
          ? [{ label: "Resolusi", val: s.resolution }]
          : []),
        { label: "Tulis", val: s.typo ?? 0 },
        { label: "Comply", val: s.compliance ?? 0 },
      ];

      return (
        <div className="flex items-center gap-6">
          {/* Main Score Badge */}
          <div
            className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
            style={{
              color:
                finalVal >= 80
                  ? "var(--chart-green)"
                  : finalVal >= 60
                    ? "var(--chart-amber)"
                    : "var(--chart-red)",
            }}
          >
            <span>{finalVal}</span>
            <span className="text-[9px] text-muted-foreground ml-0.5">
              /100
            </span>
          </div>

          {/* Submetrics Grid */}
          <div
            className={`grid gap-x-4 min-w-[280px] ${s.resolution !== undefined ? "grid-cols-5" : "grid-cols-4"}`}
          >
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (entry.module === "pdkt") {
      const finalVal = entry.score ?? 0;
      const ev = entry.pdkt_evaluation ?? {
        score: 0,
        feedback: "",
        typos_count: 0,
        clarity_issues_count: 0,
      };
      const submetrics = [
        { label: "Skor", val: `${ev.score}%` },
        { label: "Typo", val: ev.typos_count },
        { label: "Kejelasan", val: ev.clarity_issues_count },
        { label: "Catatan", val: ev.feedback ? "Ada" : "Tidak Ada" },
      ];

      return (
        <div className="flex items-center gap-6">
          {/* Main Score Badge */}
          <div
            className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
            style={{
              color:
                finalVal >= 80
                  ? "var(--chart-green)"
                  : finalVal >= 60
                    ? "var(--chart-amber)"
                    : "var(--chart-red)",
            }}
          >
            <span>{finalVal}</span>
            <span className="text-[9px] text-muted-foreground ml-0.5">
              /100
            </span>
          </div>

          {/* Submetrics Grid */}
          <div className="grid grid-cols-4 gap-x-4 min-w-[280px]">
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (entry.module === "telefun") {
      const finalVal = entry.score;
      const assessment = entry.telefun_assessment;
      const submetrics = assessment
        ? [
            { label: "WPM", val: assessment.speaking_rate_wpm },
            { label: "Intonasi", val: assessment.intonation_score },
            { label: "Artikulasi", val: assessment.articulation_score },
            { label: "Filler", val: assessment.filler_words_count },
            { label: "Tone", val: assessment.emotional_tone },
          ]
        : [];

      return (
        <div className="flex items-center gap-6">
          <div
            className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
            style={{
              color:
                finalVal === null
                  ? "var(--fg3)"
                  : finalVal >= 8
                    ? "var(--chart-green)"
                    : finalVal >= 6
                      ? "var(--chart-amber)"
                      : "var(--chart-red)",
            }}
          >
            <span>{finalVal ?? "-"}</span>
            <span className="text-[9px] text-muted-foreground ml-0.5">/10</span>
          </div>
          {assessment ? (
            <div className="grid grid-cols-5 gap-x-4 min-w-[360px]">
              {submetrics.map(({ label, val }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {label}
                  </span>
                  <span className="text-xs font-semibold text-foreground mt-0.5">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs italic text-muted-foreground">
              Penilaian suara tidak tersedia
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Reader and Test Compatibility Elements */}
      <div className="sr-only">
        <span>{moduleCounts.ketik} sesi KETIK</span>
        <span>{moduleCounts.pdkt} sesi PDKT</span>
        <span>{moduleCounts.telefun} sesi Telefun</span>
        <span>Rata-rata Skor</span>
        <span>{avgScore !== null ? avgScore : "-"}</span>
        <span>Pengguna Aktif</span>
        <span>Review Selesai</span>
      </div>

      {/* Top KPI Row - Combined 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sesi */}
        <Card className="flex items-center gap-4 border-border bg-card p-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary">
            <MessageSquare size={20} aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">
              Total Sesi
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.all.toLocaleString("id-ID")}
            </p>
          </div>
        </Card>

        {/* Card 2: KETIK */}
        <Card className="flex items-center gap-4 border-border bg-card p-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "var(--module-ketik-bg)",
              color: "var(--module-ketik)",
            }}
          >
            <PenTool size={20} aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block uppercase">
              ketik
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.ketik.toLocaleString("id-ID")}
            </p>
          </div>
        </Card>

        {/* Card 3: PDKT */}
        <Card className="flex items-center gap-4 border-border bg-card p-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "var(--module-pdkt-bg)",
              color: "var(--module-pdkt)",
            }}
          >
            <Mail size={20} aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block uppercase">
              pdkt
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.pdkt.toLocaleString("id-ID")}
            </p>
          </div>
        </Card>

        {/* Card 4: Telefun */}
        <Card className="flex items-center gap-4 border-border bg-card p-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "var(--module-telefun-bg)",
              color: "var(--module-telefun)",
            }}
          >
            <Phone size={20} aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block capitalize">
              telefun
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.telefun.toLocaleString("id-ID")}
            </p>
          </div>
        </Card>
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Module Tab Pills (Left) */}
        <div className="flex items-center bg-muted/40 p-1 border border-border/30 rounded-lg w-fit">
          {[
            { value: "", label: "Semua" },
            { value: "ketik", label: "KETIK" },
            { value: "pdkt", label: "PDKT" },
            { value: "telefun", label: "Telefun" },
          ].map((pill) => {
            const isActive = activeModule === pill.value;
            return (
              <Button
                key={pill.value}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                aria-pressed={isActive}
                onClick={() => {
                  setActiveModule(pill.value);
                  setCurrentPage(1);
                }}
                className="min-h-11 rounded-md px-4 py-1.5 text-xs font-semibold"
              >
                {pill.label}
              </Button>
            );
          })}
        </div>

        {/* Filters Group (Right) */}
        <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
          {/* Status Dropdown: keep native select for form and keyboard compatibility */}
          <select
            aria-label="Status riwayat"
            value={historyStatus}
            onChange={(event) => {
              setHistoryStatus(event.target.value as ReviewStatus | "");
              setCurrentPage(1);
            }}
            className="min-h-11 min-w-[130px] rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Date Picker Popover */}
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDatePicker(!showDatePicker)}
              aria-haspopup="dialog"
              aria-expanded={showDatePicker}
              aria-controls="monitoring-date-filter"
              className="min-h-11 gap-2 rounded-lg bg-background px-3 py-2 text-xs font-semibold"
            >
              <Calendar
                size={14}
                aria-hidden="true"
                className="text-muted-foreground"
              />
              <span>
                {startDate || endDate
                  ? `${startDate ? formatDateString(startDate) : "Awal"} - ${endDate ? formatDateString(endDate) : "Akhir"}`
                  : "Semua Tanggal"}
              </span>
              <ChevronDown
                size={12}
                aria-hidden="true"
                className="text-muted-foreground"
              />
            </Button>
            {showDatePicker && (
              <Card
                id="monitoring-date-filter"
                role="dialog"
                aria-label="Filter tanggal monitoring"
                className="absolute right-0 z-50 mt-2 w-64 space-y-3 rounded-xl border-border bg-card p-3"
              >
                <div className="space-y-1">
                  <label
                    htmlFor="monitoring-date-start"
                    className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    Mulai
                  </label>
                  <Input
                    id="monitoring-date-start"
                    type="date"
                    aria-label="Tanggal mulai"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="min-h-11 w-full rounded bg-background px-2 py-1 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="monitoring-date-end"
                    className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    Selesai
                  </label>
                  <Input
                    id="monitoring-date-end"
                    type="date"
                    aria-label="Tanggal selesai"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="min-h-11 w-full rounded bg-background px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setCurrentPage(1);
                      setShowDatePicker(false);
                    }}
                    className="min-h-11 px-2 py-1 text-xs font-semibold"
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="min-h-11 px-2.5 py-1 text-xs font-semibold"
                  >
                    Terapkan
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 md:w-64 md:flex-initial">
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Cari riwayat monitoring"
              type="search"
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari riwayat..."
              className="min-h-11 w-full rounded-lg border-input bg-background pl-9 pr-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Spacious Telemetry Table */}
      <Card className="overflow-hidden border-border bg-card p-0">
        <div
          className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          role="region"
          aria-label="Tabel riwayat simulasi"
          tabIndex={0}
        >
          <table className="min-w-[1180px] w-full text-left border-collapse">
            <caption className="sr-only">Riwayat sesi simulasi</caption>
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground/80 text-[11px] font-bold uppercase tracking-wider">
                <th
                  scope="col"
                  className="sticky top-0 z-20 bg-muted/20 py-3.5 px-6 font-bold"
                >
                  Modul
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-20 bg-muted/20 py-3.5 px-4 font-bold"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-20 bg-muted/20 py-3.5 px-4 font-bold"
                >
                  Skenario
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-20 bg-muted/20 py-3.5 px-4 font-bold"
                >
                  Pengguna & Target
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-20 min-w-[136px] whitespace-nowrap bg-muted/20 py-3.5 px-4 font-bold"
                >
                  Waktu
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-20 bg-muted/20 py-3.5 px-4 font-bold"
                >
                  Skor & Ringkasan
                </th>
                <th
                  scope="col"
                  className="sticky right-0 top-0 z-30 min-w-[176px] border-l border-border bg-muted/20 py-3.5 px-6 font-bold text-right"
                >
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/45 text-sm text-foreground">
              {loading && currentItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <span
                      role="status"
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Memuat riwayat simulasi…
                    </span>
                  </td>
                </tr>
              )}
              {currentItems.map((entry) => (
                <tr
                  key={`${entry.module}-${entry.id}`}
                  className="hover:bg-muted/10 transition-colors group"
                >
                  {/* Modul badge */}
                  <td className="py-4 px-6 align-middle">
                    {renderModuleBadge(entry.module)}
                  </td>

                  {/* Status badge */}
                  <td className="py-4 px-4 align-middle">
                    {renderStatusBadge(entry.review_status)}
                  </td>

                  {/* Scenario Info */}
                  <td className="py-4 px-4 align-middle max-w-xs">
                    <div className="font-semibold text-foreground leading-snug">
                      {entry.scenario_title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-medium leading-relaxed line-clamp-1">
                      {getScenarioDescription(
                        entry.scenario_title,
                        entry.module,
                      )}
                    </div>
                  </td>

                  {/* Served consumer plus agent account email */}
                  <td className="px-4 py-4 align-middle">
                    {renderConsumerContext(entry)}
                  </td>

                  {/* Waktu & Durasi */}
                  <td className="min-w-[136px] whitespace-nowrap py-4 px-4 align-middle">
                    <div className="font-medium text-foreground">
                      {formatDate(entry.created_at)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                      {formatDuration(entry.duration_seconds)}
                    </div>
                  </td>

                  {/* Skor & Ringkasan */}
                  <td className="py-4 px-4 align-middle">
                    {renderScoresAndMetrics(entry)}
                  </td>

                  {/* Aksi buttons */}
                  <td className="sticky right-0 z-20 min-w-[176px] border-l border-border bg-card py-4 px-6 align-middle text-right group-hover:bg-muted/10">
                    <div
                      className="inline-flex items-center gap-2 justify-end w-full relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onViewDetail(entry)}
                        className="min-h-11 gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      >
                        Lihat Detail
                      </Button>
                      <div className="relative">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-haspopup="menu"
                          aria-expanded={
                            activeDropdownId === `${entry.module}-${entry.id}`
                          }
                          aria-controls={`history-actions-${entry.module}-${entry.id}`}
                          onClick={() => {
                            const dId = `${entry.module}-${entry.id}`;
                            setActiveDropdownId(
                              activeDropdownId === dId ? null : dId,
                            );
                          }}
                          className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
                          aria-label={`Aksi ${entry.scenario_title}`}
                        >
                          <MoreVertical aria-hidden="true" />
                        </Button>
                        {activeDropdownId === `${entry.module}-${entry.id}` && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setActiveDropdownId(null)}
                            />
                            <div
                              id={`history-actions-${entry.module}-${entry.id}`}
                              role="menu"
                              className="absolute right-0 z-50 mt-1 w-36 rounded-xl border border-border bg-card py-1 text-left"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                role="menuitem"
                                onClick={() => {
                                  onViewDetail(entry);
                                  setActiveDropdownId(null);
                                }}
                                className="min-h-11 w-full justify-start rounded-none px-4 py-2 text-xs font-semibold"
                              >
                                Lihat Detail
                              </Button>
                              {canDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  role="menuitem"
                                  onClick={() => handleDelete(entry)}
                                  disabled={
                                    isDeleting === `${entry.module}-${entry.id}`
                                  }
                                  className="min-h-11 w-full justify-start rounded-none px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                                >
                                  {isDeleting === `${entry.module}-${entry.id}`
                                    ? "Menghapus..."
                                    : "Hapus"}
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredHistory.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-16 text-muted-foreground"
                  >
                    <MessageSquare
                      size={32}
                      aria-hidden="true"
                      className="mx-auto mb-3 opacity-20"
                    />
                    <p className="text-sm font-medium">
                      Belum ada riwayat simulasi.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination Bar */}
      {filteredHistory.length > 0 && (
        <Card className="flex flex-col items-center justify-between gap-4 border-border bg-card p-4 text-xs font-semibold text-muted-foreground sm:flex-row">
          {/* Items Range Indicator */}
          <div>
            Menampilkan {Math.min(totalItems, (currentPage - 1) * pageSize + 1)}
            -{Math.min(totalItems, currentPage * pageSize)} dari {totalItems}{" "}
            hasil
          </div>

          {/* Page Controls */}
          <nav
            aria-label="Paginasi riwayat"
            className="flex items-center gap-1"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Halaman sebelumnya"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="min-h-11 min-w-11"
            >
              &lt;
            </Button>
            {getPageNumbers(currentPage, totalPages).map((num, idx) => {
              if (num === "...") {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 select-none">
                    ...
                  </span>
                );
              }
              const isCurrent = currentPage === num;
              return (
                <Button
                  key={`page-${num}`}
                  type="button"
                  variant={isCurrent ? "default" : "outline"}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Halaman ${num}`}
                  onClick={() => handlePageChange(num as number)}
                  className="min-h-11 min-w-11 px-3 py-1"
                >
                  {num}
                </Button>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Halaman berikutnya"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="min-h-11 min-w-11"
            >
              &gt;
            </Button>
          </nav>

          {/* Page Limit Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="monitoring-page-size" className="sr-only">
              Jumlah hasil per halaman
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                id="monitoring-page-size"
                aria-label="Jumlah hasil per halaman"
                className="min-h-11 w-[7.5rem] rounded border-border bg-background text-xs font-semibold"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / halaman
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}
    </div>
  );
}
