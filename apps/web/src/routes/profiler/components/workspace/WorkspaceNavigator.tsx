

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
            <div className="w-8 h-8 rounded-xl bg-module-profiler/10 flex items-center justify-center text-module-profiler">
              <Sparkles size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-module-profiler">Operational Studio</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-foreground leading-[0.9]">
            PROFILER <br />
            <span className="text-muted-foreground/30">WORKSPACE</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-md font-medium leading-relaxed">
            Pusat kendali manajemen data peserta. Silakan pilih tahun dan tim untuk mengakses kontrol batch.
          </p>
        </section>

        {/* Year Selection */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Pilih Tahun</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...years].sort((a,b) => b.year - a.year).map((year) => (
              <button
                key={year.id}
                onClick={() => onSelectYear(year.id)}
                className={`
                  px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all
                  ${selectedYearId === year.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-xl shadow-primary/20 scale-105'
                    : 'bg-card text-muted-foreground border-border/40 hover:border-primary/20 hover:text-foreground'
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
            <Users className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Tim Aktif</span>
          </div>
          
          {!selectedYearId ? (
            <div className="p-8 border border-dashed border-border/60 rounded-[2rem] bg-accent/5 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-xs font-bold text-muted-foreground/40">Pilih tahun terlebih dahulu</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="p-12 border border-dashed border-border/60 rounded-[3rem] bg-accent/5 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground/20">
                <Users size={24} />
              </div>
              <p className="text-xs font-bold text-muted-foreground/60">Belum ada tim terdaftar di tahun ini.</p>
              {!isReadOnly && (
                <button
                  onClick={() => onAddFolder(selectedYearId)}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  Buat Tim Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      group relative overflow-hidden rounded-[2rem] border p-6 text-left transition-all
                      ${isActive
                        ? 'border-module-profiler bg-module-profiler/5 shadow-xl shadow-module-profiler/10'
                        : 'border-border/40 bg-card hover:border-module-profiler/30'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`
                        w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500
                        ${isActive ? 'bg-module-profiler text-white rotate-6' : 'bg-muted text-muted-foreground group-hover:bg-module-profiler/10 group-hover:text-module-profiler'}
                      `}>
                        {getDynamicIcon(team.name)}
                      </div>
                      <span className="text-[10px] font-black tracking-widest text-muted-foreground/40 uppercase">
                        {batchCount > 0 ? `${batchCount} BATCH` : (counts[team.name] > 0 ? `${counts[team.name]} SUBJEK` : 'KOSONG')}
                      </span>
                    </div>
                    <h3 className="font-black text-lg tracking-tight text-foreground truncate">{team.name}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground/60 mt-1 uppercase tracking-wider">
                      {batchCount > 0 ? 'Klik untuk kelola batch' : (counts[team.name] > 0 ? 'Klik untuk buka workspace' : 'Belum ada data terdaftar')}
                    </p>
                    
                    {isActive && (
                      <motion.div 
                        layoutId="activeTeamRing"
                        className="absolute inset-0 border-2 border-module-profiler pointer-events-none rounded-[2rem]"
                        initial={false}
                      />
                    )}
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4 pt-4 border-t border-border/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                    Navigator Batch <span className="mx-2 text-muted-foreground/20">/</span> {selectedTeam.name}
                  </span>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => onAddFolder(selectedTeam.year_id!, selectedTeam.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-module-profiler/10 text-module-profiler rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-module-profiler hover:text-white transition-all"
                  >
                    <Plus size={12} />
                    Batch Baru
                  </button>
                )}
              </div>

              {batches.length === 0 ? (
                <div className="p-8 border border-dashed border-border/40 rounded-3xl bg-accent/5 flex flex-col items-center justify-center text-center gap-3">
                  <p className="text-xs font-bold text-muted-foreground/60">Belum ada batch aktif di tim ini.</p>
                  <button
                    onClick={() => onSelectBatch(selectedTeam.id, selectedTeam.name)}
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-module-profiler hover:underline"
                  >
                    Gunakan tim sebagai batch tunggal?
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => onSelectBatch(batch.id, batch.name)}
                      className="group flex flex-col gap-2 p-5 bg-card border border-border/40 rounded-2xl text-left hover:border-module-profiler hover:shadow-lg hover:shadow-module-profiler/5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-lg bg-muted group-hover:bg-module-profiler/10 flex items-center justify-center text-muted-foreground/40 group-hover:text-module-profiler transition-all">
                          {getDynamicIcon(batch.name, 14)}
                        </div>
                        {counts[batch.name] > 0 && (
                          <span className="text-[10px] font-black font-mono text-muted-foreground/40 group-hover:text-module-profiler">
                            {counts[batch.name]} SUBJEK
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-sm tracking-tight truncate">{batch.name}</span>
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
