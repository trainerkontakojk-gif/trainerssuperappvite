'use client';

import React from 'react';
import { UserPlus, Plus, Loader2, Layers } from 'lucide-react';

interface BatchHeroProps {
  name: string;
  count: number;
  loading?: boolean;
  isReadOnly?: boolean;
  onAddPeserta?: () => void;
  onPickPeserta?: () => void;
}

export default function BatchHero({
  name,
  count,
  loading = false,
  isReadOnly = false,
  onAddPeserta,
  onPickPeserta
}: BatchHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface p-8 md:p-10 text-fg border border-border shadow-sm">
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
        <div className="space-y-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-background border border-border">
            <Layers size={11} className="text-fg2" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg2">Active Workspace</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-outfit font-bold tracking-tight text-fg leading-none">
            {name}
          </h2>
          
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">Registered Data</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-4xl md:text-5xl font-mono font-bold tracking-tight">{count}</span>
                <span className="text-xs font-medium text-fg2">Participants</span>
                {loading && <Loader2 size={12} className="animate-spin text-fg3" />}
              </div>
            </div>
            <div className="hidden sm:block w-px h-10 bg-border" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">Access Mode</span>
              <span className="text-xs font-semibold text-fg mt-1">
                {isReadOnly ? 'Read Only' : 'Full Control'}
              </span>
            </div>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full md:w-auto">
            <button
              onClick={onPickPeserta}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-inv-bg text-inv-fg rounded-lg text-xs font-medium hover:opacity-90 transition-all duration-150"
            >
              <UserPlus size={16} />
              Import Context
            </button>
            <button
              onClick={onAddPeserta}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-transparent text-fg border border-border rounded-lg text-xs font-medium hover:bg-background transition-colors duration-150"
            >
              <Plus size={16} />
              New Entry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
