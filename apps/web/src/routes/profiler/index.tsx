import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
} from "@trainers/types";

import ProfilerLibraryNav from "./components/workspace/ProfilerLibraryNav";
import ProfilerYearOverview from "./components/workspace/ProfilerYearOverview";
import ProfilerBatchWorkspace from "./components/workspace/ProfilerBatchWorkspace";
import {
  parseProfilerBatchView,
  type ProfilerBatchView,
} from "./components/workspace/batch-views";
import { cleanYearLabel } from "./components/workspace/workspace-utils";
import DuplicateFolderModal from "./components/DuplicateFolderModal";
import AddMemberPicker from "./components/AddMemberPicker";
import { Cake, Loader2, PanelLeft, Trash2 } from "lucide-react";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import { useQueryParams } from "../../hooks/useQueryParams";
import LeaderAccessGate from "../../components/LeaderAccessGate";
import { formatDate, getUpcomingBirthdays } from "./utils/birthday";
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
import { Label } from "@/components/ui/label";

export default function ProfilerLanding() {
  const { isReadOnly } = useProfilerAccess();
  const navigate = useNavigate();
  // Batch aktif hidup di URL (`?batch=`) supaya tahan refresh, back, dan bisa dibagikan.
  const queryParams = useQueryParams();
  const selectedBatch = queryParams.batch ?? "";
  const activeView = parseProfilerBatchView(queryParams.view);

  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [pesertaMap, setPesertaMap] = useState<
    Record<string, ProfilerPeserta[]>
  >({});
  const [pesertaError, setPesertaError] = useState<string | null>(null);
  const [pesertaReloadKey, setPesertaReloadKey] = useState(0);

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Modals
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearValue, setNewYearValue] = useState(new Date().getFullYear());
  const [showAddFolder, setShowAddFolder] = useState<{
    yearId: string;
    parentId?: string;
  } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<ProfilerFolder | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteFolder, setConfirmDeleteFolder] =
    useState<ProfilerFolder | null>(null);
  const [duplicateFolder, setDuplicateFolder] = useState<ProfilerFolder | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);

  const selectBatch = useCallback(
    (
      name: string,
      options: { replace?: boolean; view?: ProfilerBatchView | null } = {},
    ) => {
      setIsNavOpen(false);
      navigate({
        to: "/profiler",
        search: !name
          ? {}
          : options.view
            ? { batch: name, view: options.view }
            : { batch: name },
        replace: options.replace,
      });
    },
    [navigate],
  );

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getFolderCounts(),
    ])
      .then(([y, f, c]) => {
        setYears(y);
        setFolders(f);
        setCounts(c);
        if (y.length > 0) {
          const currentYear = new Date().getFullYear();
          const sameYear = y.find((yy) => yy.year === currentYear);
          setSelectedYearId(
            sameYear?.id ??
              [...y].sort((a, b) => b.year - a.year)[0]?.id ??
              null,
          );
        }
      })
      .catch((err) => console.error("Failed to load profiler data:", err))
      .finally(() => setLoaded(true));
  }, []);

  const activeFolder = useMemo(
    () =>
      selectedBatch
        ? (folders.find((f) => f.name === selectedBatch) ?? null)
        : null,
    [folders, selectedBatch],
  );

  // Batch dari URL yang tidak dikenal kembali ke ringkasan; yang dikenal
  // menyelaraskan pemilih tahun dengan tahun batch tersebut.
  useEffect(() => {
    if (!loaded || !selectedBatch) return;
    if (!activeFolder) {
      selectBatch("", { replace: true });
      return;
    }
    if (activeFolder.year_id) setSelectedYearId(activeFolder.year_id);
  }, [loaded, selectedBatch, activeFolder, selectBatch]);

  useEffect(() => {
    if (!activeFolder || pesertaMap[activeFolder.name]) return;
    const batchName = activeFolder.name;
    let cancelled = false;
    setPesertaError(null);
    profilerApi
      .getPesertaByBatch(batchName)
      .then((data) => {
        if (!cancelled)
          setPesertaMap((prev) => ({ ...prev, [batchName]: data }));
      })
      .catch((err) => {
        console.error("Failed to fetch peserta:", err);
        if (!cancelled)
          setPesertaError("Gagal memuat peserta batch ini. Coba lagi.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder, pesertaMap, pesertaReloadKey]);

  const handleAddYear = async () => {
    try {
      const newYear = await profilerApi.createYear(newYearValue);
      setYears((prev) => [newYear, ...prev]);
      setSelectedYearId(newYear.id);
      setShowAddYear(false);
      selectBatch("");
    } catch (err: any) {
      alert("Gagal tambah tahun: " + err.message);
    }
  };

  const handleAddFolder = async () => {
    if (!showAddFolder || !newFolderName.trim()) return;
    try {
      const folder = await profilerApi.createFolder({
        name: newFolderName.trim(),
        year_id: showAddFolder.yearId,
        parent_id: showAddFolder.parentId,
      });
      setFolders((prev) => [...prev, folder]);
      setCounts((prev) => ({ ...prev, [folder.name]: 0 }));
      setPesertaMap((prev) => ({ ...prev, [folder.name]: [] }));
      setNewFolderName("");
      setShowAddFolder(null);
      selectBatch(folder.name);
    } catch (err: any) {
      alert("Gagal tambah folder: " + err.message);
    }
  };

  const handleRenameFolder = async () => {
    if (
      !renamingFolder ||
      !renameValue.trim() ||
      renameValue.trim() === renamingFolder.name
    ) {
      setRenamingFolder(null);
      return;
    }
    const newName = renameValue.trim();
    const oldName = renamingFolder.name;
    try {
      await profilerApi.renameFolder(renamingFolder.id, newName);
      setFolders((prev) =>
        prev.map((f) =>
          f.id === renamingFolder.id ? { ...f, name: newName } : f,
        ),
      );
      setCounts((prev) => {
        const next = { ...prev };
        next[newName] = next[oldName] || 0;
        delete next[oldName];
        return next;
      });
      setPesertaMap((prev) => {
        const next = { ...prev };
        next[newName] = next[oldName] || [];
        delete next[oldName];
        return next;
      });
      if (selectedBatch === oldName)
        selectBatch(newName, { replace: true, view: activeView });
      setRenamingFolder(null);
    } catch (err: any) {
      alert("Gagal rename: " + err.message);
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) return;
    setDeleting(true);
    try {
      await profilerApi.deleteFolder(confirmDeleteFolder.id);
      const removedIds = new Set([
        confirmDeleteFolder.id,
        ...folders
          .filter((f) => f.parent_id === confirmDeleteFolder.id)
          .map((f) => f.id),
      ]);
      const removedNames = folders
        .filter((f) => removedIds.has(f.id))
        .map((f) => f.name);
      setFolders((prev) => prev.filter((f) => !removedIds.has(f.id)));
      setCounts((prev) => {
        const next = { ...prev };
        for (const name of removedNames) delete next[name];
        return next;
      });
      setPesertaMap((prev) => {
        const next = { ...prev };
        for (const name of removedNames) delete next[name];
        return next;
      });
      if (removedNames.includes(selectedBatch))
        selectBatch("", { replace: true });
    } catch (err: any) {
      alert("Gagal hapus: " + err.message);
    } finally {
      setDeleting(false);
      setConfirmDeleteFolder(null);
    }
  };

  const batchPeserta = activeFolder ? pesertaMap[activeFolder.name] : undefined;
  const upcomingBirthdays = useMemo(
    () => getUpcomingBirthdays(batchPeserta ?? []),
    [batchPeserta],
  );
  const activeTeamName = useMemo(() => {
    if (!activeFolder?.parent_id) return null;
    return folders.find((f) => f.id === activeFolder.parent_id)?.name ?? null;
  }, [folders, activeFolder]);
  const activeYearLabel = useMemo(() => {
    const label = years.find((y) => y.id === selectedYearId)?.label;
    return label ? cleanYearLabel(label) : null;
  }, [years, selectedYearId]);

  const libraryNavProps = {
    years,
    folders,
    counts,
    selectedYearId,
    activeBatch: selectedBatch,
    isReadOnly,
    onSelectYear: (id: string) => {
      setSelectedYearId(id);
      if (activeFolder && activeFolder.year_id !== id) selectBatch("");
    },
    // Tab aktif ikut terbawa saat berpindah batch (mis. membandingkan statistik).
    onSelectBatch: (name: string) => selectBatch(name, { view: activeView }),
    onAddYear: () => setShowAddYear(true),
    onAddFolder: (yearId: string, parentId?: string) => {
      setIsNavOpen(false);
      setShowAddFolder({ yearId, parentId });
    },
    onRenameFolder: (folder: ProfilerFolder) => {
      setIsNavOpen(false);
      setRenamingFolder(folder);
      setRenameValue(folder.name);
    },
    onDeleteFolder: (folder: ProfilerFolder) => {
      setIsNavOpen(false);
      setConfirmDeleteFolder(folder);
    },
    onDuplicateFolder: (folder: ProfilerFolder) => {
      setIsNavOpen(false);
      setDuplicateFolder(folder);
    },
  };

  return (
    <LeaderAccessGate module="ktp" moduleLabel="KTP">
      <div className="relative flex w-full flex-1 flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 md:hidden">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {activeYearLabel ? `Profiler · ${activeYearLabel}` : "Profiler"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setIsNavOpen(true)}
            className="min-h-11 shrink-0"
          >
            <PanelLeft data-icon="inline-start" aria-hidden="true" />
            Pilih batch
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-72 shrink-0 border-r border-border bg-card md:block">
            <ProfilerLibraryNav {...libraryNavProps} />
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">
            {!loaded ? (
              <div
                role="status"
                className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
                Memuat Profiler…
              </div>
            ) : activeFolder ? (
              <ProfilerBatchWorkspace
                key={activeFolder.name}
                batchName={activeFolder.name}
                teamName={activeTeamName}
                view={activeView}
                participantId={queryParams.participant ?? null}
                peserta={batchPeserta ?? []}
                loading={!batchPeserta && !pesertaError}
                error={pesertaError}
                onRetry={() => {
                  setPesertaError(null);
                  setPesertaReloadKey((key) => key + 1);
                }}
                isReadOnly={isReadOnly}
                upcomingBirthdays={upcomingBirthdays}
                onShowBirthdays={() => setShowBirthdayModal(true)}
                onPickPeserta={() => setShowPicker(true)}
              />
            ) : (
              <ProfilerYearOverview
                yearLabel={activeYearLabel}
                yearId={selectedYearId}
                folders={folders}
                counts={counts}
                isReadOnly={isReadOnly}
                onSelectBatch={(name) => selectBatch(name)}
                onAddYear={() => setShowAddYear(true)}
                onAddFolder={(yearId) => setShowAddFolder({ yearId })}
              />
            )}
          </div>
        </div>

        <Dialog open={isNavOpen} onOpenChange={setIsNavOpen}>
          <DialogContent
            showCloseButton={false}
            className="inset-y-0 left-0 top-0 h-full w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none bg-card p-0 sm:max-w-none md:hidden"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Pilih batch</DialogTitle>
              <DialogDescription>
                Pilih tahun, tim, dan batch Profiler.
              </DialogDescription>
            </DialogHeader>
            <ProfilerLibraryNav {...libraryNavProps} />
          </DialogContent>
        </Dialog>

        {/* Modals */}
        <Dialog open={showAddYear} onOpenChange={setShowAddYear}>
          <DialogContent className="bg-card sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Tambah tahun</DialogTitle>
              <DialogDescription>
                Buat arsip tahun baru untuk menyusun tim dan batch.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profiler-new-year">Tahun</Label>
              <Input
                id="profiler-new-year"
                type="number"
                value={newYearValue}
                onChange={(event) =>
                  setNewYearValue(Number.parseInt(event.target.value, 10))
                }
                min={2000}
                max={2100}
                className="h-11"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setShowAddYear(false)}
                className="min-h-11"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleAddYear}
                className="min-h-11"
              >
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(showAddFolder)}
          onOpenChange={(open) => {
            if (!open) setShowAddFolder(null);
          }}
        >
          <DialogContent className="bg-card sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Tambah {showAddFolder?.parentId ? "batch" : "tim"}
              </DialogTitle>
              <DialogDescription>
                {showAddFolder?.parentId
                  ? "Tambahkan batch baru di tim yang dipilih."
                  : "Tambahkan tim baru di tahun yang dipilih."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profiler-new-folder">Nama</Label>
              <Input
                id="profiler-new-folder"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Contoh: Tim Call"
                className="h-11"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setShowAddFolder(null)}
                className="min-h-11"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleAddFolder}
                disabled={!newFolderName.trim()}
                className="min-h-11"
              >
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(renamingFolder)}
          onOpenChange={(open) => {
            if (!open) setRenamingFolder(null);
          }}
        >
          <DialogContent className="bg-card sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Ubah nama</DialogTitle>
              <DialogDescription>
                Perbarui nama tim atau batch tanpa mengubah data pesertanya.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profiler-rename-folder">Nama baru</Label>
              <Input
                id="profiler-rename-folder"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="h-11"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setRenamingFolder(null)}
                className="min-h-11"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleRenameFolder}
                disabled={
                  !renameValue.trim() ||
                  renameValue.trim() === renamingFolder?.name
                }
                className="min-h-11"
              >
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(confirmDeleteFolder)}
          onOpenChange={(open) => {
            if (!open && !deleting) setConfirmDeleteFolder(null);
          }}
        >
          <DialogContent className="bg-card sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 aria-hidden="true" />
                Hapus folder?
              </DialogTitle>
              <DialogDescription>
                Folder <strong>{confirmDeleteFolder?.name}</strong> dan seluruh
                isinya akan dihapus permanen. Tindakan ini tidak dapat
                dibatalkan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setConfirmDeleteFolder(null)}
                disabled={deleting}
                className="min-h-11"
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={handleDeleteFolder}
                disabled={deleting}
                className="min-h-11"
              >
                {deleting && (
                  <Loader2
                    data-icon="inline-start"
                    aria-hidden="true"
                    className="motion-reduce:animate-none"
                  />
                )}
                {deleting ? "Menghapus..." : "Ya, hapus"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {duplicateFolder && (
          <DuplicateFolderModal
            isOpen={!!duplicateFolder}
            onClose={() => setDuplicateFolder(null)}
            folder={duplicateFolder}
            years={years}
            onSuccess={(newFolder, newPeserta) => {
              setFolders((prev) => [...prev, newFolder]);
              setCounts((prev) => ({
                ...prev,
                [newFolder.name]: newPeserta.length,
              }));
              setPesertaMap((prev) => ({
                ...prev,
                [newFolder.name]: newPeserta as any,
              }));
              // Duplikat bisa bernama sama di tahun lain; tampilkan ringkasan tahun tujuan.
              if (newFolder.year_id) setSelectedYearId(newFolder.year_id);
              selectBatch("");
            }}
          />
        )}

        <AddMemberPicker
          isOpen={showPicker}
          onClose={() => setShowPicker(false)}
          targetBatch={selectedBatch}
          onSuccess={(newList) => {
            setPesertaMap((prev) => ({
              ...prev,
              [selectedBatch]: [...(prev[selectedBatch] || []), ...newList],
            }));
            setCounts((prev) => ({
              ...prev,
              [selectedBatch]: (prev[selectedBatch] || 0) + newList.length,
            }));
          }}
        />

        <Dialog open={showBirthdayModal} onOpenChange={setShowBirthdayModal}>
          <DialogContent className="max-w-md gap-0 overflow-hidden bg-card p-0">
            <DialogHeader className="border-b border-border p-5 sm:p-6">
              <DialogTitle className="flex items-center gap-2 font-outfit text-lg font-bold">
                <Cake aria-hidden="true" />
                Ulang tahun
              </DialogTitle>
              <DialogDescription>
                Acara mendatang di batch {selectedBatch}.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(70vh,20rem)] overflow-y-auto p-4 custom-scrollbar sm:p-5">
              {upcomingBirthdays.length === 0 ? (
                <Empty className="min-h-40 p-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Cake aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Tidak ada data ulang tahun.</EmptyTitle>
                    <EmptyDescription>
                      Data ulang tahun peserta akan muncul di sini.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcomingBirthdays.map((birthday, index) => {
                    const isToday = birthday.days === 0;
                    return (
                      <div
                        key={`${birthday.nama}-${birthday.tglLahir}-${index}`}
                        className={
                          isToday
                            ? "flex items-center gap-3 rounded-lg border border-primary bg-primary p-3 text-primary-foreground"
                            : "flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3"
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              isToday
                                ? "block truncate text-sm font-semibold text-primary-foreground"
                                : "block truncate text-sm font-semibold text-foreground"
                            }
                          >
                            {birthday.nama}
                          </span>
                          <span
                            className={
                              isToday
                                ? "mt-0.5 block truncate text-xs text-primary-foreground/80"
                                : "mt-0.5 block truncate text-xs text-muted-foreground"
                            }
                          >
                            {formatDate(birthday.tglLahir)} · {birthday.age}{" "}
                            tahun
                          </span>
                        </span>
                        <Badge
                          variant={isToday ? "secondary" : "outline"}
                          className="shrink-0"
                        >
                          {isToday ? "HARI INI" : `${birthday.days} HARI LAGI`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {upcomingBirthdays.length > 0 && (
              <div className="border-t border-border px-5 py-3">
                <p className="text-center text-xs text-muted-foreground">
                  Menampilkan 5 data terdekat
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </LeaderAccessGate>
  );
}
