

import React from 'react';
import type { ProfilerYear, ProfilerFolder } from '@trainers/types';
import { 
  CalendarDays, Users, Layers, Plus, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDynamicIcon, cleanYearLabel } from './workspace-utils';

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
  counts
}: WorkspaceNavigatorProps) {
  const teams = selectedYearId 
    ? folders.filter(f => f.year_id === selectedYearId && !f.parent_id) 
    : [];
  
  const selectedTeam = selectedTeamId ? folders.find(f => f.id === selectedTeamId) : null;
  
  const batches = selectedTeamId 
    ? folders.filter(f => f.parent_id === selectedTeamId) 
    : [];

  return (
    <div className="h-full p-8 md:p-12 overflow-y-auto custom-scrollbar relative z-10">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Intro */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-fg bg-surface">
              <Sparkles size={14} className="text-fg2" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg2">Operational Studio</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-outfit font-bold tracking-tight text-fg leading-tight">
            Profiler <span className="text-fg3 font-light">Workspace</span>
          </h1>
          <p className="text-xs text-fg2 max-w-md leading-relaxed">
            Pusat kendali manajemen data peserta. Silakan pilih tahun dan tim untuk mengakses kontrol batch.
          </p>
        </section>

        {/* Year Selection */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 text-fg3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">Pilih Tahun</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...years].sort((a,b) => b.year - a.year).map((year) => (
              <button
                key={year.id}
                onClick={() => onSelectYear(year.id)}
                className={`
                  px-4 py-2 rounded-lg text-xs font-medium border transition-all duration-150 ease-out
                  ${selectedYearId === year.id
                    ? 'bg-inv-bg text-inv-fg border-transparent font-semibold shadow-sm'
                    : 'bg-surface text-fg border-border hover:bg-background'
                  }
                `}
              >
                {cleanYearLabel(year.label)}
              </button>
            ))}
          </div>
        </section>

        {/* Team Grid */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-fg3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">Tim Aktif</span>
          </div>
          
          {!selectedYearId ? (
            <div className="p-8 border border-dashed border-border rounded-xl bg-surface flex flex-col items-center justify-center text-center gap-2">
              <p className="text-xs font-medium text-fg3">Pilih tahun terlebih dahulu</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="p-12 border border-dashed border-border rounded-xl bg-surface flex flex-col items-center justify-center text-center gap-4">
              <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-fg2 bg-background">
                <Users size={18} />
              </div>
              <p className="text-xs font-medium text-fg2">Belum ada tim terdaftar di tahun ini.</p>
              {!isReadOnly && (
                <button
                  onClick={() => onAddFolder(selectedYearId)}
                  className="px-4 py-2 bg-inv-bg text-inv-fg rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Buat Tim Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teams.map((team) => {
                const batchCount = folders.filter((f) => f.parent_id === team.id).length;
                const isActive = selectedTeamId === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => {
                      onSelectTeam(team.id);
                      if (batchCount === 0) {
                        onSelectBatch(team.id, team.name);
                      }
                    }}
                    className={`
                      group relative overflow-hidden rounded-xl border p-5 text-left transition-all duration-150 ease-out
                      ${isActive
                        ? 'border-fg bg-surface shadow-sm'
                        : 'border-border bg-surface hover:border-fg3 hover:bg-surface/80 text-fg'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`
                        w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-150 bg-background
                        ${isActive ? 'border-fg text-fg' : 'border-border text-fg2 group-hover:border-fg3'}
                      `}>
                        {getDynamicIcon(team.name, 16)}
                      </div>
                      <span className="text-[10px] font-medium tracking-wide text-fg3 uppercase">
                        {batchCount > 0 ? `${batchCount} Batch` : (counts[team.name] > 0 ? `${counts[team.name]} Subjek` : 'Kosong')}
                      </span>
                    </div>
                    <h3 className="font-outfit font-bold text-base tracking-tight truncate text-fg">{team.name}</h3>
                    <p className="text-[10px] mt-1 text-fg3">
                      {batchCount > 0 ? 'Klik untuk kelola batch' : (counts[team.name] > 0 ? 'Klik untuk buka workspace' : 'Belum ada data terdaftar')}
                    </p>
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-4 pt-8 border-t border-border"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-fg3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg2">
                    Navigator Batch <span className="mx-2 text-border">/</span> {selectedTeam.name}
                  </span>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => onAddFolder(selectedTeam.year_id!, selectedTeam.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-surface text-fg2 hover:text-fg hover:bg-background rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus size={12} />
                    Batch Baru
                  </button>
                )}
              </div>

              {batches.length === 0 ? (
                <div className="p-8 border border-dashed border-border rounded-xl bg-surface flex flex-col items-center justify-center text-center gap-3">
                  <p className="text-xs font-medium text-fg3">Belum ada batch aktif di tim ini.</p>
                  <button
                    onClick={() => onSelectBatch(selectedTeam.id, selectedTeam.name)}
                    className="text-[11px] font-medium text-fg2 hover:underline"
                  >
                    Gunakan tim sebagai batch tunggal?
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => onSelectBatch(batch.id, batch.name)}
                      className="group flex flex-col gap-2.5 p-4 bg-surface border border-border rounded-xl text-left hover:border-fg3 hover:bg-surface/80 text-fg transition-all duration-150 ease-out"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 border border-border bg-background text-fg2 flex items-center justify-center rounded-lg group-hover:border-fg3 transition-all duration-150 ease-out">
                          {getDynamicIcon(batch.name, 14)}
                        </div>
                        {counts[batch.name] > 0 && (
                          <span className="text-[10px] font-mono text-fg3">
                            {counts[batch.name]} Subjek
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-sm tracking-tight truncate text-fg">{batch.name}</span>
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
