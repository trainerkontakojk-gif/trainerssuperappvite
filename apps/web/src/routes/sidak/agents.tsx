import { useState, useEffect, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import { Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import type { AgentDirectoryResponse } from "@trainers/types";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import AgentCard from "../../components/sidak/AgentCard";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { titleize } from "../../lib/humanize";

const INITIAL_VISIBLE = 24;
const AGENT_GRID_CLASS =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 2xl:grid-cols-5";

function AgentCardSkeleton() {
  return (
    <Card className="gap-0 border-border bg-surface py-0 ring-0">
      <CardContent className="flex h-full flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="size-16 rounded-xl motion-reduce:animate-none" />
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-5 w-28 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-6 w-20 rounded-md motion-reduce:animate-none" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-4/5 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-4 w-3/5 rounded-md motion-reduce:animate-none" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-24 rounded-md motion-reduce:animate-none" />
          <Skeleton className="size-9 rounded-lg motion-reduce:animate-none" />
        </div>
      </CardContent>
    </Card>
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              SIDAK · Analisis Individu
            </p>
            <h1 className="mt-1 font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Daftar agen
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Tinjau skor, tren, dan status audit setiap agen dalam satu daftar.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-pressed={showAll}
            onClick={() => {
              setShowAll((s) => !s);
              setVisibleCount(INITIAL_VISIBLE);
            }}
            className="min-h-11 w-full sm:w-auto"
          >
            {showAll ? (
              <EyeOff data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Eye data-icon="inline-start" aria-hidden="true" />
            )}
            <span>{showAll ? "Data terfilter" : "Tampilkan semua data"}</span>
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
                className="min-h-11"
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                <span>Coba lagi</span>
              </Button>
            }
          />
        ) : (
          <>
            <Card className="gap-0 border-border bg-surface py-0 ring-0">
              <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
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
                        className="h-11 pl-10 pr-4"
                      />
                    </div>
                  </div>

                  {data ? (
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">
                          {filtered.length}
                        </span>{" "}
                        dari {data.agents.length} agen
                      </p>
                      {hasActiveFilters ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={resetFilters}
                          className="min-h-10"
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
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      Batch
                    </span>
                    <div
                      className="flex min-w-0 gap-2 overflow-x-auto pb-1 no-scrollbar"
                      role="group"
                      aria-label="Filter batch"
                    >
                      <Button
                        type="button"
                        variant={selectedBatch === null ? "default" : "outline"}
                        size="sm"
                        aria-pressed={selectedBatch === null}
                        onClick={() => {
                          setSelectedBatch(null);
                          setVisibleCount(INITIAL_VISIBLE);
                        }}
                        className="min-h-10 shrink-0 rounded-full px-4"
                      >
                        Semua batch
                      </Button>
                      {batches.map((batch) => (
                        <Button
                          key={batch}
                          type="button"
                          variant={
                            selectedBatch === batch ? "default" : "outline"
                          }
                          size="sm"
                          aria-pressed={selectedBatch === batch}
                          onClick={() => {
                            setSelectedBatch(
                              batch === selectedBatch ? null : batch,
                            );
                            setVisibleCount(INITIAL_VISIBLE);
                          }}
                          className={cn(
                            "min-h-10 shrink-0 rounded-full px-4",
                            selectedBatch !== batch && "text-muted-foreground",
                          )}
                        >
                          {titleize(batch)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

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
                        className="min-h-11"
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
                  {visible.map((agent, index) => (
                    <AgentCard key={agent.id} agent={agent} index={index} />
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
                      className="min-h-11"
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
