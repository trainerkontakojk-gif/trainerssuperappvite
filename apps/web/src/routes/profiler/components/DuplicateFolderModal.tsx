import { useState } from "react";
import { CheckCircle2, Copy, Loader2, X } from "lucide-react";
import type {
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerYear,
} from "@trainers/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "cn";

import { profilerApi } from "../../../lib/profilerService";
import { notify } from "../../../lib/toast";

interface DuplicateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: ProfilerFolder | null;
  years: ProfilerYear[];
  onSuccess: (newFolder: ProfilerFolder, newPeserta: ProfilerPeserta[]) => void;
}

export default function DuplicateFolderModal({
  isOpen,
  onClose,
  folder,
  years,
  onSuccess,
}: DuplicateFolderModalProps) {
  const [targetYearId, setTargetYearId] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!folder) return null;

  const handleDuplicate = async () => {
    if (!targetYearId || !folder) return;
    setLoading(true);
    try {
      const result = await profilerApi.duplicateFolder(folder.id, targetYearId);
      setSuccess(true);
      setTimeout(() => {
        onSuccess(result.folder, result.participants);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      notify.error(
        "Gagal menduplikat folder: " +
          (err instanceof Error ? err.message : "Terjadi kesalahan."),
      );
    } finally {
      setLoading(false);
    }
  };

  const otherYears = years.filter((year) => year.id !== folder.year_id);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="relative border-b border-border p-5 pr-16 sm:p-6 sm:pr-16">
          <DialogTitle className="flex items-center gap-2 font-outfit text-lg font-bold">
            <Copy aria-hidden="true" />
            Duplikat folder
          </DialogTitle>
          <DialogDescription>
            Salin struktur dan peserta folder ke tahun lain.
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onClose}
            aria-label="Tutup duplikat folder"
            title="Tutup"
            className="absolute top-3 right-3 min-h-11 min-w-11"
          >
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-4">
            <Badge variant="outline" className="w-fit">
              Folder asal
            </Badge>
            <p className="break-words text-sm font-semibold text-foreground">
              {folder.name}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Tahun tujuan
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pilih arsip tempat folder baru akan dibuat.
              </p>
            </div>

            {otherYears.length === 0 ? (
              <Empty className="min-h-32 border border-dashed border-border p-5">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Copy aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Belum ada tahun tujuan</EmptyTitle>
                  <EmptyDescription>
                    Tambahkan tahun baru terlebih dahulu.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label="Tahun tujuan"
              >
                {otherYears.map((year) => {
                  const isSelected = targetYearId === year.id;
                  return (
                    <Button
                      key={year.id}
                      type="button"
                      variant={isSelected ? "secondary" : "outline"}
                      size="lg"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setTargetYearId(year.id)}
                      className={cn(
                        "min-h-11 w-full justify-between px-3 text-left",
                        isSelected &&
                          "border-primary/40 ring-2 ring-primary/20",
                      )}
                    >
                      <span>{year.label}</span>
                      {isSelected && <CheckCircle2 aria-hidden="true" />}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 p-5 sm:p-6">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="min-h-11"
          >
            Batal
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handleDuplicate}
            disabled={!targetYearId || loading || success}
            className="min-h-11"
          >
            {loading ? (
              <Loader2
                data-icon="inline-start"
                aria-hidden="true"
                className="motion-reduce:animate-none"
              />
            ) : success ? (
              <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Copy data-icon="inline-start" aria-hidden="true" />
            )}
            {success ? "Berhasil!" : "Duplikat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
