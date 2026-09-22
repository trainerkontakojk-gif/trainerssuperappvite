import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useApi } from "../../hooks/useApi";
import { DEFAULT_SERVICE_FOLDER_MAP } from "../../lib/scoring";
import type { TopAgentData, QAPeriod } from "@trainers/types";
import {
  buildSidakFolderSelectGroups,
  findPrimarySidakFolderByName,
  normalizeSidakFolderOptions,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";
import { motion, AnimatePresence } from "framer-motion";
import {
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
  folders: { id: string; name: string; parent_id?: string | null }[];
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
  const initialFolderSetRef = useRef(false);
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

  const [allFolders, setAllFolders] = useState<NormalizedSidakFolderOption[]>([]);

  useEffect(() => {
    if (data?.folders) {
      const normalizedFolders = normalizeSidakFolderOptions(data.folders);
      if (
        selectedFolder === "ALL" ||
        normalizedFolders.length > allFolders.length
      ) {
        setAllFolders(normalizedFolders);
      }
    }
  }, [data?.folders, selectedFolder, allFolders.length]);

  const availableServices = useMemo(
    () => data?.availableServices ?? [],
    [data?.availableServices],
  );
  const leaderLockedService =
    availableServices.length === 1 ? availableServices[0] : undefined;
  const effectiveService = leaderLockedService ?? selectedService;

  const { groupedFolders, standaloneFolders } = useMemo(
    () => buildSidakFolderSelectGroups(allFolders),
    [allFolders],
  );

  // Normalize invalid selections
  useEffect(() => {
    if (loading || !data) return;
    if (availableServices.length > 0 && !availableServices.includes(selectedService)) {
      setSelectedService(availableServices[0]);
    }
  }, [availableServices, selectedService, loading, data]);

  useEffect(() => {
    if (loading) return;
    const folders = allFolders;
    if (folders.length > 0) {
      if (selectedFolder !== "ALL") {
        const valid = folders.some((f) => f.id === selectedFolder);
        if (!valid) setSelectedFolder("ALL");
      }

      // Default folder pairing on initial load/mount when data is fetched
      if (!initialFolderSetRef.current && selectedFolder === "ALL") {
        const matchedFolder = findPrimarySidakFolderByName(
          folders,
          DEFAULT_SERVICE_FOLDER_MAP[effectiveService],
        );
        if (matchedFolder) {
          setSelectedFolder(matchedFolder.id);
          initialFolderSetRef.current = true;
        }
      }
    }
  }, [allFolders, selectedFolder, loading, effectiveService]);

  const rankings = data?.rankings;
  const businessRanks = useMemo(() => {
    if (!rankings) return new Map<string, number>();

    const collator = new Intl.Collator("id", {
      sensitivity: "base",
      numeric: true,
    });
    const businessOrder = [...rankings].sort(
      (a, b) => b.defects - a.defects || collator.compare(a.nama, b.nama),
    );
    const ranks = new Map<string, number>();
    let previousDefects: number | undefined;
    let previousRank = 0;

    businessOrder.forEach((agent, index) => {
      const rank =
        index > 0 && agent.defects === previousDefects
          ? previousRank
          : index + 1;
      ranks.set(agent.agentId, rank);
      previousDefects = agent.defects;
      previousRank = rank;
    });

    return ranks;
  }, [rankings]);

  const tiedNamesByAgent = useMemo(() => {
    const result = new Map<string, string[]>();
    if (!rankings) return result;

    const groups = new Map<number, string[]>();
    rankings.forEach((agent) => {
      const names = groups.get(agent.defects) ?? [];
      names.push(agent.nama);
      groups.set(agent.defects, names);
    });

    rankings.forEach((agent) => {
      const names = (groups.get(agent.defects) ?? [])
        .filter((name) => name !== agent.nama)
        .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
      if (names.length > 0) result.set(agent.agentId, names);
    });

    return result;
  }, [rankings]);

  const formatTieLabel = (rank: number, names: string[]) => {
    if (names.length === 0) return null;
    const peerLabel =
      names.length <= 2
        ? names.join(" dan ")
        : `${names[0]} dan ${names.length - 1} agen lain`;
    return `Berbagi peringkat ${rank} dengan ${peerLabel}`;
  };

  const showBatchColumn = useMemo(() => {
    const batches = new Set(
      (rankings ?? []).map((agent) => agent.batch?.trim()).filter(Boolean),
    );
    return batches.size > 1;
  }, [rankings]);

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
      <div className="flex-1 overflow-y-auto p-4 pb-14 md:p-8 md:pb-10 lg:pb-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-outfit text-2xl font-bold tracking-tight text-foreground">
              Ranking prioritas temuan
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Temuan terbanyak berada di peringkat teratas. Jumlah temuan yang sama berbagi peringkat.
            </p>
          </header>

          {/* FILTER BAR */}
          <section aria-label="Filter ranking" className="border-y border-border py-4 md:py-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Layanan */}
              <div className="space-y-2">
                <label htmlFor="sidak-ranking-service" className="text-xs font-semibold text-foreground">Layanan</label>
                <select
                  id="sidak-ranking-service"
                  value={leaderLockedService ?? selectedService}
                  onChange={(e) => {
                    if (leaderLockedService) return;
                    const svc = e.target.value;
                    setSelectedService(svc);
                    const targetFolderName = DEFAULT_SERVICE_FOLDER_MAP[svc];
                    const folders = allFolders;
                    if (targetFolderName && folders.length > 0) {
                      const matchedFolder = folders.find(
                        (f) => f.name.toLowerCase() === targetFolderName.toLowerCase()
                      );
                      if (matchedFolder) {
                        setSelectedFolder(matchedFolder.id);
                      } else {
                        setSelectedFolder("ALL");
                      }
                    } else {
                      setSelectedFolder("ALL");
                    }
                  }}
                  disabled={!!leaderLockedService}
                  className="w-full h-9 bg-transparent border border-border rounded-md px-3 focus:outline-none focus:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors text-sm cursor-pointer"
                >
                  {(leaderLockedService
                    ? [leaderLockedService]
                    : availableServices.length > 0
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
                <label htmlFor="sidak-ranking-period" className="text-xs font-semibold text-foreground">Periode</label>
                <select
                  id="sidak-ranking-period"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full h-9 bg-transparent border border-border rounded-md px-3 focus:outline-none focus:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors text-sm cursor-pointer"
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
                <label htmlFor="sidak-ranking-year" className="text-xs font-semibold text-foreground">Tahun</label>
                <select
                  id="sidak-ranking-year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-9 bg-transparent border border-border rounded-md px-3 focus:outline-none focus:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors text-sm cursor-pointer"
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
                <label htmlFor="sidak-ranking-folder" className="text-xs font-semibold text-foreground">Folder/tim</label>
                <select
                  id="sidak-ranking-folder"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full h-9 bg-transparent border border-border rounded-md px-3 focus:outline-none focus:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors text-sm cursor-pointer"
                >
                  <option value="ALL">Semua Tim</option>
                  {standaloneFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nama}
                    </option>
                  ))}
                  {groupedFolders.map((group) => (
                    <optgroup
                      key={group.parent.id}
                      label={`${group.parent.nama} (gabungan + batch)`}
                    >
                      <option value={group.parent.id}>
                        {group.parent.nama} — Semua batch
                      </option>
                      {group.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          ↳ {child.nama}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* RANKING TABLE */}
          <section aria-label="Daftar ranking agen" className="border-y border-border">
            <div className="overflow-x-hidden md:overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground w-16">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => toggleSort("nama", "asc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        Agen
                        {renderSortIcon("nama")}
                      </button>
                    </th>
                    <th className={showBatchColumn ? "px-4 py-3 text-xs font-semibold text-muted-foreground" : "hidden"}>
                      Tim/Batch
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("defects", "desc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        Total Temuan
                        {renderSortIcon("defects")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("score", "desc")}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                      >
                        {scoreColumnLabel}
                        {renderSortIcon("score")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-center">
                      Perubahan posisi
                    </th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  <AnimatePresence mode="sync">
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
                        const rank = businessRanks.get(agent.agentId) ?? i + 1;
                        const tiedNames = tiedNamesByAgent.get(agent.agentId) ?? [];
                        const tieLabel = formatTieLabel(rank, tiedNames);
                        const rankChange = agent.rankChange;
                        const rankChangeLabel =
                          selectedPeriod === "alltime" || rankChange === undefined
                            ? null
                            : rankChange === null
                              ? "Baru"
                              : rankChange > 0
                                ? `Prioritas naik +${rankChange}`
                                : rankChange < 0
                                  ? `Prioritas turun ${Math.abs(rankChange)}`
                                  : "Tetap";
                        const rankChangeClass =
                          rankChange === undefined
                            ? "text-muted-foreground"
                            : rankChange === null
                              ? "text-blue-600 dark:text-blue-400"
                              : rankChange > 0
                                ? "text-red-600 dark:text-red-400"
                                : rankChange < 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground";
                        return (
                          <tr
                            key={agent.agentId}
                            className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-b border-border px-4 py-4 last:border-0 hover:bg-muted/20 md:table-row md:px-0 md:py-0"
                          >
                            <td className="row-span-2 px-0 py-0 align-middle md:table-cell md:px-4 md:py-4">
                              <span
                                className={`font-mono text-sm font-semibold ${
                                  rank === 1 ? "text-primary" : "text-muted-foreground"
                                }`}
                              >
                                {rank}
                              </span>
                            </td>
                            <td className="min-w-0 px-0 py-0 align-middle md:table-cell md:px-4 md:py-4">
                              <Link
                                to="/sidak/agents/$id"
                                params={{ id: agent.agentId }}
                                className="block break-words font-semibold text-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                              >
                                {agent.nama}
                              </Link>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground md:hidden">
                                {agent.batch && <span>{agent.batch}</span>}
                                <span>{agent.defects} temuan</span>
                                <span>Skor QA {agent.score.toFixed(1)}%</span>
                              </div>
                              {rankChangeLabel && (
                                <span className={`mt-2 block text-xs font-semibold md:hidden ${rankChangeClass}`}>
                                  {rankChangeLabel}
                                </span>
                              )}
                              {tieLabel && (
                                <span className="mt-1 block text-[11px] text-muted-foreground">
                                  {tieLabel}
                                </span>
                              )}
                            </td>
                            <td className={showBatchColumn ? "hidden px-4 py-4 align-middle md:table-cell" : "hidden"}>
                              <div className="text-xs font-semibold text-muted-foreground">
                                {agent.batch}
                              </div>
                            </td>
                            <td className="hidden px-4 py-4 text-right align-middle font-mono font-semibold text-foreground md:table-cell">
                              {agent.defects}
                            </td>
                            <td
                              className={`hidden px-4 py-4 text-right align-middle font-semibold md:table-cell ${scoreColor(agent.score)}`}
                            >
                              {agent.score.toFixed(1)}%
                            </td>
                            <td className="hidden px-4 py-4 text-left align-middle md:table-cell">
                              <div className="space-y-1 text-xs">
                                {rankChangeLabel && (
                                  <span className={`block font-semibold ${rankChangeClass}`}>
                                    {rankChangeLabel}
                                    {typeof rankChange === "number" && rankChange !== 0 && (
                                      <span className="ml-1 font-normal text-muted-foreground">
                                        (sebelumnya posisi {rank + rankChange})
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
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
          </section>
        </div>
      </div>
    </main>
  );
}
