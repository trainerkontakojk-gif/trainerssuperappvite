import React from "react";
import { Activity, Check, GripVertical, Pencil } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame, getPhotoImageStyle } from "../../../../lib/photo-frame";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../../components/ui/avatar";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardFooter } from "../../../../components/ui/card";
import { ReorderButtons } from "./ProfilerParticipantTable";

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === "string" && p.id.length > 0 ? p.id : null;

interface ProfilerParticipantCardProps {
  p: ProfilerPeserta;
  index: number;
  sortMode: boolean;
  selectMode: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  density: "comfortable" | "compact";
  toggleSelect: (id: string) => void;
  isReadOnly: boolean;
  lastIndex: number;
  onOpenProfile: (p: ProfilerPeserta) => void;
  onEdit: (p: ProfilerPeserta) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onViewAnalysis: (id: string) => void;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: () => void;
  handleDragEnd: () => void;
}

export const ProfilerParticipantCard: React.FC<
  ProfilerParticipantCardProps
> = ({
  p,
  index,
  sortMode,
  selectMode,
  isSelected,
  isDragging,
  isDragOver,
  density,
  toggleSelect,
  isReadOnly,
  lastIndex,
  onOpenProfile,
  onEdit,
  onMove,
  onViewAnalysis,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
}) => {
  const rowId = selectableId(p);
  const openDetails = () => {
    if (sortMode) return;
    if (selectMode && rowId) {
      toggleSelect(rowId);
      return;
    }
    onOpenProfile(p);
  };

  return (
    <Card
      draggable={sortMode}
      onDragStart={
        sortMode ? (event) => handleDragStart(event, index) : undefined
      }
      onDragOver={
        sortMode ? (event) => handleDragOver(event, index) : undefined
      }
      onDragLeave={sortMode ? handleDragLeave : undefined}
      onDragEnd={sortMode ? handleDragEnd : undefined}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          openDetails();
        }
      }}
      tabIndex={sortMode ? -1 : 0}
      role="button"
      aria-label={`Buka profil ${p.nama || "peserta"}`}
      className={`h-full min-w-0 cursor-pointer shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDragging
          ? "border-primary/50 bg-primary/5 opacity-50"
          : isDragOver
            ? "border-primary border-dashed bg-primary/5"
            : isSelected && selectMode
              ? "border-primary bg-primary/5"
              : "hover:border-primary/40"
      } ${sortMode ? "cursor-grab" : ""}`}
    >
      <CardContent
        className={`flex flex-1 flex-col ${
          density === "compact" ? "p-3" : "p-4"
        }`}
      >
        {/* Di HP kartu menjadi satu baris per orang; nomor dan aksi pindah ke baris itu. */}
        <div
          className={`mb-3 items-start justify-between gap-2 ${
            sortMode || selectMode ? "flex" : "hidden sm:flex"
          }`}
        >
          <div className="flex items-center gap-2">
            {sortMode ? (
              <>
                <GripVertical
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <ReorderButtons
                  nama={p.nama}
                  index={index}
                  last={lastIndex}
                  onMove={onMove}
                />
              </>
            ) : selectMode ? (
              <Button
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="icon-sm"
                className="size-7"
                disabled={!rowId}
                onClick={(event) => {
                  event.stopPropagation();
                  if (rowId) toggleSelect(rowId);
                }}
                aria-label={
                  isSelected
                    ? `Hapus ${p.nama} dari pilihan`
                    : `Pilih ${p.nama}`
                }
              >
                {isSelected ? <Check aria-hidden="true" /> : null}
              </Button>
            ) : (
              <span className="text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
          </div>
          {!sortMode && !selectMode ? (
            <div className="flex items-center gap-1">
              {!isReadOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(p);
                  }}
                  title="Edit Data"
                  aria-label={`Edit ${p.nama}`}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  if (p.id) onViewAnalysis(p.id);
                }}
                title="Lihat Analisis QA"
                aria-label={`Lihat analisis ${p.nama}`}
              >
                <Activity aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {!sortMode && !selectMode ? (
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground sm:hidden">
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : null}
          <Avatar
            size={density === "compact" ? "default" : "lg"}
            className={
              density === "compact"
                ? "overflow-hidden"
                : "!size-16 overflow-hidden"
            }
          >
            {p.foto_url ? (
              <AvatarImage
                src={p.foto_url}
                alt={p.nama || ""}
                style={getPhotoImageStyle(getPhotoFrame(p.id, p.photo_frame))}
                referrerPolicy="no-referrer"
              />
            ) : null}
            <AvatarFallback>
              {p.nama?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3
              className={`break-words font-semibold leading-tight tracking-tight ${density === "compact" ? "text-sm" : "text-base"}`}
            >
              {p.nama || "Tanpa nama"}
            </h3>
            {p.jabatan || p.tim ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {p.jabatan ? labelJabatan[p.jabatan] || p.jabatan : null}
                {p.tim ? (
                  <span className="sm:hidden">
                    {p.jabatan ? " · " : ""}
                    {p.tim}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
      <CardFooter className="hidden justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex">
        <span className="min-w-0 truncate">{p.tim || "Tanpa tim"}</span>
        {p.nik_ojk ? (
          <span className="shrink-0 font-mono text-xs">
            #{p.nik_ojk}
          </span>
        ) : null}
      </CardFooter>
    </Card>
  );
};
