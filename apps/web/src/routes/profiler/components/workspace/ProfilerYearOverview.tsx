import { useMemo } from "react";
import type { ProfilerFolder } from "@trainers/types";
import { CalendarDays, ChevronRight, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import GlobalBirthdaysWidget from "./GlobalBirthdaysWidget";

interface ProfilerYearOverviewProps {
  yearLabel: string | null;
  yearId: string | null;
  folders: ProfilerFolder[];
  counts: Record<string, number>;
  isReadOnly: boolean;
  onSelectBatch: (name: string) => void;
  onAddYear: () => void;
  onAddFolder: (yearId: string) => void;
}

type BatchRow = { id: string; name: string; team: string | null };

/** Isi kanan saat belum ada batch terpilih: semua batch di tahun aktif. */
export default function ProfilerYearOverview({
  yearLabel,
  yearId,
  folders,
  counts,
  isReadOnly,
  onSelectBatch,
  onAddYear,
  onAddFolder,
}: ProfilerYearOverviewProps) {
  const rows = useMemo<BatchRow[]>(() => {
    if (!yearId) return [];
    const teams = folders.filter(
      (folder) => folder.year_id === yearId && !folder.parent_id,
    );
    return teams.flatMap((team): BatchRow[] => {
      const batches = folders.filter((folder) => folder.parent_id === team.id);
      if (batches.length === 0) {
        return [{ id: team.id, name: team.name, team: null }];
      }
      return batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        team: team.name,
      }));
    });
  }, [folders, yearId]);

  const totalPeserta = rows.reduce(
    (sum, row) => sum + (counts[row.name] ?? 0),
    0,
  );
  const title = yearLabel ? `Batch tahun ${yearLabel}` : "Profiler";

  return (
    <section
      aria-labelledby="profiler-overview-title"
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 sm:p-6 lg:p-8"
    >
      <header className="flex flex-col gap-1">
        <h1
          id="profiler-overview-title"
          className="font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          {title}
        </h1>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} batch · {totalPeserta} peserta
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        {!yearId ? (
          <Empty className="min-h-56 border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ada arsip tahun</EmptyTitle>
              <EmptyDescription>
                Arsip tahun menampung tim dan batch peserta.
              </EmptyDescription>
            </EmptyHeader>
            {!isReadOnly && (
              <Button
                type="button"
                size="lg"
                onClick={onAddYear}
                className="min-h-11"
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Tambah tahun
              </Button>
            )}
          </Empty>
        ) : rows.length === 0 ? (
          <Empty className="min-h-56 border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ada tim di tahun ini</EmptyTitle>
              <EmptyDescription>
                Buat tim untuk mulai mengelola data peserta.
              </EmptyDescription>
            </EmptyHeader>
            {!isReadOnly && (
              <Button
                type="button"
                size="lg"
                onClick={() => onAddFolder(yearId)}
                className="min-h-11"
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Buat tim pertama
              </Button>
            )}
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_1.5rem] gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
              <span>Batch</span>
              <span>Tim</span>
              <span className="text-right">Peserta</span>
              <span aria-hidden="true" />
            </div>
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const count = counts[row.name] ?? 0;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onSelectBatch(row.name)}
                      className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_1.5rem]"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {row.name}
                      </span>
                      <span className="col-start-1 row-start-2 min-w-0 truncate text-xs text-muted-foreground sm:col-start-auto sm:row-start-auto sm:text-sm">
                        {row.team ?? "Tanpa batch"}
                      </span>
                      <span className="row-span-2 text-right font-mono text-sm tabular-nums text-foreground sm:row-span-1">
                        {count}
                        <span className="sr-only"> peserta</span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="row-span-2 size-4 text-muted-foreground sm:row-span-1"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <GlobalBirthdaysWidget className="w-full" />
      </div>
    </section>
  );
}
