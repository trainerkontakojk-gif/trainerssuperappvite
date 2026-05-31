import React from 'react';
import { GripVertical, Check, ChevronDown, Plus, FilterX, Save, Activity } from 'lucide-react';
import type { ProfilerPeserta } from '@trainers/types';
import { labelJabatan } from '@trainers/types';
import QaStatePanel from '../../../../components/ui/QaStatePanel';
import { getPhotoFrame, getPhotoImageStyle } from '../../../../lib/photo-frame';

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === 'string' && p.id.length > 0 ? p.id : null;

interface ProfilerTableViewProps {
  displayList: ProfilerPeserta[];
  sortMode: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  density: 'comfortable' | 'compact';
  isReadOnly: boolean;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  setSelectedPeserta: (p: ProfilerPeserta) => void;
  onViewAnalysis: (id: string) => void;
  onAddPeserta: () => void;
  dragIndex: number | null;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: () => void;
  handleDragEnd: () => void;
}

export const ProfilerTableView: React.FC<ProfilerTableViewProps> = ({
  displayList,
  sortMode,
  selectMode,
  selectedIds,
  toggleSelect,
  density,
  isReadOnly,
  hasActiveFilters,
  resetFilters,
  setSelectedPeserta,
  onViewAnalysis,
  onAddPeserta,
  dragIndex,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
}) => {
  if (displayList.length === 0) {
    return (
      <div className="bg-card rounded-[2rem] p-4 sm:p-8 border border-border/40 shadow-sm">
        {hasActiveFilters ? (
          <QaStatePanel
            type="empty"
            title="Data sesuai filter belum ditemukan"
            description="Tidak ada peserta yang cocok dengan filter atau kata kunci saat ini. Sesuaikan filter untuk melanjutkan."
            action={
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-background hover:bg-muted border border-border/40 text-foreground rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FilterX className="w-4 h-4" /> Reset Semua Filter
              </button>
            }
          />
        ) : (
          <QaStatePanel
            type="empty"
            title="Folder ini belum memiliki peserta"
            description="Tambahkan peserta pertama untuk mulai menyusun profil batch."
            action={
              !isReadOnly && (
                <button
                  onClick={onAddPeserta}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="w-4 h-4" /> Tambah Peserta Pertama
                </button>
              )
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[2rem] overflow-hidden divide-y divide-border/40 border border-border/40 shadow-sm">
      {displayList.map((p, i) => {
        const rowId = selectableId(p);
        const isSelected = rowId ? selectedIds.has(rowId) : false;
        const isDragging = sortMode && dragIndex === i;

        return (
          <div
            key={rowId || p.id}
            draggable={sortMode}
            onDragStart={sortMode ? (e) => handleDragStart(e, i) : undefined}
            onDragOver={sortMode ? (e) => handleDragOver(e, i) : undefined}
            onDragLeave={sortMode ? handleDragLeave : undefined}
            onDragEnd={sortMode ? handleDragEnd : undefined}
            className={`group relative flex items-center gap-4 transition-colors ${
              sortMode
                ? isDragging
                  ? 'opacity-40 bg-primary/5 cursor-grabbing scale-[0.98]'
                  : 'cursor-grab hover:bg-muted/30 select-none'
                : isSelected && selectMode
                ? 'bg-primary/5'
                : 'hover:bg-muted/30'
            } ${density === 'compact' ? 'px-3 py-2.5 sm:px-4 sm:py-3' : 'px-4 py-3.5 sm:px-6 sm:py-5'}`}
          >
            {sortMode ? (
              <div className="text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0">
                <GripVertical className="w-5 h-5" />
              </div>
            ) : selectMode ? (
              <button
                onClick={() => rowId && toggleSelect(rowId)}
                disabled={!rowId}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? 'bg-primary border-primary shadow-md shadow-primary/20'
                    : 'border-border/60 hover:border-primary/40'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
              </button>
            ) : (
              <span className="text-[10px] font-black text-muted-foreground/30 w-5 text-right flex-shrink-0 font-mono tabular-nums group-hover:text-primary/40 transition-colors">
                {(i + 1).toString().padStart(2, '0')}
              </span>
            )}

            <div className="relative shrink-0">
              <div
                onClick={() => {
                  if (sortMode) return;
                  if (selectMode && rowId) {
                    toggleSelect(rowId);
                    return;
                  }
                  setSelectedPeserta(p);
                }}
                className={`rounded-[1.25rem] border border-border/40 overflow-hidden bg-muted/20 transition-colors group-hover:border-primary/40 cursor-pointer ${
                  density === 'compact' ? 'w-10 h-10 sm:w-11 sm:h-11' : 'w-12 h-12 sm:w-14 sm:h-14'
                }`}
              >
                {p.foto_url ? (
                  <img
                    src={p.foto_url}
                    alt={p.nama}
                    className="object-cover w-full h-full"
                    style={getPhotoImageStyle(getPhotoFrame(p.id, p.photo_frame))}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-lg font-black text-muted-foreground/40">
                      {p.nama?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              onClick={() => {
                if (sortMode) return;
                if (selectMode && rowId) {
                  toggleSelect(rowId);
                  return;
                }
                setSelectedPeserta(p);
              }}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <h3
                  className={`font-bold text-foreground truncate group-hover:text-primary transition-colors leading-none tracking-tight ${
                    density === 'compact' ? 'text-sm' : 'text-base'
                  }`}
                >
                  {p.nama}
                </h3>
                {p.jabatan && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    {labelJabatan[p.jabatan] || p.jabatan}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 min-w-0">
                  <div className="w-1 h-1 rounded-full bg-border shrink-0" />
                  <span className="truncate max-w-[140px]">{p.tim || 'Tanpa Tim'}</span>
                </span>
                {p.nik_ojk && (
                  <span className="text-[11px] text-muted-foreground/60 font-mono tracking-tighter truncate max-w-[120px]">
                    #{p.nik_ojk}
                  </span>
                )}
              </div>
            </div>

            {!sortMode && !selectMode && (
              <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeserta(p);
                  }}
                  className="p-2.5 bg-card hover:bg-primary/5 text-muted-foreground hover:text-primary rounded-xl transition-all border border-transparent hover:border-primary/20"
                  title="Edit Data"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (p.id) onViewAnalysis(p.id);
                  }}
                  className="p-2.5 bg-card hover:bg-module-sidak/5 text-muted-foreground hover:text-module-sidak rounded-xl transition-all border border-transparent hover:border-module-sidak/20"
                  title="Lihat Analisis QA"
                >
                  <Activity className="w-4 h-4" />
                </button>
              </div>
            )}

            {!sortMode && !selectMode && (
              <div className="sm:hidden text-muted-foreground/30">
                <ChevronDown className="-rotate-90 w-5 h-5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
