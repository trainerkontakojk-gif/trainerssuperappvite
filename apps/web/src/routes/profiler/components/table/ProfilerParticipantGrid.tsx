import React from "react";
import { FilterX, Plus } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../../../components/ui/empty";
import { ProfilerParticipantCard } from "./ProfilerParticipantCard";

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === "string" && p.id.length > 0 ? p.id : null;

interface ProfilerParticipantGridProps {
  displayList: ProfilerPeserta[];
  sortMode: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  density: "comfortable" | "compact";
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

export const ProfilerParticipantGrid: React.FC<
  ProfilerParticipantGridProps
> = ({
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
      <Card className="shadow-none">
        <Empty className="border-0 py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilterX aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              {hasActiveFilters
                ? "Data sesuai filter belum ditemukan"
                : "Folder ini belum memiliki peserta"}
            </EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Sesuaikan pencarian atau filter tim untuk melanjutkan."
                : "Tambahkan peserta pertama untuk mulai menyusun profil batch."}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={resetFilters}
            >
              <FilterX data-icon="inline-start" aria-hidden="true" />
              Reset filter
            </Button>
          ) : !isReadOnly ? (
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={onAddPeserta}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Tambah peserta pertama
            </Button>
          ) : null}
        </Empty>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {displayList.map((p, index) => {
        const rowId = selectableId(p);
        return (
          <ProfilerParticipantCard
            key={rowId || p.id}
            p={p}
            index={index}
            sortMode={sortMode}
            selectMode={selectMode}
            isSelected={rowId ? selectedIds.has(rowId) : false}
            isDragging={sortMode && dragIndex === index}
            isDragOver={dragOverIndex === index}
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
