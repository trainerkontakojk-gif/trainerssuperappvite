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
        className="group flex items-center gap-5 p-5 bg-surface border border-border rounded-xl text-left hover:border-fg3 hover:bg-surface/80 transition-all duration-150 shadow-sm"
      >
        <div className="w-12 h-12 rounded-lg border border-border flex items-center justify-center text-fg2 bg-background transition-colors duration-150 shrink-0">
          <Cake size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
            Upcoming Birthdays
          </span>
          {nearestBirthday ? (
            <div className="mt-1">
              <p className="text-base font-outfit font-bold tracking-tight text-fg truncate leading-tight">
                {nearestBirthday.nama}
              </p>
              <p className="text-[11px] text-fg2 mt-0.5">
                {nearestBirthday.days === 0 ? 'Celebrate Today!' : `In ${nearestBirthday.days} days`}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-fg3 italic">No data available</p>
          )}
        </div>
      </button>

      {/* Stats Quick Insight */}
      <div className="flex items-center gap-5 p-5 bg-surface border border-border rounded-xl shadow-sm">
        <div className="w-12 h-12 rounded-lg border border-border flex items-center justify-center text-fg2 bg-background shrink-0">
          <PieChart size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
            Quick Analysis
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold tracking-tight text-fg">{totalPeserta}</span>
            <span className="text-xs font-medium text-fg2">Profiles</span>
          </div>
          <p className="text-[10px] text-fg3 truncate mt-0.5">
            {batchName}
          </p>
        </div>
      </div>

      {/* Action Prompt / Tip */}
      <div className="hidden lg:flex items-center gap-5 p-5 bg-surface border border-dashed border-border rounded-xl">
        <div className="w-12 h-12 rounded-lg border border-dashed border-border flex items-center justify-center text-fg3 bg-background shrink-0">
          <Info size={22} />
        </div>
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">
            Workspace Tip
          </span>
          <p className="mt-1 text-xs text-fg2 leading-relaxed">
            Gunakan fitur filter tim di hierarchy panel untuk navigasi yang lebih cepat.
          </p>
        </div>
      </div>
    </div>
  );
}
