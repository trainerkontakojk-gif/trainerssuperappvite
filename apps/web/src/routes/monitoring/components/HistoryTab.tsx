import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  History,
  Search,
  Users,
  TrendingUp,
  CheckCircle2,
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
      {/* Top KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            Total Sesi
          </span>
          <p className="text-3xl font-black">{kpi.totalSessions}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <Users size={12} className="inline mr-1" />
            Pengguna Aktif
          </span>
          <p className="text-3xl font-black">{kpi.uniqueUsers}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <TrendingUp size={12} className="inline mr-1" />
            Rata-rata Skor
          </span>
          <p className="text-3xl font-black">
            {kpi.avgScore !== null ? (
              <span className={getScoreGrade(kpi.avgScore).color}>
                {kpi.avgScore}
              </span>
            ) : (
              "-"
            )}
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">
            <CheckCircle2 size={12} className="inline mr-1" />
            Review Selesai
          </span>
          <p className="text-3xl font-black">
            {kpi.reviewedCount}
            <span className="text-base text-muted-foreground/40 font-bold ml-1">
              /{kpi.totalSessions}
            </span>
          </p>
        </div>
      </div>

      {/* Per-Module Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            mod: "ketik",
            label: "KETIK",
            icon: MessageCircle,
            color: "module-ketik",
          },
          {
            mod: "pdkt",
            label: "PDKT",
            icon: Mail,
            color: "module-pdkt",
          },
          {
            mod: "telefun",
            label: "Telefun",
            icon: Phone,
            color: "module-telefun",
          },
        ].map(({ mod, label, icon: Icon, color }) => {
          const stat = moduleStats[mod];
          return (
            <div
              key={mod}
              className={`bg-card rounded-2xl border border-border p-5 flex items-center gap-4 ${
                activeModule === mod ? `ring-2 ring-${color}/30 border-${color}/40` : ""
              }`}
            >
              <div
                className={`w-12 h-12 bg-${color}/10 rounded-xl flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-6 h-6 text-${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black">{stat.count}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    sesi {label}
                  </span>
                </div>
                {stat.avgScore !== null ? (
                  <span className={`text-sm font-black ${getScoreGrade(stat.avgScore).color}`}>
                    Avg: {stat.avgScore}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/40">
                    Belum ada skor
                  </span>
                )}
                {stat.keyMetric && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                    {stat.keyMetric}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Module Pill Filter + Status/Search Filters */}
      <div className="space-y-3">
        {/* Module Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {modulePills.map(({ value, label, icon: Icon }) => {
            const count =
              value === ""
                ? historyData.length
                : moduleStats[value]?.count ?? 0;
            const isActive = activeModule === value;
            return (
              <button
                key={value}
                onClick={() => handlePillClick(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                {Icon && <Icon size={12} />}
                {label}
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    isActive
                      ? "bg-background/20 text-background"
                      : "bg-foreground/5 text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status + Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={historyStatus}
            onChange={(e) =>
              setHistoryStatus(e.target.value as ReviewStatus | "")
            }
            className="px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Cari riwayat..."
              className="w-full pl-12 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
