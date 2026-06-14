

import React from 'react';
import { ChevronLeft, Moon, Sun, Sidebar } from 'lucide-react';
import { useThemeMode } from '../../../../hooks/useThemeMode';
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
  const { theme, setTheme } = useThemeMode();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col leading-none">
          <span className="text-[9px] font-medium uppercase tracking-wider text-fg3">Module</span>
          <span className="mt-0.5 text-xs font-outfit font-bold tracking-tight uppercase text-fg">
            Kotak Tool Profile
          </span>
        </div>

        <div className="h-4 w-px bg-border hidden md:block" />

        <nav className="hidden md:flex items-center gap-2">
          {activeYearLabel && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium tracking-wide text-fg3">{activeYearLabel}</span>
              <ChevronLeft size={10} className="rotate-180 text-fg3" />
            </div>
          )}
          {activeTeam && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium tracking-wide text-fg2">{activeTeam}</span>
              {activeBatch && <ChevronLeft size={10} className="rotate-180 text-fg3" />}
            </div>
          )}
          {activeBatch && (
            <motion.span 
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-semibold tracking-wide text-fg"
            >
              {activeBatch}
            </motion.span>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-fg2 hover:text-fg hover:bg-background transition-all duration-150 ease-out border border-border focus-visible:outline-none"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        
        <button
          onClick={onToggleSidebar}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-fg2 hover:text-fg hover:bg-background transition-all duration-150 ease-out border border-border"
        >
          <Sidebar size={14} />
        </button>
      </div>
    </header>
  );
}
