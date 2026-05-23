'use client';

import React from 'react';
import { Cake, PieChart, Info } from 'lucide-react';

interface Birthday {
  nama: string;
  tglLahir: string;
  days: number;
  age: number;
}

interface InsightPanelProps {
  upcomingBirthdays: Birthday[];
  totalPeserta: number;
  batchName: string;
  onShowBirthdays: () => void;
}

export default function InsightPanel({
  upcomingBirthdays,
  totalPeserta,
  batchName,
  onShowBirthdays
}: InsightPanelProps) {
  const nearestBirthday = upcomingBirthdays[0] ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Birthday Widget */}
      <button
        onClick={onShowBirthdays}
        className="group flex items-center gap-6 p-6 bg-card border border-border/40 rounded-[2.5rem] text-left hover:border-module-profiler hover:shadow-2xl hover:shadow-module-profiler/5 transition-all"
      >
        <div className="w-16 h-16 rounded-[1.5rem] bg-module-profiler/5 flex items-center justify-center text-module-profiler transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
          <Cake size={32} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 group-hover:text-module-profiler transition-colors">
            Upcoming Birthdays
          </span>
          {nearestBirthday ? (
            <div className="mt-1">
              <p className="text-lg font-black tracking-tight text-foreground truncate leading-tight">
                {nearestBirthday.nama}
              </p>
              <p className="text-xs font-bold text-module-profiler uppercase tracking-widest mt-0.5">
                {nearestBirthday.days === 0 ? 'Celebrate Today!' : `In ${nearestBirthday.days} days`}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-muted-foreground italic">No data available</p>
          )}
        </div>
      </button>

      {/* Stats Quick Insight */}
      <div className="flex items-center gap-6 p-6 bg-card border border-border/40 rounded-[2.5rem]">
        <div className="w-16 h-16 rounded-[1.5rem] bg-primary/5 flex items-center justify-center text-primary">
          <PieChart size={32} />
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            Quick Analysis
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tighter text-foreground">{totalPeserta}</span>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Profiles</span>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest truncate">
            {batchName}
          </p>
        </div>
      </div>

      {/* Action Prompt / Tip */}
      <div className="hidden lg:flex items-center gap-6 p-6 bg-accent/30 border border-dashed border-border/60 rounded-[2.5rem]">
        <div className="w-16 h-16 rounded-[1.5rem] bg-muted flex items-center justify-center text-muted-foreground/40">
          <Info size={32} />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            Workspace Tip
          </span>
          <p className="mt-1 text-xs font-medium text-muted-foreground leading-relaxed">
            Gunakan fitur filter tim di hierarchy panel untuk navigasi yang lebih cepat.
          </p>
        </div>
      </div>
    </div>
  );
}
