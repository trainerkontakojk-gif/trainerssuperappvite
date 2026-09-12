import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";
import { CalendarDays, Layers, Plus, Sparkles, Users } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "cn";

import GlobalBirthdaysWidget from "./GlobalBirthdaysWidget";
import { cleanYearLabel, getDynamicIcon } from "./workspace-utils";

interface WorkspaceNavigatorProps {
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  selectedYearId: string | null;
  onSelectYear: (id: string) => void;
  selectedTeamId: string | null;
  onSelectTeam: (id: string) => void;
  onSelectBatch: (id: string, name: string) => void;
  isReadOnly: boolean;
  onAddFolder: (yearId: string, parentId?: string) => void;
  counts: Record<string, number>;
}

export default function WorkspaceNavigator({
  years,
  folders,
  selectedYearId,
  onSelectYear,
  selectedTeamId,
  onSelectTeam,
  onSelectBatch,
  isReadOnly,
  onAddFolder,
  counts,
}: WorkspaceNavigatorProps) {
  const prefersReducedMotion = useReducedMotion();
  const teams = useMemo(
    () =>
      selectedYearId
        ? folders.filter(
            (folder) => folder.year_id === selectedYearId && !folder.parent_id,
          )
        : [],
    [folders, selectedYearId],
  );

  const selectedTeam = useMemo(
    () =>
      selectedTeamId
        ? (folders.find((folder) => folder.id === selectedTeamId) ?? null)
        : null,
    [folders, selectedTeamId],
  );

  const batchesByTeam = useMemo(() => {
    const next = new Map<string, ProfilerFolder[]>();

    for (const folder of folders) {
      if (!folder.parent_id) continue;
      const current = next.get(folder.parent_id) ?? [];
      current.push(folder);
      next.set(folder.parent_id, current);
    }

    return next;
  }, [folders]);

  const batches = useMemo(
    () => (selectedTeamId ? (batchesByTeam.get(selectedTeamId) ?? []) : []),
    [batchesByTeam, selectedTeamId],
  );

  const batchSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToBatchesRef = useRef(false);
  const [isBatchSectionHighlighted, setIsBatchSectionHighlighted] =
    useState(false);
  const batchSectionId = "profiler-batch-section";

  const focusBatchSection = useCallback(() => {
    setIsBatchSectionHighlighted(true);
    batchSectionRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (
      !shouldScrollToBatchesRef.current ||
      !selectedTeamId ||
      batches.length === 0
    ) {
      return;
    }

    focusBatchSection();
    shouldScrollToBatchesRef.current = false;
  }, [batches.length, focusBatchSection, selectedTeamId]);

  useEffect(() => {
    if (!isBatchSectionHighlighted) return;

    const timeoutId = window.setTimeout(() => {
      setIsBatchSectionHighlighted(false);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [isBatchSectionHighlighted]);

  const contentTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: "easeOut" as const };

  return (
    <div className="relative z-10 h-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <section className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                <Sparkles data-icon="inline-start" aria-hidden="true" />
                Ruang kerja operasional
              </Badge>
            </div>
            <h1 className="mt-3 break-words font-outfit text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              Kotak Tool Profil
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Pilih tahun dan tim untuk melihat data peserta, analisis, dan
              laporan yang tersedia.
            </p>
          </div>

          <GlobalBirthdaysWidget className="w-full lg:w-72" />
        </section>

        <Card className="border-border bg-card py-0 ring-0">
          <CardHeader className="gap-1 border-b border-border p-5 sm:p-6">
            <CardTitle className="font-outfit text-base font-semibold">
              Pilih tahun data
            </CardTitle>
            <CardDescription>
              Gunakan arsip tahun untuk memfilter tim dan batch.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {years.length === 0 ? (
              <Empty className="min-h-32 border border-dashed border-border p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarDays aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Belum ada arsip tahun</EmptyTitle>
                  <EmptyDescription>
                    Tambahkan tahun baru melalui panel hierarki di sebelah
                    kanan.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Pilih tahun"
              >
                {[...years]
                  .sort((left, right) => right.year - left.year)
                  .map((year) => {
                    const isSelected = selectedYearId === year.id;
                    return (
                      <Button
                        key={year.id}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="lg"
                        aria-pressed={isSelected}
                        onClick={() => onSelectYear(year.id)}
                        className="min-h-11"
                      >
                        {cleanYearLabel(year.label)}
                      </Button>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <section
          className="flex flex-col gap-4"
          aria-labelledby="profiler-teams-title"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <h2
                  id="profiler-teams-title"
                  className="font-outfit text-lg font-semibold tracking-tight text-foreground"
                >
                  Tim aktif
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pilih tim untuk membuka daftar batch yang tersedia.
              </p>
            </div>
            {selectedYearId && teams.length > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {teams.length} tim
              </Badge>
            )}
          </div>

          {!selectedYearId ? (
            <Empty className="min-h-40 border border-dashed border-border p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDays aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Pilih tahun terlebih dahulu</EmptyTitle>
                <EmptyDescription>
                  Tim dan batch akan muncul setelah tahun dipilih.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : teams.length === 0 ? (
            <Empty className="min-h-48 border border-dashed border-border p-8">
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
                  onClick={() => onAddFolder(selectedYearId)}
                  className="min-h-11"
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Buat tim pertama
                </Button>
              )}
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => {
                const teamBatches = batchesByTeam.get(team.id) ?? [];
                const batchCount = teamBatches.length;
                const isActive = selectedTeamId === team.id;
                const hasSubfolders = batchCount > 0;

                return (
                  <Button
                    key={team.id}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="lg"
                    aria-expanded={hasSubfolders ? isActive : undefined}
                    aria-controls={hasSubfolders ? batchSectionId : undefined}
                    onClick={() => {
                      if (hasSubfolders && isActive) {
                        focusBatchSection();
                        return;
                      }

                      onSelectTeam(team.id);
                      if (hasSubfolders) {
                        shouldScrollToBatchesRef.current = true;
                        return;
                      }
                      onSelectBatch(team.id, team.name);
                    }}
                    className="group h-auto min-h-32 w-full flex-col items-stretch justify-start gap-4 p-4 text-left whitespace-normal"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getDynamicIcon(team.name, 17)}
                      </span>
                      <Badge
                        variant={isActive ? "secondary" : "outline"}
                        className="shrink-0 tabular-nums"
                      >
                        {hasSubfolders
                          ? `${batchCount} batch`
                          : counts[team.name] > 0
                            ? `${counts[team.name]} subjek`
                            : "Kosong"}
                      </Badge>
                    </span>
                    <span className="break-words font-outfit text-base font-semibold tracking-tight">
                      {team.name}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </section>

        <AnimatePresence>
          {selectedTeam && (
            <motion.section
              ref={batchSectionRef}
              id={batchSectionId}
              data-focus-state={
                isBatchSectionHighlighted ? "highlighted" : "idle"
              }
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
              transition={contentTransition}
              className="scroll-mt-24"
            >
              <Card
                className={cn(
                  "border-border bg-card py-0 ring-0 transition-colors duration-200",
                  isBatchSectionHighlighted && "border-foreground/40",
                )}
              >
                <CardHeader className="gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Layers
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                      <CardTitle className="font-outfit text-base font-semibold">
                        Batch di {selectedTeam.name}
                      </CardTitle>
                      {batches.length > 0 && (
                        <Badge variant="secondary" className="tabular-nums">
                          {batches.length} batch
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      Pilih batch untuk membuka workspace peserta.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {batches.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={focusBatchSection}
                        className="min-h-11"
                      >
                        Fokus daftar
                      </Button>
                    )}
                    {!isReadOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() =>
                          onAddFolder(selectedTeam.year_id!, selectedTeam.id)
                        }
                        className="min-h-11"
                      >
                        <Plus data-icon="inline-start" aria-hidden="true" />
                        Batch baru
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6">
                  {batches.length === 0 ? (
                    <Empty className="min-h-32 border border-dashed border-border p-6">
                      <EmptyHeader>
                        <EmptyTitle>Belum ada batch aktif</EmptyTitle>
                        <EmptyDescription>
                          Tambahkan batch baru atau gunakan tim ini sebagai
                          batch tunggal.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() =>
                          onSelectBatch(selectedTeam.id, selectedTeam.name)
                        }
                        className="min-h-11"
                      >
                        Gunakan tim sebagai batch
                      </Button>
                    </Empty>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {batches.map((batch) => (
                        <Button
                          key={batch.id}
                          type="button"
                          variant="outline"
                          size="lg"
                          onClick={() => onSelectBatch(batch.id, batch.name)}
                          className="group h-auto min-h-28 w-full flex-col items-stretch justify-start gap-4 p-4 text-left whitespace-normal"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                              {getDynamicIcon(batch.name, 15)}
                            </span>
                            {counts[batch.name] > 0 && (
                              <Badge
                                variant="secondary"
                                className="tabular-nums"
                              >
                                {counts[batch.name]} subjek
                              </Badge>
                            )}
                          </span>
                          <span className="break-words text-sm font-semibold tracking-tight">
                            {batch.name}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
