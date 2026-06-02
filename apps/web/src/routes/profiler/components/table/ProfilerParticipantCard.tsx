import React from 'react';
import { GripVertical, Check, Save, Activity } from 'lucide-react';
import type { ProfilerPeserta } from '@trainers/types';
import { labelJabatan } from '@trainers/types';
import { getPhotoFrame, getPhotoImageStyle } from '../../../../lib/photo-frame';

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === 'string' && p.id.length > 0 ? p.id : null;

interface ProfilerParticipantCardProps {
  p: ProfilerPeserta;
  index: number;
  sortMode: boolean;
  selectMode: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  density: 'comfortable' | 'compact';
  toggleSelect: (id: string) => void;
  setSelectedPeserta: (p: ProfilerPeserta) => void;
  onViewAnalysis: (id: string) => void;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: () => void;
  handleDragEnd: () => void;
}

export const ProfilerParticipantCard: React.FC<ProfilerParticipantCardProps> = ({
  p,
  index,
  sortMode,
  selectMode,
  isSelected,
  isDragging,
  isDragOver,
  density,
  toggleSelect,
  setSelectedPeserta,
  onViewAnalysis,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
}) => {
  const rowId = selectableId(p);

  const handleClick = () => {
    if (sortMode) return;
    if (selectMode && rowId) {
      toggleSelect(rowId);
      return;
    }
    setSelectedPeserta(p);
  };

  return (
    <div
      draggable={sortMode}
      onDragStart={sortMode ? (e) => handleDragStart(e, index) : undefined}
      onDragOver={sortMode ? (e) => handleDragOver(e, index) : undefined}
      onDragLeave={sortMode ? handleDragLeave : undefined}
      onDragEnd={sortMode ? handleDragEnd : undefined}
      onClick={handleClick}
      className={`group relative flex flex-col rounded-3xl border text-card-foreground shadow-sm transition-all duration-200 min-w-0 outline-none focus-within:ring-2 focus-within:ring-ring ${
        sortMode
          ? isDragging
            ? 'opacity-40 bg-primary/5 cursor-grabbing border-primary/40 scale-[0.98]'
            : 'cursor-grab bg-card hover:bg-muted/20 border-border/40 hover:border-primary/20 select-none'
          : isSelected && selectMode
          ? 'bg-primary/5 border-primary/50 ring-1 ring-primary/20'
          : 'bg-card hover:bg-muted/10 border-border/40 hover:border-primary/20 hover:-translate-y-0.5 hover:shadow-md'
      } ${isDragOver ? 'border-primary border-dashed bg-primary/5' : ''} ${
        density === 'compact' ? 'p-3' : 'p-5'
      }`}
    >
      {/* Top Header Row of Card */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* Left Side Controls (Check / Sort Handle / Index Number) */}
        <div className="flex items-center gap-2">
          {sortMode ? (
            <div className="text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0">
              <GripVertical className="w-5 h-5" />
            </div>
          ) : selectMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (rowId) toggleSelect(rowId);
              }}
              disabled={!rowId}
              className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected
                  ? 'bg-primary border-primary shadow-md shadow-primary/20'
                  : 'border-border/60 hover:border-primary/40'
              }`}
            >
              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
            </button>
          ) : (
            <span className="text-[10px] font-black text-muted-foreground/30 font-mono tabular-nums group-hover:text-primary/40 transition-colors">
              {(index + 1).toString().padStart(2, '0')}
            </span>
          )}
        </div>

        {/* Right Side Aksi (Hover state on Desktop, or always on Mobile for touch) */}
        {!sortMode && !selectMode && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPeserta(p);
              }}
              className="p-1.5 bg-card hover:bg-primary/5 text-muted-foreground hover:text-primary rounded-xl transition-all border border-border/40 hover:border-primary/20"
              title="Edit Data"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (p.id) onViewAnalysis(p.id);
              }}
              className="p-1.5 bg-card hover:bg-module-sidak/5 text-muted-foreground hover:text-module-sidak rounded-xl transition-all border border-border/40 hover:border-module-sidak/20"
              title="Lihat Analisis QA"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Avatar & Details Block */}
      <div className="flex items-center gap-3">
        {/* Avatar Area */}
        <div className="relative shrink-0">
          <div
            className={`rounded-2xl border border-border/40 overflow-hidden bg-muted/20 transition-colors group-hover:border-primary/40 cursor-pointer ${
              density === 'compact' ? 'w-12 h-12' : 'w-16 h-16'
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
                <span className="text-xl font-black text-muted-foreground/40">
                  {p.nama?.charAt(0)?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Text details */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1">
            <h3
              className={`font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight tracking-tight ${
                density === 'compact' ? 'text-sm' : 'text-base'
              }`}
            >
              {p.nama}
            </h3>
            {p.jabatan && (
              <div className="flex">
                <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                  {labelJabatan[p.jabatan] || p.jabatan}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Info Row */}
      <div className={`mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground ${
        density === 'compact' ? 'gap-1' : 'gap-2'
      }`}>
        <span className="font-medium truncate flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
          <span className="truncate">{p.tim || 'Tanpa Tim'}</span>
        </span>
        {p.nik_ojk && (
          <span className="font-mono tracking-tighter text-muted-foreground/60 shrink-0">
            #{p.nik_ojk}
          </span>
        )}
      </div>
    </div>
  );
};
