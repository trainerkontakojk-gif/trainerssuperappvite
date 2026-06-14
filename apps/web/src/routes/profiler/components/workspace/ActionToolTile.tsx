'use client';

import React from 'react';

interface ActionToolTileProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick?: () => void;
  className?: string;
  accent?: 'primary' | 'profiler' | 'pdkt' | 'telefun' | 'sidak' | 'slate';
  disabled?: boolean;
}

const accentConfig = {
  primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-white',
  profiler: 'bg-module-profiler/10 text-module-profiler border-module-profiler/20 hover:bg-module-profiler hover:text-white',
  pdkt: 'bg-module-pdkt/10 text-module-pdkt border-module-pdkt/20 hover:bg-module-pdkt hover:text-white',
  telefun: 'bg-module-telefun/10 text-module-telefun border-module-telefun/20 hover:bg-module-telefun hover:text-white',
  sidak: 'bg-module-sidak/10 text-module-sidak border-module-sidak/20 hover:bg-module-sidak hover:text-white',
  slate: 'bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500 hover:text-white',
};

export default function ActionToolTile({
  icon,
  title,
  desc,
  onClick,
  className = '',
  accent = 'primary',
  disabled = false
}: ActionToolTileProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        group relative flex flex-col gap-4 p-5 bg-surface border border-border rounded-xl text-left transition-all duration-150 ease-out
        hover:border-fg3 hover:bg-surface/90 shadow-sm
        ${disabled ? 'opacity-30 grayscale cursor-not-allowed pointer-events-none' : ''}
        ${className}
      `}
    >
      <div className="w-10 h-10 rounded-lg border border-border flex items-center justify-center bg-background text-fg2 group-hover:text-fg transition-colors duration-150">
        {icon}
      </div>
      
      <div className="space-y-1">
        <h4 className="text-sm font-outfit font-bold tracking-tight text-fg transition-colors">
          {title}
        </h4>
        <p className="text-xs text-fg2 leading-relaxed font-normal">
          {desc}
        </p>
      </div>

      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-2 group-hover:translate-x-0">
        <div className="w-6 h-6 border border-border flex items-center justify-center text-fg2 bg-background rounded-md shadow-sm">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14m-7-7 7 7-7 7"/>
          </svg>
        </div>
      </div>
    </button>
  );
}
