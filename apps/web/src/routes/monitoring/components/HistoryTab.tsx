import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  History,
  Search,
  Users,
  MessageCircle,
  Mail,
  Phone,
} from "lucide-react";
import {
  type UnifiedHistoryEntry,
  type ReviewStatus,
  getScoreGrade,
} from "../utils/formatting";
import { HistoryCard } from "./HistoryCard";

interface HistoryTabProps {
  historyData: UnifiedHistoryEntry[];
  loading: boolean;
  onViewDetail: (entry: UnifiedHistoryEntry) => void;
}

const STATUS_OPTIONS: Array<{ value: ReviewStatus | ""; label: string }> = [
  { value: "", label: "Semua Status" },
  { value: "completed", label: "Sudah Dinilai" },
  { value: "not_started", label: "Belum Dinilai" },
  { value: "processing", label: "Sedang Diproses" },
  { value: "failed", label: "Gagal" },
];

export function HistoryTab({ historyData, loading, onViewDetail }: HistoryTabProps) {
  const [historySearch, setHistorySearch] = useState("");
  const [historyModule, setHistoryModule] = useState("");
  const [historyStatus, setHistoryStatus] = useState<ReviewStatus | "">("");
  const [modulePill, setModulePill] = useState("");

  // Sync module pill with dropdown
  const activeModule = modulePill || historyModule;

  const filteredHistory = useMemo(() => {
    return historyData.filter((h) => {
      const searchMatch =
        h.scenario_title
          ?.toLowerCase()
          .includes(historySearch.toLowerCase()) ||
        h.user_email?.toLowerCase().includes(historySearch.toLowerCase());
      const moduleMatch = activeModule ? h.module === activeModule : true;
      const statusMatch = historyStatus
        ? h.review_status === historyStatus
        : true;
      return searchMatch && moduleMatch && statusMatch;
    });
  }, [historyData, historySearch, activeModule, historyStatus]);

  // KPI calculations
  const kpi = useMemo(() => {
    const totalSessions = historyData.length;
    const uniqueUsers = new Set(historyData.map((h) => h.user_id)).size;
    const reviewedCount = historyData.filter(
      (h) => h.review_status === "completed",
    ).length;

    const scoredEntries = historyData.filter((h) => h.score !== null);
    const avgScore =
      scoredEntries.length > 0
        ? Math.round(
            scoredEntries.reduce((sum, h) => sum + (h.score || 0), 0) /
              scoredEntries.length,
          )
        : null;

    return { totalSessions, uniqueUsers, avgScore, reviewedCount };
  }, [historyData]);

  // Per-module stats
  const moduleStats = useMemo(() => {
    const stats: Record<
      string,
      {
        count: number;
        avgScore: number | null;
        keyMetric: string;
      }
    > = {};

    for (const mod of ["ketik", "pdkt", "telefun"]) {
      const entries = historyData.filter((h) => h.module === mod);
      const scored = entries.filter((h) => h.score !== null);
      const avg =
        scored.length > 0
          ? Math.round(
              scored.reduce((s, h) => s + (h.score || 0), 0) / scored.length,
            )
          : null;

      let keyMetric = "";
      if (mod === "ketik") {
        const withScores = entries.filter(
          (h) => h.scores?.empathy !== undefined,
        );
        if (withScores.length > 0) {
          const avgEmpathy = Math.round(
            withScores.reduce((s, h) => s + (h.scores?.empathy || 0), 0) /
              withScores.length,
          );
          keyMetric = `Rata Empati: ${avgEmpathy}`;
        }
      } else if (mod === "pdkt") {
        const withEval = entries.filter((h) => h.pdkt_evaluation);
        const totalTypos = withEval.reduce(
          (s, h) => s + (h.pdkt_evaluation?.typos_count || 0),
          0,
        );
        keyMetric =
          withEval.length > 0
            ? `${totalTypos} total typo`
            : "Belum ada evaluasi";
      } else if (mod === "telefun") {
        const withAssess = entries.filter((h) => h.telefun_assessment);
        if (withAssess.length > 0) {
          const avgWpm = Math.round(
            withAssess.reduce(
              (s, h) => s + (h.telefun_assessment?.speaking_rate_wpm || 0),
              0,
            ) / withAssess.length,
          );
          keyMetric = `Rata WPM: ${avgWpm}`;
        }
      }

      stats[mod] = { count: entries.length, avgScore: avg, keyMetric };
    }
    return stats;
  }, [historyData]);

  const handlePillClick = (mod: string) => {
    const newModule = modulePill === mod ? "" : mod;
    setModulePill(newModule);
    setHistoryModule(newModule);
  };

  const modulePills = [
    { value: "", label: "Semua", icon: null },
    { value: "ketik", label: "KETIK", icon: MessageCircle },
    { value: "pdkt", label: "PDKT", icon: Mail },
    { value: "telefun", label: "Telefun", icon: Phone },
  ];

  return (
    <div className="space-y-6">
      {/* Accessible Screen Reader Module Sessions Count */}
      <div className="sr-only">
        <span>{moduleStats.ketik.count} sesi KETIK</span>
        <span>{moduleStats.pdkt.count} sesi PDKT</span>
        <span>{moduleStats.telefun.count} sesi Telefun</span>
      </div>

      {/* Top KPI Row - Combined 4 Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sesi */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Total Sesi
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {kpi.totalSessions}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2.5">
            Sesi simulasi terdaftar
          </p>
        </div>

        {/* Card 2: Pengguna Aktif */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Pengguna Aktif
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {kpi.uniqueUsers}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2.5">
            Peserta unik berpartisipasi
          </p>
        </div>

        {/* Card 3: Rata-rata Skor */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Rata-rata Skor
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {kpi.avgScore !== null ? (
                <span className={getScoreGrade(kpi.avgScore).color}>
                  {kpi.avgScore}
                </span>
              ) : (
                "-"
              )}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2.5">
            Rata-rata seluruh modul
          </p>
        </div>

        {/* Card 4: Review Selesai */}
        <div className="bg-card rounded-xl border border-border/50 p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              Review Selesai
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {kpi.reviewedCount}
              <span className="text-xs text-muted-foreground/55 font-medium ml-1">
                /{kpi.totalSessions}
              </span>
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2.5">
            Sesi berhasil dievaluasi AI
          </p>
        </div>
      </div>

      {/* Sleek Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 p-2 rounded-xl border border-border/40">
        {/* Module Segmented Control */}
        <div className="flex items-center bg-background rounded-lg p-1 border border-border/30 w-fit">
          {modulePills.map(({ value, label }) => {
            const count =
              value === ""
                ? historyData.length
                : moduleStats[value]?.count ?? 0;
            const isActive = activeModule === value;
            return (
              <button
                key={value}
                onClick={() => handlePillClick(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-secondary text-foreground shadow-sm animate-fade-in"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                    isActive
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={historyStatus}
            onChange={(e) =>
              setHistoryStatus(e.target.value as ReviewStatus | "")
            }
            className="px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground cursor-pointer min-w-[130px]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="relative flex-1 md:w-64 md:flex-initial">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Cari riwayat..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-border/80 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredHistory.map((h) => (
            <HistoryCard
              key={`${h.module}-${h.id}`}
              entry={h}
              onViewDetail={onViewDetail}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredHistory.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <History size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Belum ada riwayat simulasi.</p>
        </div>
      )}
    </div>
  );
}
