import { useState, useEffect, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useApi } from "../../hooks/useApi";
import { Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import type { AgentDirectoryResponse } from "@trainers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import AgentCard from "../../components/sidak/AgentCard";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { titleize } from "../../lib/humanize";
import { FilterSelect } from "../../components/sidak/FilterSelect";
import { SidakPageHeader } from "../../components/sidak/SidakPageHeader";
import { useSidakScope } from "../../hooks/useSidakScope";
import {
  AGENT_SORT_OPTIONS,
  AGENT_STATUS_OPTIONS,
  isBelowTarget,
  matchesStatusFilter,
  sortAgents,
  type AgentSort,
  type AgentStatusFilter,
} from "../../utils/sidakAgentList";
import { cn } from "cn";

const INITIAL_VISIBLE = 24;
const AGENT_GRID_CLASS =
  "grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3";

function AgentCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg motion-reduce:animate-none" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/5 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-3 w-4/5 rounded-md motion-reduce:animate-none" />
        </div>
        <Skeleton className="size-5 shrink-0 rounded-md motion-reduce:animate-none" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-7 w-24 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-3 w-20 rounded-md motion-reduce:animate-none" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded-md motion-reduce:animate-none" />
            <Skeleton className="h-4 w-24 rounded-md motion-reduce:animate-none" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded-md motion-reduce:animate-none" />
            <Skeleton className="h-4 w-20 rounded-md motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_BATCHES = "__all__";

export default function SidakAgentsPage() {
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  // Tautan dari Beranda membawa `?status=below`; URL hanya menentukan state
  // awal, perubahan filter setelah itu tidak menulis ulang alamat.
  const routeSearch = useSearch({ from: "/sidak/agents" });
  const [status, setStatus] = useState<AgentStatusFilter>(
    routeSearch.status ?? "all",
  );
  const [sort, setSort] = useState<AgentSort>("score-asc");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [showAll, setShowAll] = useState(false);
  // Tahun mengikuti cakupan bersama SIDAK; layanan/tim tidak dipakai di sini
  // karena skor tiap agen dihitung dari layanan timnya sendiri.
  const { scope } = useSidakScope();
  const year = scope.tahun;

  const { data, loading, error, refetch } = useApi<AgentDirectoryResponse>(
    `/sidak/agents?year=${year}&show_all=${showAll}`,
  );

  function setPage(_n: number) {
    setVisibleCount(INITIAL_VISIBLE);
  }

  useEffect(() => {
    setPage(1);
  }, [search, selectedBatch, status, sort, showAll]);

  const filtered = useMemo(() => {
    const agents = data?.agents ?? [];
    const matches = agents.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !a.nama.toLowerCase().includes(q) &&
          !a.tim.toLowerCase().includes(q) &&
          !(a.batch_name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (selectedBatch && a.batch_name !== selectedBatch) return false;
      if (!matchesStatusFilter(a, status)) return false;
      return true;
    });
    return sortAgents(matches, sort);
  }, [data?.agents, search, selectedBatch, status, sort]);
  const belowTarget = useMemo(
    () => (data?.agents ?? []).filter(isBelowTarget).length,
    [data?.agents],
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const nextLoadCount = Math.min(
    INITIAL_VISIBLE,
    filtered.length - visibleCount,
  );
  const batches = data?.batches ?? [];
  const hasActiveFilters = Boolean(search || selectedBatch || status !== "all");
  const totalAgents = data?.agents.length ?? 0;

  function resetFilters() {
    setSearch("");
    setSelectedBatch(null);
    setStatus("all");
    setVisibleCount(INITIAL_VISIBLE);
  }

  function resetView() {
    resetFilters();
    setShowAll(false);
  }

  return (
    <div className="min-w-0 overflow-x-hidden pb-16">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <SidakPageHeader
          title="Agen"
          description="Cari agen, lalu buka skor, temuan, dan bahan coaching-nya."
          scope={
            <p className="text-sm text-fg2">
              <span className="text-foreground">Tahun {year}</span> · skor dari
              periode audit terakhir tiap agen, di layanan timnya
            </p>
          }
        />

        {error && !data ? (
          <QaStatePanel
            type="error"
            title="Gagal memuat daftar agen"
            description="Periksa koneksi kamu, lalu coba muat ulang data agen."
            action={
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void refetch()}
                className="min-h-[44px]"
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                <span>Coba lagi</span>
              </Button>
            }
          />
        ) : (
          <>
            <section
              aria-label="Filter daftar agen"
              className="flex flex-col gap-4 border-y border-border py-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex min-w-0 flex-col gap-1.5 lg:flex-1">
                  <label
                    htmlFor="sidak-agent-search"
                    className="text-[12px] font-medium text-fg2"
                  >
                    Cari agen
                  </label>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="sidak-agent-search"
                      type="search"
                      placeholder="Nama, tim, atau batch"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-[44px] pl-10 pr-4"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:contents">
                  {batches.length > 0 ? (
                    <FilterSelect
                      id="sidak-batch-filter"
                      label="Batch"
                      className="flex min-w-0 flex-col gap-1.5 lg:w-52"
                      value={selectedBatch ?? ALL_BATCHES}
                      onValueChange={(value) => {
                        setSelectedBatch(value === ALL_BATCHES ? null : value);
                        setVisibleCount(INITIAL_VISIBLE);
                      }}
                      items={[
                        { value: ALL_BATCHES, label: "Semua batch" },
                        ...batches.map((batch) => ({
                          value: batch,
                          label: titleize(batch),
                        })),
                      ]}
                    />
                  ) : null}
                  <FilterSelect
                    id="sidak-status-filter"
                    label="Status"
                    className="flex min-w-0 flex-col gap-1.5 lg:w-52"
                    value={status}
                    onValueChange={(value) =>
                      setStatus(value as AgentStatusFilter)
                    }
                    items={AGENT_STATUS_OPTIONS}
                  />
                </div>

                <Button
                  type="button"
                  variant={showAll ? "default" : "outline"}
                  size="lg"
                  aria-pressed={showAll}
                  aria-label={
                    showAll
                      ? "Sembunyikan agen tambahan"
                      : "Tampilkan agen tambahan dari daftar utama"
                  }
                  title={
                    showAll
                      ? "Sembunyikan agen tambahan"
                      : "Sertakan agen di luar daftar utama"
                  }
                  onClick={() => {
                    setShowAll((s) => !s);
                    setVisibleCount(INITIAL_VISIBLE);
                  }}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  {showAll ? (
                    <EyeOff data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <Eye data-icon="inline-start" aria-hidden="true" />
                  )}
                  <span>
                    {showAll
                      ? "Sembunyikan agen tambahan"
                      : "Tampilkan agen tambahan"}
                  </span>
                </Button>
              </div>

              {data ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p
                      data-testid="sidak-agents-count"
                      className="text-sm text-fg2 tabular-nums"
                      aria-live="polite"
                    >
                      {hasActiveFilters
                        ? `${filtered.length} dari ${totalAgents} agen`
                        : `${totalAgents} agen`}{" "}
                      · {belowTarget} di bawah target
                    </p>
                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="default"
                        onClick={resetFilters}
                        className="min-h-[44px] px-2"
                      >
                        <RotateCcw
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        <span>Reset filter</span>
                      </Button>
                    ) : null}
                  </div>
                  <div
                    role="group"
                    aria-label="Urutkan agen"
                    className="inline-flex self-start rounded-lg border border-border p-0.5 sm:self-auto"
                  >
                    {AGENT_SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={sort === option.value}
                        onClick={() => setSort(option.value)}
                        className={cn(
                          "min-h-[44px] rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                          sort === option.value
                            ? "bg-foreground text-background"
                            : "text-fg2 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {loading ? (
              <div
                className={AGENT_GRID_CLASS}
                role="status"
                aria-label="Memuat daftar agen"
              >
                {Array.from({ length: 8 }).map((_, index) => (
                  <AgentCardSkeleton key={index} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mx-auto w-full max-w-lg pt-2">
                <QaStatePanel
                  type="empty"
                  title={
                    hasActiveFilters
                      ? "Data agen tidak ditemukan"
                      : "Belum ada data agen"
                  }
                  description={
                    hasActiveFilters
                      ? "Coba ubah filter atau kata kunci pencarian."
                      : "Belum ada agen yang dapat ditampilkan untuk periode ini."
                  }
                  action={
                    hasActiveFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={resetView}
                        className="min-h-[44px]"
                      >
                        <RotateCcw
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        <span>Reset filter</span>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <section className={AGENT_GRID_CLASS} aria-label="Daftar agen">
                  {visible.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </section>
                {hasMore ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() =>
                        setVisibleCount((count) => count + INITIAL_VISIBLE)
                      }
                      className="min-h-[44px]"
                    >
                      Muat {nextLoadCount} agen lagi
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
