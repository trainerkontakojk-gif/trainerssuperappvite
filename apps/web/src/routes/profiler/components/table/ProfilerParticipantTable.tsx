import type React from "react";
import { Activity, ArrowDown, ArrowUp, Check, Pencil } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame, getPhotoImageStyle } from "../../../../lib/photo-frame";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../../components/ui/avatar";
import { Button } from "../../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import {
  formatShortDate,
  hitungMasaDinas,
  hitungUsia,
} from "../../utils/profilerFormatters";

interface ProfilerParticipantTableProps {
  displayList: ProfilerPeserta[];
  sortMode: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  isReadOnly: boolean;
  toggleSelect: (id: string) => void;
  onOpenProfile: (p: ProfilerPeserta) => void;
  onEdit: (p: ProfilerPeserta) => void;
  onViewAnalysis: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

/** Mode Tabel tab Peserta: satu baris per peserta, kolom sejajar. */
export function ProfilerParticipantTable({
  displayList,
  sortMode,
  selectMode,
  selectedIds,
  isReadOnly,
  toggleSelect,
  onOpenProfile,
  onEdit,
  onViewAnalysis,
  onMove,
}: ProfilerParticipantTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table aria-label="Daftar peserta">
        <TableHeader>
          <TableRow className="text-xs">
            {selectMode || sortMode ? (
              <TableHead className="w-12">
                <span className="sr-only">{sortMode ? "Urutan" : "Pilih"}</span>
              </TableHead>
            ) : null}
            <TableHead className="w-12">No</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Jabatan</TableHead>
            <TableHead>Tim</TableHead>
            <TableHead>NIK OJK</TableHead>
            <TableHead>Tanggal lahir</TableHead>
            <TableHead>Bergabung di 157</TableHead>
            <TableHead className="w-24 text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayList.map((p, index) => {
            const id = p.id ?? "";
            const isSelected = selectedIds.has(id);
            return (
              <TableRow
                key={id || index}
                data-state={isSelected ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => {
                  if (sortMode) return;
                  if (selectMode) {
                    if (id) toggleSelect(id);
                    return;
                  }
                  onOpenProfile(p);
                }}
              >
                {sortMode ? (
                  <TableCell>
                    <ReorderButtons
                      nama={p.nama}
                      index={index}
                      last={displayList.length - 1}
                      onMove={onMove}
                    />
                  </TableCell>
                ) : selectMode ? (
                  <TableCell>
                    <Button
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="icon-sm"
                      className="size-7"
                      disabled={!id}
                      aria-label={
                        isSelected
                          ? `Hapus ${p.nama} dari pilihan`
                          : `Pilih ${p.nama}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (id) toggleSelect(id);
                      }}
                    >
                      {isSelected ? <Check aria-hidden="true" /> : null}
                    </Button>
                  </TableCell>
                ) : null}
                <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar size="sm" className="overflow-hidden">
                      {p.foto_url ? (
                        <AvatarImage
                          src={p.foto_url}
                          alt=""
                          style={getPhotoImageStyle(
                            getPhotoFrame(p.id, p.photo_frame),
                          )}
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <AvatarFallback>
                        {p.nama?.charAt(0)?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium text-foreground">
                      {p.nama || "Tanpa nama"}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {p.jabatan ? labelJabatan[p.jabatan] || p.jabatan : "-"}
                </TableCell>
                <TableCell>{p.tim || "-"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {p.nik_ojk || (
                    <span className="text-muted-foreground">belum diisi</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  <DateWithSuffix
                    date={p.tgl_lahir}
                    suffix={
                      p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} th` : null
                    }
                  />
                </TableCell>
                <TableCell className="tabular-nums">
                  <DateWithSuffix
                    date={p.bergabung_date}
                    suffix={
                      p.bergabung_date
                        ? hitungMasaDinas(p.bergabung_date)
                        : null
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  {!sortMode && !selectMode ? (
                    <span className="inline-flex gap-1">
                      {!isReadOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-8"
                          aria-label={`Edit ${p.nama}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(p);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-8"
                        aria-label={`Lihat analisis ${p.nama}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (id) onViewAnalysis(id);
                        }}
                      >
                        <Activity aria-hidden="true" />
                      </Button>
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DateWithSuffix({
  date,
  suffix,
}: {
  date?: string | null;
  suffix: string | null;
}) {
  if (!date) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="whitespace-nowrap">
      {formatShortDate(date)}
      {suffix ? (
        <span className="text-muted-foreground"> · {suffix}</span>
      ) : null}
    </span>
  );
}

/** Tombol naik/turun untuk Atur urutan; bisa dipakai dengan keyboard. */
export function ReorderButtons({
  nama,
  index,
  last,
  onMove,
}: {
  nama?: string | null;
  index: number;
  last: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const stop = (event: React.MouseEvent, direction: -1 | 1) => {
    event.stopPropagation();
    onMove(index, direction);
  };
  return (
    <span className="inline-flex gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8"
        disabled={index === 0}
        aria-label={`Pindahkan ${nama || "peserta"} ke atas`}
        onClick={(event) => stop(event, -1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8"
        disabled={index === last}
        aria-label={`Pindahkan ${nama || "peserta"} ke bawah`}
        onClick={(event) => stop(event, 1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
    </span>
  );
}
