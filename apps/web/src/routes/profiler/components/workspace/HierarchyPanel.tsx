

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
      ${isMobile ? 'w-full' : 'w-72 border-l border-border bg-surface shrink-0'}
    `}>
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg3">Navigator</span>
          <h2 className="text-sm font-outfit font-bold text-fg">Hierarki</h2>
        </div>
        {!isReadOnly && (
          <button 
            onClick={onAddYear}
            className="w-7 h-7 flex items-center justify-center bg-transparent text-fg2 hover:text-fg hover:bg-background rounded-md transition-all duration-150 border border-border focus-visible:outline-none"
            title="Tambah Tahun"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {years.length === 0 && (
          <div className="p-8 text-center flex flex-col items-center gap-3 border border-dashed border-border rounded-xl bg-background">
            <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-fg3 bg-surface">
              <CalendarDays size={20} />
            </div>
            <p className="text-xs text-fg2 font-medium">
              Arsip tidak ditemukan.
            </p>
          </div>
        )}

        {[...years].sort((a,b) => b.year - a.year).map(year => (
          <div key={year.id} className="space-y-1">
            <button
              onClick={() => toggleYear(year.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 ease-out group focus-visible:outline-none border ${
                selectedYearId === year.id 
                  ? 'bg-inv-bg text-inv-fg border-transparent font-semibold' 
                  : 'hover:bg-background/80 text-fg2 hover:text-fg border-transparent'
              }`}
            >
              <div className={`transition-transform duration-300 ${expandedYears[year.id] ? 'rotate-90' : ''}`}>
                <ChevronRight size={12} className={selectedYearId === year.id ? 'text-inv-fg/80' : 'text-fg3'} />
              </div>
              <span className="flex-1 text-left text-xs font-semibold tracking-wide">
                {cleanYearLabel(year.label)}
              </span>
              {selectedYearId === year.id && (
                <motion.div layoutId="activeYearIndicator" className="w-1.5 h-1.5 rounded-full bg-inv-fg" />
              )}
            </button>

            <AnimatePresence>
              {expandedYears[year.id] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="ml-3 mt-0.5 space-y-1 overflow-hidden pl-3 border-l border-border"
                >
                  {rootFolders(year.id).length === 0 ? (
                    <div className="py-2 pl-2 text-[10px] text-fg3 font-medium italic">
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
                            className={`flex-1 flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ease-out focus-visible:outline-none border ${
                              selectedFolderId === folder.id
                                ? 'bg-inv-bg text-inv-fg font-semibold border-transparent'
                                : 'hover:bg-background/80 text-fg2 hover:text-fg border-transparent'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {subFolders(folder.id).length > 0 ? (
                                <div className={`transition-transform duration-300 ${expandedFolders[folder.id] ? 'rotate-90' : ''}`}>
                                  <ChevronRight size={12} className={selectedFolderId === folder.id ? 'text-inv-fg/80' : 'text-fg3'} />
                                </div>
                              ) : (
                                <div className={selectedFolderId === folder.id ? 'text-inv-fg/80' : 'text-fg3'}>
                                  {getDynamicIcon(folder.name, 12)}
                                </div>
                              )}
                            </div>
                            <span className="flex-1 text-left truncate font-medium">{folder.name}</span>
                            {counts[folder.name] > 0 && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${
                                selectedFolderId === folder.id ? 'bg-surface text-fg border-border' : 'bg-background border-border text-fg2'
                              }`}>
                                {counts[folder.name]}
                              </span>
                            )}
                          </button>
                          
                          {!isReadOnly && (
                            <div className={`
                              ${isMobile && selectedFolderId === folder.id ? 'flex' : 'hidden group-hover:flex'} 
                              items-center gap-0.5 pr-1 animate-in fade-in slide-in-from-right-2 duration-150
                            `}>
                              <button onClick={(e) => { e.stopPropagation(); onAddFolder(year.id, folder.id); }} className="p-1 border border-border rounded-md hover:bg-background text-fg2 hover:text-fg transition-colors" title="Tambah Batch"><Plus size={11} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onDuplicateFolder(folder); }} className="p-1 border border-border rounded-md hover:bg-background text-fg2 hover:text-fg transition-colors" title="Duplikat"><Copy size={11} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onRenameFolder(folder); }} className="p-1 border border-border rounded-md hover:bg-background text-fg2 hover:text-fg transition-colors" title="Rename"><Pencil size={11} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder); }} className="p-1 border border-border rounded-md hover:bg-destructive/10 text-destructive transition-colors" title="Hapus"><Trash2 size={11} /></button>
                            </div>
                          )}
                        </div>

                        {expandedFolders[folder.id] && (
                          <div className="ml-3 space-y-1 border-l border-border pl-3 mt-0.5">
                            {subFolders(folder.id).map(sub => (
                              <div key={sub.id} className={`group flex items-center gap-1`}>
                                  <button
                                    onClick={() => onSelectFolder(sub.id)}
                                    className={`flex-1 flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-all duration-150 ease-out focus-visible:outline-none border ${
                                      selectedFolderId === sub.id
                                        ? 'bg-inv-bg text-inv-fg font-semibold border-transparent'
                                        : 'hover:bg-background/80 text-fg2 hover:text-fg border-transparent'
                                    }`}
                                  >
                                    <div className={selectedFolderId === sub.id ? 'text-inv-fg/80' : 'text-fg3'}>
                                      {getDynamicIcon(sub.name, 11)}
                                    </div>
                                    <span className="flex-1 text-left truncate font-medium">{sub.name}</span>
                                    {counts[sub.name] > 0 && (
                                      <span className="text-[10px] font-mono text-fg3">({counts[sub.name]})</span>
                                    )}
                                  </button>
                                  {!isReadOnly && (
                                    <div className={`
                                      ${isMobile && selectedFolderId === sub.id ? 'flex' : 'hidden group-hover:flex'} 
                                      items-center gap-0.5 pr-1 animate-in fade-in slide-in-from-right-1 duration-150
                                    `}>
                                      <button onClick={(e) => { e.stopPropagation(); onRenameFolder(sub); }} className="p-1 border border-border rounded-md hover:bg-background text-fg2 hover:text-fg transition-colors" title="Rename"><Pencil size={11} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(sub); }} className="p-1 border border-border rounded-md hover:bg-destructive/10 text-destructive transition-colors" title="Hapus"><Trash2 size={11} /></button>
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
                      className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-fg2 hover:text-fg hover:bg-background transition-all duration-150 ease-out border border-dashed border-border mt-2 focus-visible:outline-none"
                    >
                      <Plus size={11} />
                      <span>Tim Baru</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <div className="p-5 border-t border-border bg-surface">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-fg2 bg-background">
            <Layers size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-fg3 uppercase tracking-wide">Total Data</span>
            <span className="text-xs font-semibold text-fg">{folders.length} Node</span>
          </div>
        </div>
      </div>
    </div>
  );
}
