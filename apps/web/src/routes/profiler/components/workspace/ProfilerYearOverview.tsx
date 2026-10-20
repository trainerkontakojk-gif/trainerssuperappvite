import { useMemo, type ComponentProps } from "react";
import { CalendarDays, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import GlobalBirthdaysWidget from "./GlobalBirthdaysWidget";
import ProfilerLibraryNav from "./ProfilerLibraryNav";

interface ProfilerYearOverviewProps {
  yearLabel: string | null;
  /** Daftar tim → folder tampil di sini; panel kiri disembunyikan di beranda. */
  navProps: ComponentProps<typeof ProfilerLibraryNav>;
}

/** Isi beranda saat belum ada folder terpilih: daftar tim → folder dan ulang tahun. */
export default function ProfilerYearOverview({
  yearLabel,
  navProps,
}: ProfilerYearOverviewProps) {
  const { years, folders, counts, selectedYearId, isReadOnly, onAddYear } =
    navProps;

  const summary = useMemo(() => {
    if (!selectedYearId) return null;
    const teams = folders.filter(
      (folder) => folder.year_id === selectedYearId && !folder.parent_id,
    );
    // Tim tanpa folder dipakai langsung sebagai folder.
    const batchNames = teams.flatMap((team) => {
      const batches = folders.filter((folder) => folder.parent_id === team.id);
      return batches.length > 0
        ? batches.map((batch) => batch.name)
        : [team.name];
    });
    return {
      teams: teams.length,
      folders: batchNames.length,
      peserta: batchNames.reduce((sum, name) => sum + (counts[name] ?? 0), 0),
    };
  }, [folders, counts, selectedYearId]);

  const title = yearLabel ? `Folder tahun ${yearLabel}` : "Profiler";

  return (
    <section
      aria-labelledby="profiler-overview-title"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6 lg:p-8"
    >
      <header className="flex flex-col gap-1">
        <h1
          id="profiler-overview-title"
          className="font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          {title}
        </h1>
        {summary && summary.folders > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {summary.peserta} peserta · {summary.teams} tim · {summary.folders}{" "}
            folder
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {years.length === 0 ? (
          <Empty className="min-h-56 border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ada arsip tahun</EmptyTitle>
              <EmptyDescription>
                Arsip tahun menampung tim dan folder peserta.
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
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ProfilerLibraryNav {...navProps} />
          </div>
        )}

        <GlobalBirthdaysWidget className="w-full" />
      </div>
    </section>
  );
}
