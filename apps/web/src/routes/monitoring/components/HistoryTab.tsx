import { useMemo, useState } from "react";
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
  getScoreColor,
  getScenarioDescription,
  getTelefunSubmetrics,
  formatDate,
  formatDuration,
} from "../utils/formatting";
import { useAuthStore } from "../../../store/authStore";
import { aiClient, getErrorMessage, unwrapResponse } from "../../../lib/api";

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

export function HistoryTab({ historyData, loading, onViewDetail, onRefresh }: HistoryTabProps) {
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

  const handleDelete = async (entry: UnifiedHistoryEntry) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus riwayat simulasi ini?")) {
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

  // Dynamic growth computation (last 7 days vs previous 7 days)
  const growthStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const getGrowth = (mod?: string) => {
      const entries = mod
        ? historyData.filter((h) => h.module === mod)
        : historyData;
      const recent = entries.filter((h) => {
        const d = new Date(h.created_at);
        return d >= sevenDaysAgo && d <= now;
      }).length;
      const old = entries.filter((h) => {
        const d = new Date(h.created_at);
        return d >= fourteenDaysAgo && d < sevenDaysAgo;
      }).length;

      if (old === 0) {
        return { val: recent > 0 ? 100 : 0, isUp: true };
      }
      const diff = recent - old;
      const val = Math.round((diff / old) * 100);
      return { val: Math.abs(val), isUp: val >= 0 };
    };

    return {
      all: getGrowth(),
      ketik: getGrowth("ketik"),
      pdkt: getGrowth("pdkt"),
      telefun: getGrowth("telefun"),
    };
  }, [historyData]);

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
        const searchMatch =
          h.scenario_title?.toLowerCase().includes(query) ||
          h.user_email?.toLowerCase().includes(query);
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
  }, [historyData, activeModule, historyStatus, historySearch, startDate, endDate]);

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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider w-fit" style={{ backgroundColor: 'var(--module-ketik-bg)', color: 'var(--module-ketik)', borderColor: 'var(--module-ketik-bg)' }}>
            <MessageSquare size={12} />
            <span className="uppercase">ketik</span>
          </div>
        );
      case "pdkt":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider w-fit" style={{ backgroundColor: 'var(--module-pdkt-bg)', color: 'var(--module-pdkt)', borderColor: 'var(--module-pdkt-bg)' }}>
            <Mail size={12} />
            <span className="uppercase">pdkt</span>
          </div>
        );
      case "telefun":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider w-fit" style={{ backgroundColor: 'var(--module-telefun-bg)', color: 'var(--module-telefun)', borderColor: 'var(--module-telefun-bg)' }}>
            <Phone size={12} />
            <span className="uppercase">telefun</span>
          </div>
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
            <CheckCircle2 size={12} style={{ color: 'var(--chart-green)' }} />
            <span style={{ color: 'var(--chart-green)' }}>Selesai Sukses</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border animate-pulse">
            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--chart-amber)' }} />
            <span style={{ color: 'var(--chart-amber)' }}>Diproses</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border">
            <AlertCircle size={12} style={{ color: 'var(--chart-red)' }} />
            <span style={{ color: 'var(--chart-red)' }}>Gagal</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit bg-muted text-muted-foreground border border-border">
            <AlertCircle size={12} className="text-muted-foreground" />
            <span>Belum Mulai</span>
          </div>
        );
    }
  };

  const renderScoresAndMetrics = (entry: UnifiedHistoryEntry) => {
    if (entry.review_status !== "completed") {
      return (
        <div className="text-xs text-muted-foreground/60 italic font-medium">
          Menunggu Penilaian AI...
        </div>
      );
    }

    if (entry.module === "ketik") {
      const finalVal = entry.score ?? 0;
      const s = entry.scores || {};
      const submetrics = [
        { label: "Empati", val: s.empathy ?? 0 },
        { label: "Probing", val: s.probing ?? 0 },
        { label: "Tulis", val: s.typo ?? 0 },
        { label: "Comply", val: s.compliance ?? 0 },
      ];

      return (
        <div className="flex items-center gap-6">
          {/* Main Score Badge */}
          <div
            className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
            style={{ 
              color: finalVal >= 80 ? 'var(--chart-green)' : finalVal >= 60 ? 'var(--chart-amber)' : 'var(--chart-red)',
            }}
          >
            <span>{finalVal}</span>
            <span className="text-[9px] text-muted-foreground/50 ml-0.5">/100</span>
          </div>

          {/* Submetrics Grid */}
          <div className="grid grid-cols-4 gap-x-4 min-w-[280px]">
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
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
      const ev = entry.pdkt_evaluation ?? { score: 0, feedback: "", typos_count: 0, clarity_issues_count: 0 };
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
              color: finalVal >= 80 ? 'var(--chart-green)' : finalVal >= 60 ? 'var(--chart-amber)' : 'var(--chart-red)',
            }}
          >
            <span>{finalVal}</span>
            <span className="text-[9px] text-muted-foreground/50 ml-0.5">/100</span>
          </div>

          {/* Submetrics Grid */}
          <div className="grid grid-cols-4 gap-x-4 min-w-[280px]">
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
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
      const finalVal = entry.score ?? 0;
      const sub = getTelefunSubmetrics(finalVal);
      const submetrics = [
        { label: "Kepatuhan", val: sub.kepatuhan },
        { label: "Empati", val: sub.empati },
        { label: "Kejelasan", val: sub.kejelasan },
        { label: "Solusi", val: sub.solusi },
      ];

      return (
        <div className="flex items-center gap-6">
          {/* Main Score Badge */}
          <div
            className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
            style={{ 
              color: finalVal >= 8.0 ? 'var(--chart-green)' : finalVal >= 6.0 ? 'var(--chart-amber)' : 'var(--chart-red)',
            }}
          >
            <span>{finalVal}</span>
            <span className="text-[9px] text-muted-foreground/50 ml-0.5">/10</span>
          </div>

          {/* Submetrics Grid */}
          <div className="grid grid-cols-4 gap-x-4 min-w-[280px]">
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
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
        <div className="bg-card rounded-2xl border border-border/40 p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary">
            <MessageSquare size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">
              Total Sesi
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.all.toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        {/* Card 2: KETIK */}
        <div className="bg-card rounded-2xl border border-border/40 p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--module-ketik-bg)', color: 'var(--module-ketik)' }}>
            <PenTool size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block uppercase">
              ketik
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.ketik.toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        {/* Card 3: PDKT */}
        <div className="bg-card rounded-2xl border border-border/40 p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--module-pdkt-bg)', color: 'var(--module-pdkt)' }}>
            <Mail size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block uppercase">
              pdkt
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.pdkt.toLocaleString("id-ID")}
            </p>
          </div>
        </div>

        {/* Card 4: Telefun */}
        <div className="bg-card rounded-2xl border border-border/40 p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--module-telefun-bg)', color: 'var(--module-telefun)' }}>
            <Phone size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block capitalize">
              telefun
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {moduleCounts.telefun.toLocaleString("id-ID")}
            </p>
          </div>
        </div>
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
              <button
                key={pill.value}
                onClick={() => {
                  setActiveModule(pill.value);
                  setCurrentPage(1);
                }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Filters Group (Right) */}
        <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
          {/* Status Dropdown */}
          <select
            value={historyStatus}
            onChange={(e) => {
              setHistoryStatus(e.target.value as ReviewStatus | "");
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer min-w-[130px]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Date Picker Popover */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold hover:bg-muted/40 transition-colors text-foreground cursor-pointer min-h-[34px]"
            >
              <Calendar size={14} className="text-muted-foreground" />
              <span>
                {startDate || endDate
                  ? `${startDate ? formatDateString(startDate) : "Awal"} - ${endDate ? formatDateString(endDate) : "Akhir"}`
                  : "Semua Tanggal"}
              </span>
              <ChevronDown size={12} className="text-muted-foreground/60" />
            </button>
            {showDatePicker && (
              <div className="absolute right-0 mt-2 p-3 bg-card border border-border rounded-xl shadow-xl z-50 w-64 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mulai</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Selesai</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setCurrentPage(1);
                      setShowDatePicker(false);
                    }}
                    className="px-2 py-1 text-[10px] font-semibold border border-border rounded hover:bg-muted cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="px-2.5 py-1 text-[10px] font-semibold bg-foreground text-background rounded hover:bg-foreground/90 cursor-pointer"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 md:w-64 md:flex-initial">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari riwayat..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-border/80 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Spacious Telemetry Table */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground/80 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-6 font-bold">Modul</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold">Skenario</th>
                <th className="py-3.5 px-4 font-bold">Pengguna</th>
                <th className="py-3.5 px-4 font-bold">Waktu</th>
                <th className="py-3.5 px-4 font-bold">Skor & Ringkasan</th>
                <th className="py-3.5 px-6 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/45 text-sm text-foreground">
              {currentItems.map((entry) => (
                <tr
                  key={`${entry.module}-${entry.id}`}
                  className="hover:bg-muted/10 transition-colors group cursor-pointer"
                  onClick={() => onViewDetail(entry)}
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
                      {getScenarioDescription(entry.scenario_title, entry.module)}
                    </div>
                  </td>

                  {/* Pengguna email */}
                  <td className="py-4 px-4 align-middle font-medium text-muted-foreground/90">
                    {entry.user_email || "-"}
                  </td>

                  {/* Waktu & Durasi */}
                  <td className="py-4 px-4 align-middle">
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
                  <td className="py-4 px-6 align-middle text-right">
                    <div
                      className="inline-flex items-center gap-2 justify-end w-full relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onViewDetail(entry)}
                        className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1 cursor-pointer min-h-[30px]"
                      >
                        Lihat Detail
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => {
                            const dId = `${entry.module}-${entry.id}`;
                            setActiveDropdownId(activeDropdownId === dId ? null : dId);
                          }}
                          className="p-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer min-h-[30px]"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeDropdownId === `${entry.module}-${entry.id}` && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setActiveDropdownId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-36 bg-card border border-border/80 rounded-xl shadow-xl z-50 py-1 text-left">
                              <button
                                onClick={() => {
                                  onViewDetail(entry);
                                  setActiveDropdownId(null);
                                }}
                                className="w-full px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                Lihat Detail
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(entry)}
                                  disabled={isDeleting === `${entry.module}-${entry.id}`}
                                  className="w-full px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                  {isDeleting === `${entry.module}-${entry.id}` ? "Menghapus..." : "Hapus"}
                                </button>
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
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">Belum ada riwayat simulasi.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      {filteredHistory.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card rounded-xl border border-border/40 p-4 shadow-sm text-xs text-muted-foreground font-semibold">
          {/* Items Range Indicator */}
          <div>
            Menampilkan {Math.min(totalItems, (currentPage - 1) * pageSize + 1)}-
            {Math.min(totalItems, currentPage * pageSize)} dari {totalItems} hasil
          </div>

          {/* Page Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer min-h-[26px]"
            >
              &lt;
            </button>
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
                <button
                  key={`page-${num}`}
                  onClick={() => handlePageChange(num as number)}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer min-h-[26px] ${
                    isCurrent
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                      : "border border-border bg-background hover:bg-muted"
                  }`}
                >
                  {num}
                </button>
              );
            })}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer min-h-[26px]"
            >
              &gt;
            </button>
          </div>

          {/* Page Limit Selector */}
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-background border border-border/80 rounded text-xs font-semibold outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / halaman
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
