import { useMemo, useState } from "react";
import type React from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerYear,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import {
  ArrowUpDown,
  Check,
  FolderInput,
  LayoutGrid,
  List,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

import { profilerApi } from "../../../../lib/profilerService";
import { notify } from "../../../../lib/toast";
import { MoveFolderModal } from "../table/MoveFolderModal";
import { ProfilerParticipantGrid } from "../table/ProfilerParticipantGrid";
import { ProfilerParticipantTable } from "../table/ProfilerParticipantTable";

export type ProfilerPesertaLayout = "kartu" | "tabel";

interface ProfilerPesertaPanelProps {
  batchName: string;
  peserta: ProfilerPeserta[];
  layout: ProfilerPesertaLayout;
  isReadOnly: boolean;
  folders: ProfilerFolder[];
  years: ProfilerYear[];
  onLayoutChange: (layout: ProfilerPesertaLayout) => void;
  onOpenProfile: (id: string, options?: { edit?: boolean }) => void;
  onAddPeserta: () => void;
  onPesertaChange: (next: ProfilerPeserta[]) => void;
  onMoved: (ids: string[], targetFolder: string) => void;
}

const matchesQuery = (p: ProfilerPeserta, query: string) =>
  [
    p.nama,
    p.nik_ojk,
    p.email_ojk,
    p.tim,
    p.jabatan ? labelJabatan[p.jabatan] : "",
  ].some((value) => (value ?? "").toLowerCase().includes(query));

/**
 * Tab Peserta: satu daftar dengan mode Kartu/Tabel, pencarian, filter tim,
 * Pilih banyak + Pindah folder, dan Atur urutan.
 */
export default function ProfilerPesertaPanel({
  batchName,
  peserta,
  layout,
  isReadOnly,
  folders,
  years,
  onLayoutChange,
  onOpenProfile,
  onAddPeserta,
  onPesertaChange,
  onMoved,
}: ProfilerPesertaPanelProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filterTim, setFilterTim] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMove, setShowMove] = useState(false);
  // Selama Atur urutan, daftar yang disusun disimpan terpisah sampai disimpan.
  const [sortDraft, setSortDraft] = useState<ProfilerPeserta[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sortMode = sortDraft !== null;
  const needle = query.trim().toLowerCase();
  const hasActiveFilters = needle.length > 0 || filterTim !== null;

  const teams = useMemo(
    () =>
      Array.from(
        new Set(
          peserta.map((p) => p.tim).filter((tim): tim is string => !!tim),
        ),
      ).sort(),
    [peserta],
  );
  const filtered = useMemo(
    () =>
      peserta.filter(
        (p) =>
          (filterTim === null || p.tim === filterTim) &&
          (needle.length === 0 || matchesQuery(p, needle)),
      ),
    [peserta, filterTim, needle],
  );
  const displayList = sortDraft ?? filtered;

  const resetFilters = () => {
    setQuery("");
    setFilterTim(null);
  };
  const toggleSelect = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const moveInDraft = (from: number, to: number) =>
    setSortDraft((previous) => {
      if (!previous || to < 0 || to >= previous.length || from === to)
        return previous;
      const next = [...previous];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const saveOrder = async () => {
    if (!sortDraft) return;
    setSavingOrder(true);
    try {
      const ordered = sortDraft.map((p, index) => ({
        ...p,
        nomor_urut: index + 1,
      }));
      await profilerApi.bulkReorderPeserta(
        ordered
          .filter((p): p is ProfilerPeserta & { id: string } => Boolean(p.id))
          .map((p) => ({ id: p.id, nomor_urut: p.nomor_urut })),
      );
      onPesertaChange(ordered);
      setSortDraft(null);
      notify.success("Urutan peserta disimpan");
    } catch (error: any) {
      notify.error("Gagal menyimpan urutan", error.message);
    } finally {
      setSavingOrder(false);
    }
  };

  const viewAnalysis = (id: string) =>
    navigate({ to: "/sidak/agents/$id", params: { id } });
  const openProfile = (p: ProfilerPeserta) => p.id && onOpenProfile(p.id);
  const editPeserta = (p: ProfilerPeserta) =>
    p.id && onOpenProfile(p.id, { edit: true });

  return (
    <div className="flex flex-col gap-4">
      {sortMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Seret kartu atau pakai tombol panah untuk menyusun urutan.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={() => setSortDraft(null)}
              disabled={savingOrder}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={saveOrder}
              disabled={savingOrder}
            >
              {savingOrder ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Simpan urutan
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, NIK, atau email"
              aria-label="Cari peserta"
              className="h-11 pl-9"
            />
          </div>
          {teams.length > 1 ? (
            <div
              role="group"
              aria-label="Filter tim"
              className="flex flex-wrap gap-2"
            >
              <FilterChip
                active={filterTim === null}
                onClick={() => setFilterTim(null)}
              >
                Semua tim
              </FilterChip>
              {teams.map((tim) => (
                <FilterChip
                  key={tim}
                  active={filterTim === tim}
                  onClick={() => setFilterTim(tim)}
                >
                  {tim}
                </FilterChip>
              ))}
            </div>
          ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Tampilan daftar"
              className="inline-flex rounded-lg border border-border bg-card p-1"
            >
              <LayoutOption
                active={layout === "kartu"}
                onClick={() => onLayoutChange("kartu")}
                icon={<LayoutGrid aria-hidden="true" />}
              >
                Kartu
              </LayoutOption>
              <LayoutOption
                active={layout === "tabel"}
                onClick={() => onLayoutChange("tabel")}
                icon={<List aria-hidden="true" />}
              >
                Tabel
              </LayoutOption>
            </div>
            {!isReadOnly && peserta.length > 0 ? (
              <>
                <Button
                  type="button"
                  variant={selectMode ? "default" : "outline"}
                  size="lg"
                  className="min-h-11"
                  onClick={() =>
                    selectMode ? exitSelectMode() : setSelectMode(true)
                  }
                >
                  <Check data-icon="inline-start" aria-hidden="true" />
                  {selectMode ? "Batalkan pilih" : "Pilih banyak"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  onClick={() => {
                    exitSelectMode();
                    resetFilters();
                    setSortDraft(peserta);
                  }}
                >
                  <ArrowUpDown data-icon="inline-start" aria-hidden="true" />
                  Atur urutan
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {layout === "tabel" && displayList.length > 0 ? (
        <ProfilerParticipantTable
          displayList={displayList}
          sortMode={sortMode}
          selectMode={selectMode}
          selectedIds={selectedIds}
          isReadOnly={isReadOnly}
          toggleSelect={toggleSelect}
          onOpenProfile={openProfile}
          onEdit={editPeserta}
          onViewAnalysis={viewAnalysis}
          onMove={(index, direction) => moveInDraft(index, index + direction)}
        />
      ) : (
        <ProfilerParticipantGrid
          displayList={displayList}
          sortMode={sortMode}
          selectMode={selectMode}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          density="compact"
          isReadOnly={isReadOnly}
          hasActiveFilters={hasActiveFilters}
          resetFilters={resetFilters}
          onOpenProfile={openProfile}
          onEdit={editPeserta}
          onMove={(index, direction) => moveInDraft(index, index + direction)}
          onViewAnalysis={viewAnalysis}
          onAddPeserta={onAddPeserta}
          dragIndex={dragIndex}
          dragOverIndex={dragOverIndex}
          handleDragStart={(event: React.DragEvent, index: number) => {
            setDragIndex(index);
            event.dataTransfer.effectAllowed = "move";
          }}
          handleDragOver={(event: React.DragEvent, index: number) => {
            event.preventDefault();
            setDragOverIndex(index);
          }}
          handleDragLeave={() => setDragOverIndex(null)}
          handleDragEnd={() => {
            if (dragIndex !== null && dragOverIndex !== null)
              moveInDraft(dragIndex, dragOverIndex);
            setDragIndex(null);
            setDragOverIndex(null);
          }}
        />
      )}

      {selectMode && selectedIds.size > 0 ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm font-medium tabular-nums">
            {selectedIds.size} peserta dipilih
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={() => setShowMove(true)}
            >
              <FolderInput data-icon="inline-start" aria-hidden="true" />
              Pindah folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label="Batalkan pilihan"
              onClick={() => setSelectedIds(new Set())}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {showMove ? (
        <MoveFolderModal
          selectedIds={Array.from(selectedIds)}
          currentBatch={batchName}
          folders={folders}
          years={years}
          onClose={() => setShowMove(false)}
          onMoved={(ids, target) => {
            exitSelectMode();
            onMoved(ids, target);
            notify.success(`${ids.length} peserta dipindahkan ke ${target}`);
          }}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={active}
      className="min-h-9 rounded-full px-3"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function LayoutOption({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
