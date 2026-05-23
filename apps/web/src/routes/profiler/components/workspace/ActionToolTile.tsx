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
        group relative flex flex-col gap-4 p-6 bg-card border border-border/40 rounded-[2rem] text-left transition-all
        hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 active:translate-y-0
        ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <div className={`
        w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3
        ${accentConfig[accent]}
      `}>
        {icon}
      </div>
      
      <div className="space-y-1">
        <h4 className="text-base font-black tracking-tight text-foreground group-hover:text-primary transition-colors">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed font-medium">
          {desc}
        </p>
      </div>

      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
        <div className="w-6 h-6 rounded-full bg-primary/5 flex items-center justify-center text-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14m-7-7 7 7-7 7"/>
          </svg>
        </div>
      </div>
    </button>
  );
}
