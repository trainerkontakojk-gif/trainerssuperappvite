import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { profilerApi } from "../../lib/profilerService";
import type { ProfilerYear, ProfilerFolder, ProfilerPeserta } from "@trainers/types";

import WorkspaceHeader from "./components/workspace/WorkspaceHeader";
import WorkspaceNavigator from "./components/workspace/WorkspaceNavigator";
import WorkspaceActiveBatch from "./components/workspace/WorkspaceActiveBatch";
import HierarchyPanel from "./components/workspace/HierarchyPanel";
import DuplicateFolderModal from "./components/DuplicateFolderModal";
import AddMemberPicker from "./components/AddMemberPicker";
import { Cake, Trash2 } from "lucide-react";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import LeaderAccessGate from "../../components/LeaderAccessGate";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
}

function getDaysUntilBirthday(tglLahir: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dob = new Date(tglLahir);
  const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function getUpcomingBirthdays(pesertaList: ProfilerPeserta[]): { nama: string; tglLahir: string; days: number; age: number }[] {
  const today = new Date();
  return pesertaList
    .filter(p => p.tgl_lahir)
    .map(p => {
      const days = getDaysUntilBirthday(p.tgl_lahir!);
      const dob = new Date(p.tgl_lahir!);
      const nextYear =
        today.getMonth() > dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() > dob.getDate())
          ? today.getFullYear() + 1
          : today.getFullYear();
      const age = nextYear - dob.getFullYear();
      return { nama: p.nama || 'Unknown', tglLahir: p.tgl_lahir!, days, age };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
}

export default function ProfilerLanding() {
  const { isReadOnly, role } = useProfilerAccess();

  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pesertaMap, setPesertaMap] = useState<Record<string, ProfilerPeserta[]>>({});

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingPeserta, setLoadingPeserta] = useState(false);

  // Modals
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearValue, setNewYearValue] = useState(new Date().getFullYear());
  const [showAddFolder, setShowAddFolder] = useState<{ yearId: string; parentId?: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<ProfilerFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<ProfilerFolder | null>(null);
  const [duplicateFolder, setDuplicateFolder] = useState<ProfilerFolder | null>(null);
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
        else setSelectedYearId([...y].sort((a, b) => b.year - a.year)[0]?.id || y[0]?.id || null);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedYearId) {
      setSelectedTeamId(null);
      setSelectedBatch('');
      setSelectedFolderId(null);
      return;
    }
    const teamStillValid = selectedTeamId
      ? folders.some((f) => f.id === selectedTeamId && f.year_id === selectedYearId && !f.parent_id)
      : false;

    if (!teamStillValid) {
      setSelectedTeamId(null);
      setSelectedBatch('');
      setSelectedFolderId(null);
    }
  }, [selectedYearId, selectedTeamId, folders]);

  // Normalize selectedBatch if no longer in folder list (scoped metadata shrink)
  useEffect(() => {
    if (!selectedBatch || folders.length === 0) return;
    const exists = folders.some((f) => f.name === selectedBatch);
    if (!exists) {
      setSelectedBatch('');
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
          setPesertaMap(prev => ({ ...prev, [selectedBatch]: data }));
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
      setYears(prev => [newYear, ...prev]);
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
        parent_id: showAddFolder.parentId
      });
      setFolders(prev => [...prev, folder]);
      setSelectedFolderId(folder.id);
      setSelectedBatch(folder.name);
      setSelectedTeamId(showAddFolder.parentId || folder.id);
      setCounts(prev => ({ ...prev, [folder.name]: 0 }));
      setPesertaMap(prev => ({ ...prev, [folder.name]: [] }));
      setNewFolderName('');
      setShowAddFolder(null);
    } catch (err: any) {
      alert("Gagal tambah folder: " + err.message);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim() || renameValue.trim() === renamingFolder.name) {
      setRenamingFolder(null); return;
    }
    const newName = renameValue.trim();
    const oldName = renamingFolder.name;
    try {
      await profilerApi.renameFolder(renamingFolder.id, newName);
      setFolders(prev => prev.map(f => f.id === renamingFolder.id ? { ...f, name: newName } : f));
      setCounts(prev => {
        const next = { ...prev };
        next[newName] = next[oldName] || 0;
        delete next[oldName];
        return next;
      });
      setPesertaMap(prev => {
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
      setFolders(prev => prev.filter(f => f.id !== confirmDeleteFolder.id));
      setCounts(prev => { const next = { ...prev }; delete next[confirmDeleteFolder.name]; return next; });
      setPesertaMap(prev => { const next = { ...prev }; delete next[confirmDeleteFolder.name]; return next; });
      if (selectedFolderId === confirmDeleteFolder.id) {
        setSelectedFolderId(null);
        setSelectedBatch('');
      }
    } catch (err: any) {
      alert("Gagal hapus: " + err.message);
    } finally {
      setDeleting(false);
      setConfirmDeleteFolder(null);
    }
  };

  const selectFolder = (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      setSelectedFolderId(id);
      if (!folder.parent_id) {
        setSelectedTeamId(folder.id);
        const children = folders.filter((f) => f.parent_id === folder.id);
        if (children.length === 0) {
          setSelectedBatch(folder.name);
        } else {
          setSelectedBatch('');
        }
      } else {
        setSelectedTeamId(folder.parent_id);
        setSelectedBatch(folder.name);
      }
    }
  };

  const count = counts[selectedBatch] || 0;
  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(pesertaMap[selectedBatch] || []), [pesertaMap, selectedBatch]);
  const activeTeamName = useMemo(() => folders.find(f => f.id === selectedTeamId)?.name, [folders, selectedTeamId]);
  const activeYearLabel = useMemo(() => years.find(y => y.id === selectedYearId)?.label, [years, selectedYearId]);

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
                  onAddFolder={(yearId, parentId) => setShowAddFolder({ yearId, parentId })}
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
            onAddFolder={(yearId, parentId) => setShowAddFolder({ yearId, parentId })}
            onRenameFolder={(f) => { setRenamingFolder(f); setRenameValue(f.name); }}
            onDeleteFolder={setConfirmDeleteFolder}
            onDuplicateFolder={setDuplicateFolder}
            counts={counts}
            role={role}
          />
        </aside>

        {/* Mobile Hierarchy Sidebar */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 z-[70] h-full w-[85%] max-w-sm bg-surface border-l border-border md:hidden"
              >
                <HierarchyPanel 
                  years={years}
                  folders={folders}
                  selectedYearId={selectedYearId}
                  selectedFolderId={selectedFolderId}
                  onSelectYear={setSelectedYearId}
                  onSelectFolder={selectFolder}
                  onAddYear={() => setShowAddYear(true)}
                  onAddFolder={(yearId, parentId) => setShowAddFolder({ yearId, parentId })}
                  onRenameFolder={(f) => { setRenamingFolder(f); setRenameValue(f.name); }}
                  onDeleteFolder={setConfirmDeleteFolder}
                  onDuplicateFolder={setDuplicateFolder}
                  counts={counts}
                  role={role}
                  isMobile
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      {showAddYear && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 border border-border shadow-xl">
            <h3 className="text-lg font-outfit font-bold mb-4 text-fg">Tambah Tahun</h3>
            <input 
              type="number"
              value={newYearValue}
              onChange={e => setNewYearValue(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-md border border-border bg-background mb-4 transition-all focus:border-fg focus:outline-none text-fg font-medium"
              min="2000" max="2100"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddYear(false)} className="px-4 py-2 border border-border rounded-md font-medium text-xs text-fg bg-transparent hover:bg-background transition-colors">Batal</button>
              <button onClick={handleAddYear} className="px-4 py-2 rounded-md font-medium text-xs bg-inv-bg text-inv-fg hover:opacity-90 transition-opacity">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showAddFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 border border-border shadow-xl">
            <h3 className="text-lg font-outfit font-bold mb-4 text-fg">
              Tambah {showAddFolder.parentId ? 'Batch/Group' : 'Tim/Folder'}
            </h3>
            <input 
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Nama"
              className="w-full px-3 py-2 rounded-md border border-border bg-background mb-4 transition-all focus:border-fg focus:outline-none text-fg font-medium"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddFolder(null)} className="px-4 py-2 border border-border rounded-md font-medium text-xs text-fg bg-transparent hover:bg-background transition-colors">Batal</button>
              <button onClick={handleAddFolder} disabled={!newFolderName.trim()} className="px-4 py-2 rounded-md font-medium text-xs bg-inv-bg text-inv-fg hover:opacity-90 disabled:opacity-50 transition-opacity">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {renamingFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 border border-border shadow-xl">
            <h3 className="text-lg font-outfit font-bold mb-4 text-fg">Ubah Nama</h3>
            <input 
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background mb-4 transition-all focus:border-fg focus:outline-none text-fg font-medium"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenamingFolder(null)} className="px-4 py-2 border border-border rounded-md font-medium text-xs text-fg bg-transparent hover:bg-background transition-colors">Batal</button>
              <button onClick={handleRenameFolder} disabled={!renameValue.trim() || renameValue === renamingFolder.name} className="px-4 py-2 rounded-md font-medium text-xs bg-inv-bg text-inv-fg hover:opacity-90 disabled:opacity-50 transition-opacity">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteFolder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md" onClick={() => !deleting && setConfirmDeleteFolder(null)}>
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 border border-border shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <h3 className="text-lg font-outfit font-bold text-destructive mb-2 text-center">Hapus Folder?</h3>
            <p className="text-xs text-fg2 mb-6 leading-relaxed text-center">
              Folder <span className="underline font-semibold">"{confirmDeleteFolder.name}"</span> dan semua isinya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteFolder(null)} className="px-4 py-2 border border-border rounded-md font-medium text-xs text-fg bg-transparent hover:bg-background transition-colors" disabled={deleting}>Batal</button>
              <button onClick={handleDeleteFolder} disabled={deleting} className="px-4 py-2 rounded-md font-medium text-xs bg-destructive text-white hover:bg-destructive/90 transition-colors flex items-center gap-2">
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateFolder && (
        <DuplicateFolderModal
          isOpen={!!duplicateFolder}
          onClose={() => setDuplicateFolder(null)}
          folder={duplicateFolder}
          years={years}
          onSuccess={(newFolder, newPeserta) => {
            setFolders(prev => [...prev, newFolder]);
            setSelectedFolderId(newFolder.id);
            setSelectedBatch(newFolder.name);
            setSelectedTeamId(newFolder.parent_id || newFolder.id);
            setCounts(prev => ({ ...prev, [newFolder.name]: newPeserta.length }));
            setPesertaMap(prev => ({ ...prev, [newFolder.name]: newPeserta as any }));
          }}
        />
      )}

      <AddMemberPicker 
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        targetBatch={selectedBatch}
        onSuccess={(newList) => {
          setPesertaMap(prev => ({ 
            ...prev, 
            [selectedBatch]: [...(prev[selectedBatch] || []), ...newList] 
          }));
          setCounts(prev => ({ ...prev, [selectedBatch]: (prev[selectedBatch] || 0) + newList.length }));
        }}
      />

      {showBirthdayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md" onClick={() => setShowBirthdayModal(false)}>
          <div className="bg-surface w-full max-w-sm rounded-2xl border border-border overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-outfit font-bold flex items-center gap-2 text-fg">
                <Cake size={20} className="text-fg" /> 
                Ulang Tahun
              </h3>
              <p className="text-[10px] text-fg3 font-medium uppercase tracking-wider mt-0.5">Acara mendatang di {selectedBatch}</p>
            </div>
            <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {upcomingBirthdays.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-xs text-fg3 font-medium italic">Tidak ada data ulang tahun.</p>
                </div>
              ) : (
                upcomingBirthdays.map((b, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${b.days === 0 ? 'bg-inv-bg text-inv-fg border-transparent' : 'bg-background border-border'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${b.days === 0 ? 'text-inv-fg' : 'text-fg'}`}>
                        {b.nama}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${b.days === 0 ? 'text-inv-fg/80' : 'text-fg3'}`}>{formatDate(b.tglLahir)} · {b.age} TAHUN</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-[10px] font-medium tracking-wide ${b.days === 0 ? 'text-inv-fg animate-pulse' : 'text-fg3'}`}>
                        {b.days === 0 ? 'HARI INI' : `${b.days} HARI LAGI`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {upcomingBirthdays.length > 0 && (
              <div className="px-6 pb-4">
                <p className="text-[10px] text-fg3 text-center font-medium">
                  Menampilkan 5 data terdekat
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </LeaderAccessGate>
  );
}
