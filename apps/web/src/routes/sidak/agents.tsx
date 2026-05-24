import { useState, useEffect, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import { Search, Eye, EyeOff, RotateCcw } from "lucide-react";
import type { AgentDirectoryResponse } from "@trainers/types";
import AgentCard from "../../components/sidak/AgentCard";
import QaStatePanel from "../../components/sidak/QaStatePanel";

const INITIAL_VISIBLE = 24;

export default function SidakAgentsPage() {
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [showAll, setShowAll] = useState(false);
  const year = new Date().getFullYear();

  const { data, loading } = useApi<AgentDirectoryResponse>(`/sidak/agents?year=${year}&show_all=${showAll}`);

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
  const nextLoadCount = Math.min(INITIAL_VISIBLE, filtered.length - visibleCount);
  const batches = data?.batches ?? [];

  return (
    <div className="min-h-screen bg-foreground/[0.02] pb-12">
      <header className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
              SIDAK / DIRECTORY AGENT
            </p>
            <h1 className="text-xl font-black tracking-tighter sm:text-2xl">
              Direktori Agent
            </h1>
          </div>
          <button
            onClick={() => {
              setShowAll((s) => !s);
              setVisibleCount(INITIAL_VISIBLE);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all hover:border-primary/30"
          >
            {showAll ? (
              <EyeOff size={14} className="text-amber-500" />
            ) : (
              <Eye size={14} />
            )}
            {showAll ? "Data Terfilter" : "Tampilkan Data Keseluruhan"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="group relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          />
          <input
            className="w-full rounded-2xl border border-border/50 bg-background py-2.5 pl-11 pr-4 text-sm outline-none ring-0 transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            placeholder="Cari agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {batches.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => {
                setSelectedBatch(null);
                setVisibleCount(INITIAL_VISIBLE);
              }}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                selectedBatch === null
                  ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                  : "border-border/50 bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              Semua Batch
            </button>
            {batches.map((b) => (
              <button
                key={b}
                onClick={() => {
                  setSelectedBatch(b === selectedBatch ? null : b);
                  setVisibleCount(INITIAL_VISIBLE);
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  selectedBatch === b
                    ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                    : "border-border/50 bg-background text-muted-foreground hover:border-primary/40"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[2rem] border border-border/50 bg-card/40 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="h-16 w-16 rounded-2xl bg-muted/60" />
                  <div className="space-y-2">
                    <div className="h-4 w-20 rounded-full bg-muted/60" />
                    <div className="h-6 w-12 rounded bg-muted/60" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted/60" />
                  <div className="h-3 w-1/2 rounded bg-muted/60" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-muted/60" />
                  <div className="h-8 w-8 rounded-full bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-md pt-8">
            <QaStatePanel
              type="empty"
              title="Data agen tidak ditemukan"
              description="Coba ubah filter atau kata kunci pencarian."
              action={
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedBatch(null);
                    setShowAll(false);
                    setVisibleCount(INITIAL_VISIBLE);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-muted/50"
                >
                  <RotateCcw size={12} />
                  Reset Filter
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visible.map((agent, i) => (
                <AgentCard key={agent.id} agent={agent} index={i} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisibleCount((s) => s + INITIAL_VISIBLE)}
                  className="rounded-2xl border border-border/50 bg-background px-8 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all hover:bg-muted/50"
                >
                  Muat {nextLoadCount} Agent Lagi
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
