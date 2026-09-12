import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserCheck, UserPlus, X } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

import { profilerApi } from "../../../lib/profilerService";
import { notify } from "../../../lib/toast";

interface AddMemberPickerProps {
  isOpen: boolean;
  onClose: () => void;
  targetBatch: string;
  onSuccess: (newPeserta: ProfilerPeserta[]) => void;
}

export default function AddMemberPicker({
  isOpen,
  onClose,
  targetBatch,
  onSuccess,
}: AddMemberPickerProps) {
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<ProfilerPeserta[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadPool = useCallback(async () => {
    setLoading(true);
    try {
      const data = await profilerApi.getGlobalPesertaPool(targetBatch);
      setPool(data || []);
    } catch (err) {
      console.error("Load pool error:", err);
    } finally {
      setLoading(false);
    }
  }, [targetBatch]);

  useEffect(() => {
    if (isOpen) {
      loadPool();
      setSelectedIds([]);
      setSuccess(false);
    }
  }, [isOpen, loadPool]);

  const filteredPool = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pool;

    return pool.filter(
      (participant) =>
        participant.nama.toLowerCase().includes(query) ||
        participant.batch_name.toLowerCase().includes(query) ||
        participant.tim.toLowerCase().includes(query),
    );
  }, [pool, search]);

  const groupedPool = useMemo(() => {
    const groups = new Map<string, ProfilerPeserta[]>();
    for (const participant of filteredPool) {
      const current = groups.get(participant.batch_name) ?? [];
      current.push(participant);
      groups.set(participant.batch_name, current);
    }
    return [...groups.entries()];
  }, [filteredPool]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      const newPeserta = await profilerApi.copyPesertaToFolder(
        selectedIds,
        targetBatch,
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess(newPeserta as ProfilerPeserta[]);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      notify.error(
        "Gagal menambahkan anggota: " +
          (err instanceof Error ? err.message : "Terjadi kesalahan."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="!w-[calc(100vw-2rem)] !max-w-2xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="relative shrink-0 border-b border-border p-5 pr-16 sm:p-6 sm:pr-16">
          <DialogTitle className="flex items-center gap-2 font-outfit text-lg font-bold">
            <UserPlus aria-hidden="true" />
            Tambah anggota
          </DialogTitle>
          <DialogDescription>
            Pilih peserta dari folder lain untuk ditambahkan ke batch{" "}
            {targetBatch}.
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onClose}
            aria-label="Tutup tambah anggota"
            title="Tutup"
            className="absolute top-3 right-3 min-h-11 min-w-11"
          >
            <X aria-hidden="true" />
          </Button>

          <div className="relative mt-4">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Cari nama, folder, atau tim..."
              aria-label="Cari peserta"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 pl-10"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          {loading ? (
            <div
              className="flex flex-col gap-3"
              role="status"
              aria-label="Memuat peserta"
            >
              {[0, 1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : groupedPool.length === 0 ? (
            <Empty className="min-h-56 border border-dashed border-border p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserPlus aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Tidak ada peserta ditemukan</EmptyTitle>
                <EmptyDescription>
                  Coba ubah kata kunci pencarian atau pilih batch lain.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {groupedPool.map(([batch, participants]) => (
                <section
                  key={batch}
                  className="flex flex-col gap-2"
                  aria-labelledby={`batch-${batch}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id={`batch-${batch}`}
                      className="min-w-0 truncate text-sm font-semibold text-foreground"
                    >
                      {batch}
                    </h3>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {participants.length} peserta
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {participants.map((participant) => {
                      const isSelected = selectedIds.includes(participant.id);
                      const initials = participant.nama
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase();

                      return (
                        <Button
                          key={participant.id}
                          type="button"
                          variant={isSelected ? "secondary" : "outline"}
                          size="lg"
                          aria-pressed={isSelected}
                          onClick={() => toggleSelect(participant.id)}
                          className={cn(
                            "h-auto min-h-16 w-full justify-start gap-3 p-3 text-left whitespace-normal",
                            isSelected &&
                              "border-primary/40 ring-2 ring-primary/20",
                          )}
                        >
                          <Avatar size="lg" className="size-10">
                            <AvatarFallback className="text-sm font-semibold">
                              {initials || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {participant.nama}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {participant.tim} ·{" "}
                              {participant.jabatan.replace(/_/g, " ")}
                            </span>
                          </span>
                          {isSelected && (
                            <Badge variant="default" className="shrink-0">
                              <UserCheck
                                data-icon="inline-start"
                                aria-hidden="true"
                              />
                              Dipilih
                            </Badge>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {selectedIds.length}
            </span>{" "}
            peserta dipilih
          </p>
          <div className="flex gap-2">
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
              onClick={handleAdd}
              disabled={selectedIds.length === 0 || saving || success}
              className="min-h-11"
            >
              {saving ? (
                <Loader2
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="motion-reduce:animate-none"
                />
              ) : success ? (
                <UserCheck data-icon="inline-start" aria-hidden="true" />
              ) : (
                <UserPlus data-icon="inline-start" aria-hidden="true" />
              )}
              {success
                ? "Berhasil!"
                : `Tambahkan ${selectedIds.length} anggota`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
