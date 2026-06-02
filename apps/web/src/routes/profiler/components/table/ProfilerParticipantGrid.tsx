import React from 'react';
import { FilterX, Plus } from 'lucide-react';
import type { ProfilerPeserta } from '@trainers/types';
import QaStatePanel from '../../../../components/ui/QaStatePanel';
import { ProfilerParticipantCard } from './ProfilerParticipantCard';

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === 'string' && p.id.length > 0 ? p.id : null;

interface ProfilerParticipantGridProps {
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
  dragOverIndex: number | null;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: () => void;
  handleDragEnd: () => void;
}

export const ProfilerParticipantGrid: React.FC<ProfilerParticipantGridProps> = ({
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
  dragOverIndex,
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-full">
      {displayList.map((p, i) => {
        const rowId = selectableId(p);
        const isSelected = rowId ? selectedIds.has(rowId) : false;
        const isDragging = sortMode && dragIndex === i;

        return (
          <ProfilerParticipantCard
            key={rowId || p.id}
            p={p}
            index={i}
            sortMode={sortMode}
            selectMode={selectMode}
            isSelected={isSelected}
            isDragging={isDragging}
            isDragOver={dragOverIndex === i}
            density={density}
            toggleSelect={toggleSelect}
            setSelectedPeserta={setSelectedPeserta}
            onViewAnalysis={onViewAnalysis}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDragEnd={handleDragEnd}
          />
        );
      })}
    </div>
  );
};
