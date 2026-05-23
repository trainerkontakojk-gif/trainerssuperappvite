

import React from 'react';
import { ChevronLeft, Moon, Sun, Sidebar } from 'lucide-react';
import { useThemeMode } from '../../../../hooks/useThemeMode';
import { useNavigate } from '@tanstack/react-router';
import { motion } from 'framer-motion';

interface WorkspaceHeaderProps {
  onToggleSidebar?: () => void;
  activeBatch?: string;
  activeTeam?: string;
  activeYearLabel?: string;
}

export default function WorkspaceHeader({
  onToggleSidebar,
  activeBatch,
  activeTeam,
  activeYearLabel
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeMode();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border/40 bg-card/30 px-6 py-3 backdrop-blur-2xl">
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={() => navigate({ to: '/dashboard' })}
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-all"
        >
          <div className="w-8 h-8 rounded-xl bg-accent/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          </div>
          <span className="hidden sm:block">Exit Workspace</span>
        </button>

        <div className="h-4 w-px bg-border/40 hidden md:block" />

        <nav className="hidden md:flex items-center gap-2">
          {activeYearLabel && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">{activeYearLabel}</span>
              <ChevronLeft size={10} className="rotate-180 text-muted-foreground/20" />
            </div>
          )}
          {activeTeam && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{activeTeam}</span>
              {activeBatch && <ChevronLeft size={10} className="rotate-180 text-muted-foreground/20" />}
            </div>
          )}
          {activeBatch && (
            <motion.span 
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-bold uppercase tracking-widest text-primary"
            >
              {activeBatch}
            </motion.span>
          )}
        </nav>
      </div>

      <div className="flex flex-col items-center text-center leading-none">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">Module</span>
        <span className="mt-1 text-sm font-black tracking-tight flex items-center gap-2">
          PROFILER<span className="text-module-profiler">/</span>KTP
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 flex-1">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent/30 text-muted-foreground hover:text-primary transition-all border border-border/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        
        <button
          onClick={onToggleSidebar}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-accent/30 text-muted-foreground hover:text-primary transition-all border border-border/40"
        >
          <Sidebar size={16} />
        </button>
      </div>
    </header>
  );
}
