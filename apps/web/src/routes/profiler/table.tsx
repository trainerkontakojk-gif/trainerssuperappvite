import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpDown,
  Download,
  FolderInput,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { MoveFolderModal } from "./components/table/MoveFolderModal";
import { EditPesertaModal } from "./components/table/EditPesertaModal";
import { ProfilerTableFilters } from "./components/table/ProfilerTableFilters";
import { ProfilerParticipantGrid } from "./components/table/ProfilerParticipantGrid";
import { ProfilerPageHeader } from "./components/ProfilerPageHeader";
import { ProfilerRouteNav } from "./components/ProfilerRouteNav";
import { ProfilerFolderSelect } from "./components/ProfilerFolderSelect";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import QaStatePanel from "../../components/ui/QaStatePanel";
import type {
  ProfilerPeserta,
  ProfilerFolder,
  ProfilerYear,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { profilerApi } from "../../lib/profilerService";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import { type PhotoFrame } from "../../lib/photo-frame";

const selectableId = (p: ProfilerPeserta): string | null =>
  typeof p.id === "string" && p.id.length > 0 ? p.id : null;

export default function ProfilerTable() {
  const router = useRouter();
  const { batch } = useQueryParams();
  const batchName = batch || "";
  const { isReadOnly } = useProfilerAccess();

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);
  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialTimList, setInitialTimList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTim, setFilterTim] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeserta, setSelectedPeserta] =
    useState<ProfilerPeserta | null>(null);
  const [isNavigatingFolder, setIsNavigatingFolder] = useState(false);
  const [sortMode, setSortMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [, setPhotoFrameTick] = useState(0);

  useEffect(() => {
    if (!batchName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setIsNavigatingFolder(false);
    Promise.all([
      profilerApi.getPesertaByBatch(batchName),
      profilerApi.getFolders(),
      profilerApi.getYears(),
      profilerApi.getTeams(),
    ])
      .then(([p, f, y, t]) => {
        const folderNames = new Set(f.map((folder) => folder.name));
        if (f.length > 0 && !folderNames.has(batchName)) {
          const firstFolder = f[0];
          if (firstFolder?.name) {
            router.navigate({
              to: "/profiler/table",
              search: { batch: firstFolder.name },
              replace: true,
            });
          } else {
            router.navigate({ to: "/profiler" });
          }
          return;
        }
        setPeserta(p);
        setInitialFolders(f);
        setInitialYears(y);
        setInitialTimList(t.map((team) => team.nama));
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [batchName, router]);

  useEffect(() => {
    setSelectedIds((previous) => {
      if (previous.size === 0) return previous;
      const validIds = new Set(
        peserta.map(selectableId).filter((id): id is string => Boolean(id)),
      );
      const next = new Set(
        Array.from(previous).filter((id) => validIds.has(id)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [peserta]);

  const refreshPhotoFrame = useCallback((id: string, frame: PhotoFrame) => {
    setPeserta((previous) =>
      previous.map((p) => (p.id === id ? { ...p, photo_frame: frame } : p)),
    );
    setPhotoFrameTick((value) => value + 1);
  }, []);

  const handleSaved = (updated: ProfilerPeserta) =>
    setPeserta((previous) =>
      previous.map((p) => (p.id === updated.id ? updated : p)),
    );
  const handlePhotoUpdated = (id: string, fotoUrl: string) => {
    setPeserta((previous) =>
      previous.map((p) => (p.id === id ? { ...p, foto_url: fotoUrl } : p)),
    );
    setSelectedPeserta((previous) =>
      previous?.id === id ? { ...previous, foto_url: fotoUrl } : previous,
    );
  };
  const handleDeleted = (id: string) =>
    setPeserta((previous) => previous.filter((p) => p.id !== id));
  const handleMoved = (ids: string[]) => {
    setPeserta((previous) => previous.filter((p) => !ids.includes(p.id!)));
    setSelectedIds(new Set());
    setSelectMode(false);
    setFeedback({
      type: "success",
      message: `${ids.length} peserta berhasil dipindahkan.`,
    });
  };

  const handleDragStart = (event: React.DragEvent, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 0, 0);
    window.setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const handleDragLeave = () => setDragOverIndex(null);
  const handleDragEnd = () => {
    const from = dragIndex;
    const to = dragOverIndex;
    if (from !== null && to !== null && from !== to) {
      setPeserta((previous) => {
        const next = [...previous];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
      setOrderChanged(true);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await profilerApi.bulkReorderPeserta(
        peserta
          .filter((p): p is ProfilerPeserta & { id: string } => Boolean(p.id))
          .map((p, index) => ({ id: p.id, nomor_urut: index + 1 })),
      );
      setOrderChanged(false);
      setSortMode(false);
      setFeedback({
        type: "success",
        message: "Urutan peserta berhasil disimpan.",
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Gagal menyimpan urutan: ${err.message}`,
      });
    } finally {
      setSavingOrder(false);
    }
  };

  const cancelSort = () => {
    setSortMode(false);
    setOrderChanged(false);
    setDragOverIndex(null);
    profilerApi.getPesertaByBatch(batchName).then(setPeserta);
  };
  const query = searchQuery.trim().toLowerCase();
  const filtered = peserta.filter((p) => {
    const matchTim =
      filterTim === "all" ||
      (p.tim ?? "").toLowerCase() === filterTim.toLowerCase();
    const matchQuery =
      query.length === 0 ||
      [
        p.nama,
        p.tim,
        p.nik_ojk,
        p.email_ojk,
        p.jabatan ? labelJabatan[p.jabatan] : "",
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    return matchTim && matchQuery;
  });
  const allTims = useMemo(() => {
    const present = Array.from(
      new Set(peserta.map((p) => p.tim).filter(Boolean)),
    );
    return ["all", ...present.sort()];
  }, [peserta]);
  const displayList = sortMode ? peserta : filtered;
  const hasActiveFilters = filterTim !== "all" || query.length > 0;
  const resetFilters = () => {
    setFilterTim("all");
    setSearchQuery("");
  };
  const onSortClick = () => {
    setSortMode(true);
    setSelectMode(false);
    setSelectedIds(new Set());
    setOrderChanged(false);
    setPeserta(filtered);
  };
  const toggleSelectMode = () => {
    setSelectMode((value) => !value);
    setSelectedIds(new Set());
  };
  const toggleSelect = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!batchName) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-6 sm:px-6">
        <Card className="w-full shadow-none">
          <Empty className="border-0 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderInput aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Pilih batch terlebih dahulu</EmptyTitle>
              <EmptyDescription>
                Daftar peserta akan tampil setelah batch dipilih dari Profiler.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              onClick={() => router.navigate({ to: "/profiler" })}
            >
              Kembali ke Profiler
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Memuat data peserta...</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const headerActions = (
    <>
      <ProfilerFolderSelect
        years={initialYears}
        folders={initialFolders}
        value={batchName}
        label="Batch"
        className="w-full sm:w-56"
        onChange={(nextBatch) => {
          setIsNavigatingFolder(true);
          router.navigate({
            to: "/profiler/table",
            search: { batch: nextBatch },
          });
        }}
      />
      {!isReadOnly && !sortMode && !selectMode ? (
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          onClick={() =>
            router.navigate({
              to: "/profiler/add",
              search: { batch: batchName },
            })
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Tambah peserta
        </Button>
      ) : null}
    </>
  );

  return (
    <div
      className={`flex min-h-screen flex-col bg-background text-foreground ${selectMode && selectedIds.size > 0 ? "pb-24" : ""}`}
    >
      <ProfilerPageHeader
        backHref={`/profiler?batch=${encodeURIComponent(batchName)}`}
        backLabel="Kembali ke workspace KTP"
        eyebrow="Profiler table"
        title={`Kelola peserta di ${batchName}.`}
        description="Cari, filter, susun ulang, dan buka detail peserta dari satu ruang kerja yang ringkas."
        icon={<FolderInput className="size-3.5" aria-hidden="true" />}
        actions={headerActions}
      />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <ProfilerRouteNav active="table" batchName={batchName} />

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {peserta.length} peserta
              </Badge>
              <span className="truncate text-sm text-muted-foreground">
                {hasActiveFilters
                  ? `${displayList.length} sesuai filter`
                  : "Semua data batch"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!sortMode && !selectMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="size-11"
                    title={
                      density === "comfortable" ? "Mode ringkas" : "Mode nyaman"
                    }
                    aria-label={
                      density === "comfortable"
                        ? "Aktifkan mode ringkas"
                        : "Aktifkan mode nyaman"
                    }
                    onClick={() =>
                      setDensity((value) =>
                        value === "comfortable" ? "compact" : "comfortable",
                      )
                    }
                  >
                    <Activity aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="size-11"
                    title="Ekspor"
                    aria-label="Ekspor peserta"
                    onClick={() =>
                      router.navigate({
                        to: "/profiler/export",
                        search: { batch: batchName },
                      })
                    }
                  >
                    <Download aria-hidden="true" />
                  </Button>
                </>
              ) : null}
              {!isReadOnly ? (
                <>
                  <Button
                    type="button"
                    variant={selectMode ? "default" : "outline"}
                    size="lg"
                    className="min-h-11"
                    onClick={toggleSelectMode}
                  >
                    <FolderInput data-icon="inline-start" aria-hidden="true" />
                    {selectMode ? "Batalkan pilih" : "Pilih banyak"}
                  </Button>
                  <Separator
                    orientation="vertical"
                    className="hidden h-8 sm:block"
                  />
                  {sortMode ? (
                    <>
                      <Button
                        type="button"
                        size="lg"
                        className="min-h-11"
                        onClick={saveOrder}
                        disabled={savingOrder || !orderChanged}
                      >
                        {savingOrder ? (
                          <Loader2
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save aria-hidden="true" />
                        )}
                        Simpan urutan
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="size-11"
                        aria-label="Batalkan pengurutan"
                        onClick={cancelSort}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="min-h-11"
                      onClick={onSortClick}
                      disabled={hasActiveFilters}
                      title={
                        hasActiveFilters
                          ? "Reset filter terlebih dahulu"
                          : "Atur urutan peserta"
                      }
                    >
                      <ArrowUpDown
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                      Atur urutan
                    </Button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          <ProfilerTableFilters
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterTim={filterTim}
            setFilterTim={setFilterTim}
            allTims={allTims}
            sortMode={sortMode}
            hasActiveFilters={hasActiveFilters}
            resetFilters={resetFilters}
          />

          {feedback ? (
            <QaStatePanel
              type={feedback.type}
              title={
                feedback.type === "success"
                  ? "Perubahan berhasil disimpan"
                  : "Terjadi kendala saat menyimpan perubahan"
              }
              description={feedback.message}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFeedback(null)}
                >
                  Tutup
                </Button>
              }
            />
          ) : null}
          {isNavigatingFolder ? (
            <QaStatePanel
              type="loading"
              title="Memuat folder tujuan"
              description="Data folder sedang disiapkan."
            />
          ) : null}

          <ProfilerParticipantGrid
            displayList={displayList}
            sortMode={sortMode}
            selectMode={selectMode}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            density={density}
            isReadOnly={isReadOnly}
            hasActiveFilters={hasActiveFilters}
            resetFilters={resetFilters}
            setSelectedPeserta={setSelectedPeserta}
            onViewAnalysis={(id) =>
              router.navigate({ to: "/sidak/agents/$id", params: { id } })
            }
            onAddPeserta={() =>
              router.navigate({
                to: "/profiler/add",
                search: { batch: batchName },
              })
            }
            dragIndex={dragIndex}
            dragOverIndex={dragOverIndex}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDragEnd={handleDragEnd}
          />

          {sortMode && orderChanged ? (
            <Button
              type="button"
              size="lg"
              className="sticky bottom-4 z-10 min-h-12 w-full"
              onClick={saveOrder}
              disabled={savingOrder}
            >
              {savingOrder ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {savingOrder ? "Menyimpan urutan..." : "Simpan urutan baru"}
            </Button>
          ) : null}
        </div>
      </main>

      {selectMode && selectedIds.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <Card className="w-full max-w-xl border-foreground/20 bg-foreground text-background shadow-lg">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground tabular-nums">
                  {selectedIds.size}
                </Badge>
                <span className="text-sm font-medium">Peserta terpilih</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="border-background/30 bg-background text-foreground hover:bg-muted"
                  onClick={() => setShowMoveModal(true)}
                >
                  <FolderInput data-icon="inline-start" aria-hidden="true" />
                  Pindah folder
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11 text-background hover:bg-background/10 hover:text-background"
                  aria-label="Batalkan pilihan"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {selectedPeserta ? (
        <EditPesertaModal
          peserta={selectedPeserta}
          timList={initialTimList}
          onClose={() => setSelectedPeserta(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onFrameUpdated={refreshPhotoFrame}
          onPhotoUpdated={handlePhotoUpdated}
          isReadOnly={isReadOnly}
        />
      ) : null}
      {showMoveModal ? (
        <MoveFolderModal
          selectedIds={Array.from(selectedIds)}
          currentBatch={batchName}
          folders={initialFolders}
          years={initialYears}
          onClose={() => setShowMoveModal(false)}
          onMoved={handleMoved}
        />
      ) : null}
    </div>
  );
}
