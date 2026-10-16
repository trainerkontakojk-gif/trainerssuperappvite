import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useApi } from "../../hooks/useApi";
import { DEFAULT_SERVICE_FOLDER_MAP } from "../../lib/scoring";
import type { TopAgentData, QAPeriod, ServiceType } from "@trainers/types";
import {
  SidakPageHeader,
  SidakScopeLine,
} from "../../components/sidak/SidakPageHeader";
import { SIDAK_ALL_TEAMS, useSidakScope } from "../../hooks/useSidakScope";
import {
  buildSidakFolderSelectGroups,
  findPrimarySidakFolderByName,
  normalizeSidakFolderOptions,
  type NormalizedSidakFolderOption,
} from "../../lib/sidak-folder-options";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { cn } from "cn";
import { notify } from "../../lib/toast";
import {
  computeRanks,
  downloadRankingXlsx,
  groupByTeam,
  rankChangeLabel as describeRankChange,
  tiedNames as tiedNamesFor,
} from "../../utils/sidakRanking";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { FilterSelect } from "../../components/sidak/FilterSelect";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SIDAK_SCORE_TEXT,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";

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
  // Layanan, tahun, dan tim mengikuti cakupan bersama SIDAK (query URL +
  // sesi). Periode (YTD/bulan) tetap milik halaman ini.
  const { scope, setScope } = useSidakScope();
  const selectedService: string = scope.layanan;
  const selectedYear = scope.tahun;
  const selectedFolder = scope.tim ?? SIDAK_ALL_TEAMS;
  const setSelectedService = useCallback(
    (service: string) => setScope({ layanan: service as ServiceType }),
    [setScope],
  );
  const setSelectedFolder = useCallback(
    (folder: string) => setScope({ tim: folder }),
    [setScope],
  );
  const [selectedPeriod, setSelectedPeriod] = useState("ytd");
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
  }, [availableServices, selectedService, loading, data, setSelectedService]);

  useEffect(() => {
    if (loading) return;
    const folders = allFolders;
    if (folders.length > 0) {
      if (selectedFolder !== "ALL") {
        const valid = folders.some((f) => f.id === selectedFolder);
        if (!valid) setSelectedFolder("ALL");
      }

      // Default folder pairing on initial load/mount when data is fetched
      if (!initialFolderSetRef.current && scope.tim === null) {
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
  }, [
    allFolders,
    selectedFolder,
    loading,
    effectiveService,
    scope.tim,
    setSelectedFolder,
  ]);

  const rankings = data?.rankings;
  const [view, setView] = useState<"combined" | "team">("combined");
  const [exporting, setExporting] = useState(false);
  const businessRanks = useMemo(
    () => computeRanks(rankings ?? []),
    [rankings],
  );

  const tiedNamesByAgent = useMemo(
    () => tiedNamesFor(rankings ?? []),
    [rankings],
  );

  const formatTieLabel = (rank: number, names: string[]) => {
    if (names.length === 0) return null;
    const peerLabel =
      names.length <= 2
        ? names.join(" dan ")
        : `${names[0]} dan ${names.length - 1} agen lain`;
    return `Berbagi peringkat ${rank} dengan ${peerLabel}`;
  };


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

  // Per tim leader: urutan tabel sama, peringkat dan seri dihitung di dalam tim.
  const teamGroups = useMemo(
    () =>
      groupByTeam(sortedRankings).map((group) => ({
        ...group,
        ranks: computeRanks(group.agents),
        ties: tiedNamesFor(group.agents),
      })),
    [sortedRankings],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      // Excel mengikuti tampilan: per tim leader memakai urutan dan peringkat
      // di dalam tim, sama seperti tabel.
      const teamView = view === "team";
      await downloadRankingXlsx({
        agents: teamView
          ? teamGroups.flatMap((group) => group.agents)
          : sortedRankings,
        ranks: teamView
          ? new Map(teamGroups.flatMap((group) => [...group.ranks]))
          : businessRanks,
        period: selectedPeriod,
        fileName: `ranking-sidak-${effectiveService}-${selectedYear}-${selectedPeriod}${teamView ? "-per-tim" : ""}.xlsx`,
      });
    } catch {
      notify.error("File Excel gagal dibuat. Coba lagi.");
    } finally {
      setExporting(false);
    }
  };

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

  const renderRow = (
    agent: TopAgentData,
    rank: number,
    tiedNames: string[],
  ) => {
                        const tieLabel = formatTieLabel(rank, tiedNames);
                        const rankChange = agent.rankChange;
                        const rankChangeLabel = describeRankChange(
                          rankChange,
                          selectedPeriod,
                        );
                        // Prioritas naik = temuan makin banyak (perlu perhatian);
                        // turun = membaik. Teks label tetap menyatakan arahnya.
                        const rankChangeClass =
                          typeof rankChange !== "number" || rankChange === 0
                            ? "text-muted-foreground"
                            : rankChange > 0
                              ? SIDAK_SCORE_TEXT.bad
                              : SIDAK_SCORE_TEXT.ok;
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
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground md:hidden">
                                {agent.batch && <span>{agent.batch}</span>}
                                <span>{agent.defects} temuan</span>
                                <span>Skor QA {agent.score.toFixed(1)}%</span>
                              </div>
                              {rankChangeLabel && (
                                <span className={`mt-2 block text-[12px] font-semibold md:hidden ${rankChangeClass}`}>
                                  {rankChangeLabel}
                                </span>
                              )}
                              {tieLabel && (
                                <span className="mt-1 block text-[12px] text-muted-foreground">
                                  {tieLabel}
                                </span>
                              )}
                            </td>
                            <td className="hidden px-4 py-4 align-middle text-sm text-fg2 md:table-cell">
                              {[agent.tim?.trim(), agent.batch?.trim()]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                              {agent.hasCritical ? (
                                <span className={`ml-2 text-xs font-semibold ${SIDAK_SCORE_TEXT.bad}`}>
                                  kritikal
                                </span>
                              ) : null}
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
                              <div className="space-y-1 text-[12px]">
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
  };

  const scoreColor = (score: number) => SIDAK_SCORE_TEXT[sidakScoreTone(score)];

  const ariaSort = (key: SortKey) =>
    sortKey === key
      ? sortDirection === "asc"
        ? "ascending"
        : "descending"
      : "none";

  const isYearToDate = selectedPeriod === "ytd";
  const scoreColumnLabel = isYearToDate ? "Rata-rata Skor QA" : "Skor QA";

  const periodsForYear = data?.periods?.filter(
    (p) => p.year === selectedYear,
  ) ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 pb-14 md:p-8 md:pb-10 lg:pb-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <SidakPageHeader
            title="Ranking"
            description="Agen dengan temuan terbanyak ada di peringkat 1. Jumlah temuan yang sama berbagi peringkat."
            scope={
              <SidakScopeLine
                layanan={effectiveService}
                timLabel={
                  selectedFolder === SIDAK_ALL_TEAMS
                    ? null
                    : (allFolders.find((f) => f.id === selectedFolder)?.name ??
                      "Tim terpilih")
                }
                tahun={selectedYear}
                note="periode dipilih di filter, bukan rentang bulan"
              />
            }
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleExport()}
                disabled={loading || exporting || sortedRankings.length === 0}
                className="min-h-[44px]"
              >
                <Download data-icon="inline-start" aria-hidden="true" />
                Unduh Excel
              </Button>
            }
          />

          {/* FILTER BAR: cakupan ringkas seperti halaman SIDAK lain */}
          <section
            aria-label="Filter ranking"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
          >
              <FilterSelect
                className="flex min-w-0 flex-col gap-1.5 lg:w-36"
                id="sidak-ranking-service"
                label="Layanan"
                value={leaderLockedService ?? selectedService}
                disabled={!!leaderLockedService}
                items={(leaderLockedService
                  ? [leaderLockedService]
                  : availableServices.length > 0
                    ? availableServices
                    : Object.keys(SERVICE_LABELS)
                ).map((st) => ({ value: st, label: SERVICE_LABELS[st] || st }))}
                onValueChange={(svc) => {
                  if (leaderLockedService) return;
                  const matchedFolder = findPrimarySidakFolderByName(
                    allFolders,
                    DEFAULT_SERVICE_FOLDER_MAP[svc],
                  );
                  setScope({
                    layanan: svc as ServiceType,
                    tim: matchedFolder?.id ?? SIDAK_ALL_TEAMS,
                  });
                }}
              />

              <FilterSelect
                className="flex min-w-0 flex-col gap-1.5 lg:w-28"
                id="sidak-ranking-year"
                label="Tahun"
                value={String(selectedYear)}
                onValueChange={(y) => setScope({ tahun: Number(y) })}
                items={(data?.availableYears ?? []).map((y) => ({
                  value: String(y),
                  label: String(y),
                }))}
              />

              <FilterSelect
                className="flex min-w-0 flex-col gap-1.5 lg:w-56"
                id="sidak-ranking-period"
                label="Periode"
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
                items={[
                  { value: "ytd", label: "Year to Date (YTD)" },
                  { value: "alltime", label: "All Time" },
                ]}
                groups={[
                  {
                    label: "Bulan",
                    items: periodsForYear.map((p) => ({
                      value: p.id,
                      label: `${MONTHS[(p.month ?? 1) - 1]} ${p.year}`,
                    })),
                  },
                ]}
              />

              <FilterSelect
                className="flex min-w-0 flex-col gap-1.5 lg:w-64"
                id="sidak-ranking-folder"
                label="Tim"
                value={selectedFolder}
                onValueChange={setSelectedFolder}
                items={[
                  { value: "ALL", label: "Semua Tim" },
                  ...standaloneFolders.map((f) => ({ value: f.id, label: f.nama })),
                ]}
                groups={groupedFolders.map((group) => ({
                  label: `${group.parent.nama} (gabungan + batch)`,
                  items: [
                    { value: group.parent.id, label: `${group.parent.nama} — Semua batch` },
                    ...group.children.map((child) => ({
                      value: child.id,
                      label: `↳ ${child.nama}`,
                    })),
                  ],
                }))}
              />
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label="Tampilan ranking"
              className="inline-flex self-start rounded-lg border border-border p-0.5"
            >
              {(
                [
                  ["combined", "Tim gabungan"],
                  ["team", "Per tim leader"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "min-h-[44px] rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    view === value
                      ? "bg-foreground text-background"
                      : "text-fg2 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {!loading && sortedRankings.length > 0 ? (
              <p data-testid="ranking-count" className="text-sm text-fg2 tabular-nums">
                {sortedRankings.length} agen · jumlah temuan sama berbagi peringkat
              </p>
            ) : null}
          </div>

          {/* RANKING TABLE */}
          <section
            aria-label="Daftar ranking agen"
            className="overflow-hidden rounded-xl border border-border bg-surface-elevated"
          >
            <div className="overflow-x-hidden md:overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground w-16">
                      Rank
                    </th>
                    <th
                      aria-sort={ariaSort("nama")}
                      className="px-4 py-1 text-[12px] font-semibold text-muted-foreground"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleSort("nama", "asc")}
                        className="-ml-2 h-[44px] gap-1.5 px-2 text-[12px] font-semibold text-muted-foreground"
                      >
                        Agen
                        {renderSortIcon("nama")}
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground">
                      Tim · Batch
                    </th>
                    <th
                      aria-sort={ariaSort("defects")}
                      className="px-4 py-1 text-right text-[12px] font-semibold text-muted-foreground"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleSort("defects", "desc")}
                        className="-mr-2 h-[44px] gap-1.5 px-2 text-[12px] font-semibold text-muted-foreground"
                      >
                        Temuan
                        {renderSortIcon("defects")}
                      </Button>
                    </th>
                    <th
                      aria-sort={ariaSort("score")}
                      className="px-4 py-1 text-right text-[12px] font-semibold text-muted-foreground"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleSort("score", "desc")}
                        className="-mr-2 h-[44px] gap-1.5 px-2 text-[12px] font-semibold text-muted-foreground"
                      >
                        {scoreColumnLabel}
                        {renderSortIcon("score")}
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground text-center">
                      Perubahan posisi
                    </th>
                  </tr>
                </thead>
                {!loading && view === "team" && sortedRankings.length > 0 ? (
                  teamGroups.map((group) => (
                    <tbody
                      key={group.tim}
                      aria-label={group.tim}
                      className="block md:table-row-group"
                    >
                      <tr className="block border-b border-border bg-muted/30 md:table-row">
                        <th
                          scope="colgroup"
                          colSpan={6}
                          className="block px-4 py-2 text-left text-sm font-semibold text-foreground md:table-cell"
                        >
                          {group.tim}
                          <span className="ml-2 font-normal text-fg2">
                            {group.agents.length} agen
                          </span>
                        </th>
                      </tr>
                      {group.agents.map((agent, i) =>
                        renderRow(
                          agent,
                          group.ranks.get(agent.agentId) ?? i + 1,
                          group.ties.get(agent.agentId) ?? [],
                        ),
                      )}
                    </tbody>
                  ))
                ) : (
                  <tbody className="block md:table-row-group">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={`skeleton-${i}`}>
                          <td colSpan={6} className="px-6 py-8">
                            <Skeleton className="h-6 w-full rounded-lg" />
                          </td>
                        </tr>
                      ))
                    ) : sortedRankings.length > 0 ? (
                      sortedRankings.map((agent, i) =>
                        renderRow(
                          agent,
                          businessRanks.get(agent.agentId) ?? i + 1,
                          tiedNamesByAgent.get(agent.agentId) ?? [],
                        ),
                      )
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-24 text-center">
                          <QaStatePanel
                            type="empty"
                            title="Data ranking belum tersedia untuk filter ini"
                            description="Ubah layanan, periode, tahun, atau folder untuk menampilkan data ranking agen."
                            className="mx-auto max-w-md text-left"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
