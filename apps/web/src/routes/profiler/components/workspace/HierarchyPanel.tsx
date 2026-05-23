

import React from 'react';
import type { ProfilerYear, ProfilerFolder } from '@trainers/types';
import { 
  Plus, ChevronRight, 
  Pencil, Trash2, Copy, 
  Layers, CalendarDays
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDynamicIcon, cleanYearLabel } from './workspace-utils';

interface HierarchyPanelProps {
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  selectedYearId: string | null;
  selectedFolderId: string | null;
  onSelectYear: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onAddYear: () => void;
  onAddFolder: (yearId: string, parentId?: string) => void;
  onRenameFolder: (folder: ProfilerFolder) => void;
  onDeleteFolder: (folder: ProfilerFolder) => void;
  onDuplicateFolder: (folder: ProfilerFolder) => void;
  counts: Record<string, number>;
  role?: string;
  isMobile?: boolean;
}

export default function HierarchyPanel({
  years,
  folders,
  selectedYearId,
  selectedFolderId,
  onSelectYear,
  onSelectFolder,
  onAddYear,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  counts,
  role = 'trainer',
  isMobile = false
}: HierarchyPanelProps) {
  const isReadOnly = role === 'leader';
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Auto-expand current year
  useEffect(() => {
    if (years.length > 0) {
      const currentYear = new Date().getFullYear();
      const yearToExpand = years.find(y => y.year === currentYear);
      if (yearToExpand) {
        setExpandedYears(prev => ({ ...prev, [yearToExpand.id]: true }));
      } else if (selectedYearId) {
        setExpandedYears(prev => ({ ...prev, [selectedYearId]: true }));
      }
    }
  }, [years, selectedYearId]);

  const toggleYear = (id: string) => {
    setExpandedYears(prev => ({ ...prev, [id]: !prev[id] }));
    onSelectYear(id);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const rootFolders = (yearId: string) => 
    folders.filter(f => f.year_id === yearId && !f.parent_id);
  
  const subFolders = (parentId: string) => 
    folders.filter(f => f.parent_id === parentId);

  return (
    <div className={`
      flex flex-col h-full overflow-hidden relative z-20 
      ${isMobile ? 'w-full' : 'w-72 border-l border-border/40 bg-card/40 backdrop-blur-xl shadow-sm shrink-0'}
    `}>
      <div className="p-6 border-b border-border/40 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60">Navigator</span>
          <h2 className="text-sm font-bold tracking-tight text-foreground">Hierarki</h2>
        </div>
        {!isReadOnly && (
          <button 
            onClick={onAddYear}
            className="w-8 h-8 flex items-center justify-center bg-primary/5 hover:bg-primary hover:text-primary-foreground rounded-xl text-primary transition-all duration-300 border border-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Tambah Tahun"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {years.length === 0 && (
          <div className="p-8 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground/30">
              <CalendarDays size={24} />
            </div>
            <p className="text-xs text-muted-foreground font-medium italic">
              Arsip tidak ditemukan.
            </p>
          </div>
        )}

        {[...years].sort((a,b) => b.year - a.year).map(year => (
          <div key={year.id} className="space-y-1">
            <button
              onClick={() => toggleYear(year.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selectedYearId === year.id 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10 font-bold' 
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              <div className={`transition-transform duration-300 ${expandedYears[year.id] ? 'rotate-90' : ''}`}>
                <ChevronRight size={14} className={selectedYearId === year.id ? 'text-primary-foreground' : 'text-primary/40'} />
              </div>
              <span className="flex-1 text-left text-xs uppercase tracking-widest font-black">
                {cleanYearLabel(year.label)}
              </span>
              {selectedYearId === year.id && (
                <motion.div layoutId="activeYearIndicator" className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
              )}
            </button>

            <AnimatePresence>
              {expandedYears[year.id] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="ml-3 mt-1 space-y-1 overflow-hidden pl-2 border-l border-primary/10"
                >
                  {rootFolders(year.id).length === 0 ? (
                    <div className="py-2 pl-4 text-[10px] text-muted-foreground italic font-medium">
                      Belum ada tim terdaftar.
                    </div>
                  ) : (
                    rootFolders(year.id).map(folder => (
                      <div key={folder.id} className="space-y-1">
                        <div className="group flex items-center gap-1">
                          <button
                            onClick={() => {
                              onSelectFolder(folder.id);
                              if (subFolders(folder.id).length > 0) toggleFolder(folder.id);
                            }}
                            className={`flex-1 flex items-center gap-3 p-2.5 rounded-xl text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              selectedFolderId === folder.id
                                ? 'bg-module-profiler/10 text-module-profiler font-bold border border-module-profiler/20'
                                : 'hover:bg-accent/50 text-foreground/70 border border-transparent'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {subFolders(folder.id).length > 0 ? (
                                <div className={`transition-transform duration-300 ${expandedFolders[folder.id] ? 'rotate-90' : ''}`}>
                                  <ChevronRight size={12} className={selectedFolderId === folder.id ? 'text-module-profiler' : 'text-muted-foreground/40'} />
                                </div>
                              ) : (
                                <div className={selectedFolderId === folder.id ? 'text-module-profiler' : 'text-muted-foreground/40'}>
                                  {getDynamicIcon(folder.name, 12)}
                                </div>
                              )}
                            </div>
                            <span className="flex-1 text-left truncate tracking-tight">{folder.name}</span>
                            {counts[folder.name] > 0 && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                                selectedFolderId === folder.id ? 'bg-module-profiler/20 text-module-profiler' : 'bg-muted text-muted-foreground'
                              }`}>
                                {counts[folder.name]}
                              </span>
                            )}
                          </button>
                          
                          {!isReadOnly && (
                            <div className={`
                              ${isMobile && selectedFolderId === folder.id ? 'flex' : 'hidden group-hover:flex'} 
                              items-center gap-0.5 pr-1 animate-in fade-in slide-in-from-right-2 duration-200
                            `}>
                              <button onClick={(e) => { e.stopPropagation(); onAddFolder(year.id, folder.id); }} className="p-1 hover:bg-primary/10 hover:text-primary rounded text-muted-foreground/40 transition-colors" title="Tambah Batch"><Plus size={12} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onDuplicateFolder(folder); }} className="p-1 hover:bg-primary/10 hover:text-primary rounded text-muted-foreground/40 transition-colors" title="Duplikat"><Copy size={12} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onRenameFolder(folder); }} className="p-1 hover:bg-primary/10 hover:text-primary rounded text-muted-foreground/40 transition-colors" title="Rename"><Pencil size={12} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder); }} className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground/40 transition-colors" title="Hapus"><Trash2 size={12} /></button>
                            </div>
                          )}
                        </div>

                        {expandedFolders[folder.id] && (
                          <div className="ml-4 space-y-1 border-l border-module-profiler/10 pl-2">
                            {subFolders(folder.id).map(sub => (
                              <div key={sub.id} className={`group flex items-center gap-1`}>
                                  <button
                                    onClick={() => onSelectFolder(sub.id)}
                                    className={`flex-1 flex items-center gap-2.5 p-2 rounded-lg text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                      selectedFolderId === sub.id
                                        ? 'bg-module-profiler/5 text-module-profiler font-semibold'
                                        : 'hover:bg-accent/40 text-muted-foreground'
                                    }`}
                                  >
                                    <div className={selectedFolderId === sub.id ? 'text-module-profiler' : 'text-muted-foreground/30'}>
                                      {getDynamicIcon(sub.name, 12)}
                                    </div>
                                    <span className="flex-1 text-left truncate tracking-tight">{sub.name}</span>
                                    {counts[sub.name] > 0 && (
                                      <span className="text-[10px] opacity-50 font-mono">({counts[sub.name]})</span>
                                    )}
                                  </button>
                                  {!isReadOnly && (
                                    <div className={`
                                      ${isMobile && selectedFolderId === sub.id ? 'flex' : 'hidden group-hover:flex'} 
                                      items-center gap-0.5 pr-1 animate-in fade-in slide-in-from-right-1 duration-200
                                    `}>
                                      <button onClick={(e) => { e.stopPropagation(); onRenameFolder(sub); }} className="p-1 hover:bg-primary/10 hover:text-primary rounded text-muted-foreground/40 transition-colors" title="Rename"><Pencil size={12} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(sub); }} className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground/40 transition-colors" title="Hapus"><Trash2 size={12} /></button>
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  
                  {!isReadOnly && (
                    <button
                      onClick={() => onAddFolder(year.id)}
                      className="w-full flex items-center gap-2 p-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:bg-accent/50 hover:text-primary transition-all border border-dashed border-border/60 mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus size={12} />
                      <span>Tim Baru</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <div className="p-6 border-t border-border/40 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-module-profiler/10 flex items-center justify-center text-module-profiler">
            <Layers size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Data</span>
            <span className="text-sm font-bold text-foreground">{folders.length} Node</span>
          </div>
        </div>
      </div>
    </div>
  );
}
