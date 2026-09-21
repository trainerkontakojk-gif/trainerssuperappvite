import { useState, useEffect, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import { ChevronDown, Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import type { AgentDirectoryResponse } from "@trainers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import AgentCard from "../../components/sidak/AgentCard";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { titleize } from "../../lib/humanize";

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

export default function SidakAgentsPage() {
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [showAll, setShowAll] = useState(false);
  const year = new Date().getFullYear();

  const { data, loading, error, refetch } = useApi<AgentDirectoryResponse>(
    `/sidak/agents?year=${year}&show_all=${showAll}`,
  );

  function setPage(_n: number) {
    setVisibleCount(INITIAL_VISIBLE);
  }

  useEffect(() => {
    setPage(1);
  }, [search, selectedBatch, showAll]);

  const filtered = useMemo(() => {
    const agents = data?.agents ?? [];
    return agents.filter((a) => {
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
      return true;
    });
  }, [data?.agents, search, selectedBatch]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const nextLoadCount = Math.min(
    INITIAL_VISIBLE,
    filtered.length - visibleCount,
  );
  const batches = data?.batches ?? [];
  const hasActiveFilters = Boolean(search || selectedBatch);

  function resetFilters() {
    setSearch("");
    setSelectedBatch(null);
    setVisibleCount(INITIAL_VISIBLE);
  }

  function resetView() {
    resetFilters();
    setShowAll(false);
  }

  return (
    <div className="min-w-0 overflow-x-hidden pb-16">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="font-outfit text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Daftar agen
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Tinjau skor, tren, dan status audit setiap agen dalam satu daftar.
            </p>
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
              className="flex flex-col gap-4 border-y border-border bg-surface/30 py-4 sm:py-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label htmlFor="sidak-agent-search" className="sr-only">
                    Cari agen berdasarkan nama, tim, atau batch
                  </label>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="sidak-agent-search"
                      type="search"
                      placeholder="Cari nama, tim, atau batch..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-[44px] pl-10 pr-4"
                    />
                  </div>
                </div>

                {data ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                    <p
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      Menampilkan{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {filtered.length}
                      </span>{" "}
                      dari {data.agents.length} agen
                    </p>
                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="default"
                        onClick={resetFilters}
                        className="min-h-[44px] self-start px-2 sm:self-auto"
                      >
                        <RotateCcw
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        <span>Reset filter</span>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {batches.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <label
                    htmlFor="sidak-batch-filter"
                    className="shrink-0 text-xs font-semibold text-foreground"
                  >
                    Batch
                  </label>
                  <div className="relative w-full min-w-0 sm:max-w-[320px]">
                    <select
                      id="sidak-batch-filter"
                      aria-label="Filter batch"
                      value={selectedBatch ?? ""}
                      onChange={(event) => {
                        setSelectedBatch(event.target.value || null);
                        setVisibleCount(INITIAL_VISIBLE);
                      }}
                      className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9"
                    >
                      <option value="">Semua batch</option>
                      {batches.map((batch) => (
                        <option key={batch} value={batch}>
                          {titleize(batch)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
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
