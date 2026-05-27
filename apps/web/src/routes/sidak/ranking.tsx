import { useState, useMemo, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import type { TopAgentData, QAPeriod } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Calendar,
  LayoutGrid,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import QaStatePanel from "../../components/sidak/QaStatePanel";

const SERVICE_LABELS: Record<string, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

const MONTHS = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember",
];

interface RankingResponse {
  rankings: TopAgentData[];
  periods: QAPeriod[];
  folders: { id: string; name: string }[];
  availableYears: number[];
  availableServices?: string[];
}

type SortKey = "defects" | "nama" | "score";
type SortDirection = "asc" | "desc";

export default function SidakRankingPage() {
  const [selectedService, setSelectedService] = useState("call");
  const [selectedPeriod, setSelectedPeriod] = useState("ytd");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedFolder, setSelectedFolder] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("defects");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period", selectedPeriod);
    p.set("service_type", selectedService);
    p.set("year", String(selectedYear));
    p.set("folder", selectedFolder);
    return p.toString();
  }, [selectedService, selectedPeriod, selectedYear, selectedFolder]);

  const { data, loading } = useApi<RankingResponse>(
    `/sidak/ranking?${queryParams}`,
  );

  const availableServices = data?.availableServices ?? [];

  // Normalize invalid selections
  useEffect(() => {
    if (loading || !data) return;
    if (availableServices.length > 0 && !availableServices.includes(selectedService)) {
      setSelectedService(availableServices[0]);
    }
  }, [availableServices, selectedService, loading, data]);

  useEffect(() => {
    if (loading || !data) return;
    if (selectedFolder !== "ALL" && (data?.folders ?? []).length > 0) {
      const valid = (data?.folders ?? []).some((f) => f.id === selectedFolder);
      if (!valid) setSelectedFolder("ALL");
    }
  }, [data, selectedFolder, loading]);

  const rankings = data?.rankings;
  const sortedRankings = useMemo(() => {
    if (!rankings) return [];
    const collator = new Intl.Collator("id", {
      sensitivity: "base",
      numeric: true,
    });
    return [...rankings].sort((a, b) => {
      if (sortKey === "nama") {
        return sortDirection === "asc"
          ? collator.compare(a.nama, b.nama)
          : collator.compare(b.nama, a.nama);
      }
      if (sortKey === "score") {
        return sortDirection === "asc"
          ? a.score - b.score
          : b.score - a.score;
      }
      return sortDirection === "asc"
        ? a.defects - b.defects
        : b.defects - a.defects;
    });
  }, [rankings, sortKey, sortDirection]);

  const toggleSort = (key: SortKey, defaultDirection: SortDirection) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(defaultDirection);
    }
  };

  const renderSortIcon = (key: SortKey) => {
    const isActive = sortKey === key;
    if (!isActive) {
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="w-3.5 h-3.5" />
      : <ArrowDown className="w-3.5 h-3.5" />;
  };

  const scoreColor = (score: number) => {
    if (score >= 85) return "text-green-600 dark:text-green-400";
    if (score >= 70) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const isYearToDate = selectedPeriod === "ytd";
  const scoreColumnLabel = isYearToDate ? "Rata-rata Skor QA" : "Skor QA";

  const periodsForYear = data?.periods?.filter(
    (p) => p.year === selectedYear,
  ) ?? [];

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-1"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground/90">
                  Ranking Agen
                </h1>
              </div>
              <p className="text-muted-foreground pl-12 text-sm md:text-base font-medium">
                Peringkat agen berdasarkan jumlah temuan QA. Klik nama atau skor
                QA untuk mengubah urutan.
              </p>
            </motion.div>
          </div>

          {/* FILTER BAR */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-1 rounded-[2rem] bg-background/40 backdrop-blur-3xl border border-white/20 shadow-2xl overflow-hidden"
          >
            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Layanan */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                  <LayoutGrid className="w-3 h-3" /> Layanan
                </label>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="w-full h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 rounded-2xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-semibold text-sm cursor-pointer"
                >
                  {(availableServices.length > 0
                    ? availableServices
                    : Object.keys(SERVICE_LABELS)
                  ).map((st) => (
                    <option key={st} value={st}>
                      {SERVICE_LABELS[st] || st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Periode */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                  <Calendar className="w-3 h-3" /> Periode
                </label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 rounded-2xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-semibold text-sm cursor-pointer"
                >
                  <option value="ytd">Year to Date (YTD)</option>
                  <option value="alltime">All Time</option>
                  <optgroup label="Bulan">
                    {periodsForYear.map((p) => (
                      <option key={p.id} value={p.id}>
                        {MONTHS[(p.month ?? 1) - 1]} {p.year}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Tahun */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                  <Calendar className="w-3 h-3" /> Tahun
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 rounded-2xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-semibold text-sm cursor-pointer"
                >
                  {(data?.availableYears ?? []).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Folder/Tim */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                  <Users className="w-3 h-3" /> Folder/Tim
                </label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 rounded-2xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-semibold text-sm cursor-pointer"
                >
                  <option value="ALL">Semua Tim</option>
                  {(data?.folders ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>

          {/* RANKING TABLE */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background/40 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] shadow-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/50 dark:bg-black/20">
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 w-16">
                      Rank
                    </th>
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      <button
                        type="button"
                        onClick={() => toggleSort("nama", "asc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        Agen
                        {renderSortIcon("nama")}
                      </button>
                    </th>
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Tim/Batch
                    </th>
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("defects", "desc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        Total Temuan
                        {renderSortIcon("defects")}
                      </button>
                    </th>
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("score", "desc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        {scoreColumnLabel}
                        {renderSortIcon("score")}
                      </button>
                    </th>
                    <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  <AnimatePresence mode="wait">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <motion.tr
                          key={`skeleton-${i}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={6} className="px-6 py-8">
                            <div className="h-6 bg-foreground/5 rounded-lg w-full animate-pulse" />
                          </td>
                        </motion.tr>
                      ))
                    ) : sortedRankings.length > 0 ? (
                      sortedRankings.map((agent, i) => {
                        const rank = i + 1;
                        const isTop3 = rank <= 3;
                        return (
                          <motion.tr
                            key={agent.agentId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => {
                              window.location.href = `/sidak/agents/${agent.agentId}`;
                            }}
                            className={`group cursor-pointer hover:bg-primary/5 transition-all duration-200 ${isTop3 ? "bg-primary/5" : ""}`}
                          >
                            <td className="px-6 py-5">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                  rank === 1
                                    ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
                                    : rank === 2
                                      ? "bg-slate-400/20 text-slate-600 dark:text-slate-400"
                                      : rank === 3
                                        ? "bg-orange-400/20 text-orange-600 dark:text-orange-400"
                                        : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {rank}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="font-bold text-foreground/80 group-hover:text-primary transition-colors">
                                {agent.nama}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="text-xs font-semibold px-2 py-1 bg-foreground/5 rounded-md inline-block">
                                {agent.batch}
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right font-mono font-bold text-foreground/80">
                              {agent.defects}
                            </td>
                            <td
                              className={`px-6 py-5 text-right font-bold ${scoreColor(agent.score)}`}
                            >
                              {agent.score.toFixed(1)}%
                            </td>
                            <td className="px-6 py-5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {selectedPeriod !== "alltime" && agent.rankChange !== undefined && (
                                  <>
                                    {typeof agent.rankChange === 'number' && agent.rankChange > 0 && (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-black border border-red-500/20"
                                          title="Posisi defects naik (kinerja memburuk)"
                                        >
                                          ▲ +{agent.rankChange}
                                        </motion.span>
                                        <span className="text-[9px] text-muted-foreground whitespace-nowrap font-medium">
                                          Sebelumnya Posisi {(index + 1) + agent.rankChange}
                                        </span>
                                      </div>
                                    )}
                                    {typeof agent.rankChange === 'number' && agent.rankChange < 0 && (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/20"
                                          title="Posisi defects turun (kinerja membaik)"
                                        >
                                          ▼ {agent.rankChange}
                                        </motion.span>
                                        <span className="text-[9px] text-muted-foreground whitespace-nowrap font-medium">
                                          Sebelumnya Posisi {(index + 1) + agent.rankChange}
                                        </span>
                                      </div>
                                    )}
                                    {agent.rankChange === 0 && (
                                      <span className="text-muted-foreground text-xs font-bold" title="Posisi tetap">
                                        -
                                      </span>
                                    )}
                                    {agent.rankChange === null && (
                                      <motion.span
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black border border-blue-500/20"
                                        title="Agen baru dinilai pada periode ini"
                                      >
                                        Baru
                                      </motion.span>
                                    )}
                                  </>
                                )}
                                {agent.hasCritical && (
                                  <motion.span
                                    initial={{ scale: 0.8 }}
                                    animate={{ scale: 1 }}
                                    className="px-2 py-1 bg-red-500 text-white text-[10px] font-black uppercase tracking-tighter rounded-full shadow-lg shadow-red-500/20"
                                  >
                                    Fatal
                                  </motion.span>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    ) : (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <td colSpan={6} className="px-6 py-24 text-center">
                          <QaStatePanel
                            type="empty"
                            title="Data ranking belum tersedia untuk filter ini"
                            description="Ubah layanan, periode, tahun, atau folder untuk menampilkan data ranking agen."
                            className="mx-auto max-w-md text-left"
                          />
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
