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
    <div className="relative overflow-hidden rounded-[3rem] bg-primary p-8 md:p-12 text-primary-foreground shadow-2xl shadow-primary/20">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
        <svg viewBox="0 0 400 400" className="w-full h-full">
          <circle cx="400" cy="0" r="400" fill="white" />
        </svg>
      </div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
        <div className="space-y-4 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md">
            <Layers size={12} className="text-white/80" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Active Workspace</span>
          </div>
          
          <h2 className="text-5xl font-black tracking-tighter leading-[0.8] drop-shadow-sm">
            {name}
          </h2>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Registered Data</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tighter">{count}</span>
                <span className="text-xs font-bold text-white/60">Participants</span>
                {loading && <Loader2 size={14} className="animate-spin text-white/40" />}
              </div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Access Mode</span>
              <span className="text-xs font-black uppercase tracking-widest text-white/80">
                {isReadOnly ? 'Read Only' : 'Full Control'}
              </span>
            </div>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto">
            <button
              onClick={onPickPeserta}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-primary rounded-[1.5rem] text-sm font-black uppercase tracking-widest shadow-xl shadow-black/10 hover:scale-105 active:scale-95 transition-all"
            >
              <UserPlus size={18} />
              Import Context
            </button>
            <button
              onClick={onAddPeserta}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white/10 border border-white/20 backdrop-blur-md text-white rounded-[1.5rem] text-sm font-black uppercase tracking-widest hover:bg-white/20 transition-all"
            >
              <Plus size={18} />
              New Entry
            </button>
          </div>
        )}
      </div>
      
      {/* Floating accent icon */}
      <div className="absolute -bottom-6 -right-6 opacity-5 rotate-12 scale-[3] pointer-events-none">
        <Layers size={100} />
      </div>
    </div>
  );
}
