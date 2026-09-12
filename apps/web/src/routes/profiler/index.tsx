import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
} from "@trainers/types";

import WorkspaceHeader from "./components/workspace/WorkspaceHeader";
import WorkspaceNavigator from "./components/workspace/WorkspaceNavigator";
import WorkspaceActiveBatch from "./components/workspace/WorkspaceActiveBatch";
import HierarchyPanel from "./components/workspace/HierarchyPanel";
import DuplicateFolderModal from "./components/DuplicateFolderModal";
import AddMemberPicker from "./components/AddMemberPicker";
import { Cake, Loader2, Trash2 } from "lucide-react";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
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
  const { isReadOnly, role } = useProfilerAccess();

  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pesertaMap, setPesertaMap] = useState<
    Record<string, ProfilerPeserta[]>
  >({});

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingPeserta, setLoadingPeserta] = useState(false);

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

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getFolderCounts(),
    ]).then(([y, f, c]) => {
      setYears(y);
      setFolders(f);
      setCounts(c);
      if (y.length > 0) {
        const currentYear = new Date().getFullYear();
        const sameYear = y.find((yy) => yy.year === currentYear);
        if (sameYear) setSelectedYearId(sameYear.id);
        else
          setSelectedYearId(
            [...y].sort((a, b) => b.year - a.year)[0]?.id || y[0]?.id || null,
          );
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedYearId) {
      setSelectedTeamId(null);
      setSelectedBatch("");
      setSelectedFolderId(null);
      return;
    }
    const teamStillValid = selectedTeamId
      ? folders.some(
          (f) =>
            f.id === selectedTeamId &&
            f.year_id === selectedYearId &&
            !f.parent_id,
        )
      : false;

    if (!teamStillValid) {
      setSelectedTeamId(null);
      setSelectedBatch("");
      setSelectedFolderId(null);
    }
  }, [selectedYearId, selectedTeamId, folders]);

  // Normalize selectedBatch if no longer in folder list (scoped metadata shrink)
  useEffect(() => {
    if (!selectedBatch || folders.length === 0) return;
    const exists = folders.some((f) => f.name === selectedBatch);
    if (!exists) {
      setSelectedBatch("");
      setSelectedFolderId(null);
    }
  }, [folders, selectedBatch]);

  useEffect(() => {
    if (!selectedBatch) return;
    if (!pesertaMap[selectedBatch]) {
      const fetchPeserta = async () => {
        setLoadingPeserta(true);
        try {
          const data = await profilerApi.getPesertaByBatch(selectedBatch);
          setPesertaMap((prev) => ({ ...prev, [selectedBatch]: data }));
        } catch (err) {
          console.error("Failed to fetch peserta:", err);
        } finally {
          setLoadingPeserta(false);
        }
      };
      fetchPeserta();
    }
  }, [selectedBatch, pesertaMap]);

  const handleAddYear = async () => {
    try {
      const newYear = await profilerApi.createYear(newYearValue);
      setYears((prev) => [newYear, ...prev]);
      setSelectedYearId(newYear.id);
      setShowAddYear(false);
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
      setSelectedFolderId(folder.id);
      setSelectedBatch(folder.name);
      setSelectedTeamId(showAddFolder.parentId || folder.id);
      setCounts((prev) => ({ ...prev, [folder.name]: 0 }));
      setPesertaMap((prev) => ({ ...prev, [folder.name]: [] }));
      setNewFolderName("");
      setShowAddFolder(null);
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
      if (selectedBatch === oldName) setSelectedBatch(newName);
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
      setFolders((prev) => prev.filter((f) => f.id !== confirmDeleteFolder.id));
      setCounts((prev) => {
        const next = { ...prev };
        delete next[confirmDeleteFolder.name];
        return next;
      });
      setPesertaMap((prev) => {
        const next = { ...prev };
        delete next[confirmDeleteFolder.name];
        return next;
      });
      if (selectedFolderId === confirmDeleteFolder.id) {
        setSelectedFolderId(null);
        setSelectedBatch("");
      }
    } catch (err: any) {
      alert("Gagal hapus: " + err.message);
    } finally {
      setDeleting(false);
      setConfirmDeleteFolder(null);
    }
  };

  const selectFolder = (id: string) => {
    const folder = folders.find((f) => f.id === id);
    if (folder) {
      setSelectedFolderId(id);
      if (!folder.parent_id) {
        setSelectedTeamId(folder.id);
        const children = folders.filter((f) => f.parent_id === folder.id);
        if (children.length === 0) {
          setSelectedBatch(folder.name);
        } else {
          setSelectedBatch("");
        }
      } else {
        setSelectedTeamId(folder.parent_id);
        setSelectedBatch(folder.name);
      }
    }
  };

  const count = counts[selectedBatch] || 0;
  const upcomingBirthdays = useMemo(
    () => getUpcomingBirthdays(pesertaMap[selectedBatch] || []),
    [pesertaMap, selectedBatch],
  );
  const activeTeamName = useMemo(
    () => folders.find((f) => f.id === selectedTeamId)?.name,
    [folders, selectedTeamId],
  );
  const activeYearLabel = useMemo(
    () => years.find((y) => y.id === selectedYearId)?.label,
    [years, selectedYearId],
  );

  return (
    <LeaderAccessGate module="ktp" moduleLabel="KTP">
      <div className="flex-1 bg-background flex flex-col transition-colors duration-500 overflow-hidden w-full relative">
        <WorkspaceHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          activeBatch={selectedBatch}
          activeTeam={activeTeamName}
          activeYearLabel={activeYearLabel}
        />

        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 overflow-hidden relative group">
            <AnimatePresence mode="wait">
              {!selectedBatch ? (
                <motion.div
                  key="navigator"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.4, ease: "circOut" }}
                  className="h-full"
                >
                  <WorkspaceNavigator
                    years={years}
                    folders={folders}
                    selectedYearId={selectedYearId}
                    onSelectYear={setSelectedYearId}
                    selectedTeamId={selectedTeamId}
                    onSelectTeam={setSelectedTeamId}
                    onSelectBatch={(id, name) => {
                      setSelectedFolderId(id);
                      setSelectedBatch(name);
                    }}
                    isReadOnly={isReadOnly}
                    onAddFolder={(yearId, parentId) =>
                      setShowAddFolder({ yearId, parentId })
                    }
                    counts={counts}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="active-batch"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.4, ease: "circOut" }}
                  className="h-full"
                >
                  <WorkspaceActiveBatch
                    batchName={selectedBatch}
                    count={count}
                    loadingPeserta={loadingPeserta}
                    isReadOnly={isReadOnly}
                    onPickPeserta={() => setShowPicker(true)}
                    upcomingBirthdays={upcomingBirthdays}
                    onShowBirthdays={() => setShowBirthdayModal(true)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <aside className="hidden md:block">
            <HierarchyPanel
              years={years}
              folders={folders}
              selectedYearId={selectedYearId}
              selectedFolderId={selectedFolderId}
              onSelectYear={setSelectedYearId}
              onSelectFolder={selectFolder}
              onAddYear={() => setShowAddYear(true)}
              onAddFolder={(yearId, parentId) =>
                setShowAddFolder({ yearId, parentId })
              }
              onRenameFolder={(f) => {
                setRenamingFolder(f);
                setRenameValue(f.name);
              }}
              onDeleteFolder={setConfirmDeleteFolder}
              onDuplicateFolder={setDuplicateFolder}
              counts={counts}
              role={role}
            />
          </aside>

          {/* Mobile Hierarchy Sidebar */}
          <Dialog open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <DialogContent
              showCloseButton={false}
              aria-labelledby="profiler-mobile-hierarchy-title"
              className="inset-y-0 right-0 left-auto top-0 h-full max-w-sm translate-x-0 translate-y-0 rounded-none bg-card p-0 sm:max-w-sm md:hidden"
            >
              <DialogHeader className="sr-only">
                <DialogTitle id="profiler-mobile-hierarchy-title">
                  Navigasi hierarki
                </DialogTitle>
                <DialogDescription>
                  Pilih tahun, tim, dan batch dari hierarki Profiler.
                </DialogDescription>
              </DialogHeader>
              <HierarchyPanel
                years={years}
                folders={folders}
                selectedYearId={selectedYearId}
                selectedFolderId={selectedFolderId}
                onSelectYear={setSelectedYearId}
                onSelectFolder={selectFolder}
                onAddYear={() => setShowAddYear(true)}
                onAddFolder={(yearId, parentId) =>
                  setShowAddFolder({ yearId, parentId })
                }
                onRenameFolder={(f) => {
                  setRenamingFolder(f);
                  setRenameValue(f.name);
                }}
                onDeleteFolder={setConfirmDeleteFolder}
                onDuplicateFolder={setDuplicateFolder}
                counts={counts}
                role={role}
                isMobile
                onClose={() => setIsSidebarOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

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
              setSelectedFolderId(newFolder.id);
              setSelectedBatch(newFolder.name);
              setSelectedTeamId(newFolder.parent_id || newFolder.id);
              setCounts((prev) => ({
                ...prev,
                [newFolder.name]: newPeserta.length,
              }));
              setPesertaMap((prev) => ({
                ...prev,
                [newFolder.name]: newPeserta as any,
              }));
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
