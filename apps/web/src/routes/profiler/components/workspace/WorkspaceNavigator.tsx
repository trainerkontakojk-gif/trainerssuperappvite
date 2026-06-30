import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ProfilerYear, ProfilerFolder } from "@trainers/types";
import {
  CalendarDays,
  Users,
  Layers,
  Plus,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getDynamicIcon, cleanYearLabel } from "./workspace-utils";

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
        ? folders.find((folder) => folder.id === selectedTeamId) ?? null
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
    () => (selectedTeamId ? batchesByTeam.get(selectedTeamId) ?? [] : []),
    [batchesByTeam, selectedTeamId],
  );

  const batchSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToBatchesRef = useRef(false);
  const [isBatchSectionHighlighted, setIsBatchSectionHighlighted] =
    useState(false);
  const batchSectionId = "profiler-batch-section";

  const focusBatchSection = () => {
    setIsBatchSectionHighlighted(true);
    batchSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

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
  }, [batches.length, selectedTeamId]);

  useEffect(() => {
    if (!isBatchSectionHighlighted) return;

    const timeoutId = window.setTimeout(() => {
      setIsBatchSectionHighlighted(false);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [isBatchSectionHighlighted]);

  return (
    <div className="relative z-10 h-full overflow-y-auto p-6 custom-scrollbar md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Intro */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg">
              <Sparkles size={14} className="text-fg2" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg2">
              Operational Studio
            </span>
          </div>
          <h1 className="font-outfit text-3xl font-bold leading-tight tracking-tight text-fg md:text-4xl">
            Profiler <span className="font-light text-fg3">Workspace</span>
          </h1>
        </section>

        {/* Year Selection */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-fg3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
              Pilih Tahun
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...years].sort((left, right) => right.year - left.year).map((year) => (
              <button
                key={year.id}
                onClick={() => onSelectYear(year.id)}
                className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ease-out ${
                  selectedYearId === year.id
                    ? "border-transparent bg-inv-bg font-semibold text-inv-fg shadow-sm"
                    : "border-border bg-surface text-fg hover:bg-background"
                }`}
              >
                {cleanYearLabel(year.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Team Grid */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-fg3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
              Tim Aktif
            </span>
          </div>

          {!selectedYearId ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border border-dashed bg-surface p-8 text-center">
              <p className="text-xs font-medium text-fg3">
                Pilih tahun terlebih dahulu
              </p>
            </div>
          ) : teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border border-dashed bg-surface p-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-fg2">
                <Users size={18} />
              </div>
              <p className="text-xs font-medium text-fg2">
                Belum ada tim terdaftar di tahun ini.
              </p>
              {!isReadOnly && (
                <button
                  onClick={() => onAddFolder(selectedYearId)}
                  className="rounded-lg bg-inv-bg px-4 py-2 text-xs font-medium text-inv-fg transition-opacity hover:opacity-90"
                >
                  Buat Tim Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => {
                const teamBatches = batchesByTeam.get(team.id) ?? [];
                const batchCount = teamBatches.length;
                const isActive = selectedTeamId === team.id;
                const hasSubfolders = batchCount > 0;

                return (
                  <button
                    key={team.id}
                    type="button"
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
                    className={`group relative overflow-hidden rounded-lg border p-4 text-left transition-all duration-150 ease-out ${
                      isActive
                        ? "border-fg bg-surface ring-1 ring-fg/10"
                        : "border-border bg-surface text-fg hover:border-fg3 hover:bg-surface/80"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-background transition-all duration-150 ${
                          isActive
                            ? "border-fg text-fg"
                            : "border-border text-fg2 group-hover:border-fg3"
                        }`}
                      >
                        {getDynamicIcon(team.name, 16)}
                      </div>
                      <div
                        className={`flex items-center gap-1.5 text-[10px] font-medium ${
                          isActive ? "text-fg" : "text-fg3"
                        }`}
                      >
                        {hasSubfolders && (
                          <Layers
                            size={10}
                            className={isActive ? "text-fg" : "text-fg3"}
                          />
                        )}
                        <span className="tabular-nums">
                          {hasSubfolders
                            ? `${batchCount} batch`
                            : counts[team.name] > 0
                              ? `${counts[team.name]} subjek`
                              : "Kosong"}
                        </span>
                      </div>
                    </div>

                    <h3 className="truncate font-outfit text-sm font-semibold tracking-tight text-fg">
                      {team.name}
                    </h3>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Batch Selection (Dock) */}
        <AnimatePresence>
          {selectedTeam && (
            <motion.section
              ref={batchSectionRef}
              id={batchSectionId}
              data-focus-state={
                isBatchSectionHighlighted ? "highlighted" : "idle"
              }
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`space-y-4 border-t pt-8 scroll-mt-24 transition-all duration-200 ${
                isBatchSectionHighlighted
                  ? "border-fg/30"
                  : "border-border"
              }`}
            >
              <div
                className={`flex flex-col gap-2 rounded-2xl border p-4 transition-all md:flex-row md:items-center md:justify-between ${
                  isBatchSectionHighlighted
                    ? "border-fg/20 bg-background shadow-sm ring-1 ring-fg/10"
                    : "border-border bg-surface/80"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-fg3" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-fg2">
                      Navigator Batch <span className="mx-2 text-border">/</span>{" "}
                      {selectedTeam.name}
                    </span>
                    {batches.length > 0 && (
                      <span className="text-[10px] font-medium tabular-nums text-fg3">
                        {batches.length} batch
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {batches.length > 0 && (
                    <button
                      type="button"
                      onClick={focusBatchSection}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-fg2 transition-colors hover:bg-surface hover:text-fg"
                    >
                      Fokus Ulang Daftar
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      onClick={() => onAddFolder(selectedTeam.year_id!, selectedTeam.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg2 transition-colors hover:bg-background hover:text-fg"
                    >
                      <Plus size={12} />
                      Batch Baru
                    </button>
                  )}
                </div>
              </div>

              {batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed bg-surface p-8 text-center">
                  <p className="text-xs font-medium text-fg3">
                    Belum ada batch aktif di tim ini.
                  </p>
                  <button
                    onClick={() => onSelectBatch(selectedTeam.id, selectedTeam.name)}
                    className="text-[11px] font-medium text-fg2 hover:underline"
                  >
                    Gunakan tim sebagai batch tunggal?
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => onSelectBatch(batch.id, batch.name)}
                      className="group flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 text-left text-fg transition-all duration-150 ease-out hover:border-fg3 hover:bg-surface/80"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-fg2 transition-all duration-150 ease-out group-hover:border-fg3">
                          {getDynamicIcon(batch.name, 14)}
                        </div>
                        {counts[batch.name] > 0 && (
                          <span className="text-[10px] font-mono text-fg3">
                            {counts[batch.name]} Subjek
                          </span>
                        )}
                      </div>
                      <span className="truncate text-sm font-semibold tracking-tight text-fg">
                        {batch.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
