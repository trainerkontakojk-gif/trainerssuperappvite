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
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardFooter } from "../../../../components/ui/card";

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
  setSelectedPeserta: (p: ProfilerPeserta) => void;
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
  setSelectedPeserta,
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
    setSelectedPeserta(p);
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
      className={`min-w-0 cursor-pointer shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDragging
          ? "border-primary/50 bg-primary/5 opacity-50"
          : isDragOver
            ? "border-primary border-dashed bg-primary/5"
            : isSelected && selectMode
              ? "border-primary bg-primary/5"
              : "hover:border-primary/40"
      } ${sortMode ? "cursor-grab" : ""}`}
    >
      <CardContent className={density === "compact" ? "p-3" : "p-4"}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {sortMode ? (
              <GripVertical
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedPeserta(p);
                }}
                title="Edit Data"
                aria-label={`Edit ${p.nama}`}
              >
                <Pencil aria-hidden="true" />
              </Button>
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

        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            size={density === "compact" ? "default" : "lg"}
            className={density === "compact" ? undefined : "!size-16"}
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
            {p.jabatan ? (
              <Badge
                variant="secondary"
                className="mt-1 max-w-full truncate text-[0.65rem]"
              >
                {labelJabatan[p.jabatan] || p.jabatan}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{p.tim || "Tanpa tim"}</span>
        {p.nik_ojk ? (
          <span className="shrink-0 font-mono text-[0.68rem]">
            #{p.nik_ojk}
          </span>
        ) : null}
      </CardFooter>
    </Card>
  );
};
