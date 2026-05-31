import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft, Plus, X, Save,
  Loader2, FolderInput, Check, ArrowUpDown,
  Download, ChevronDown, Activity,
} from 'lucide-react';
import { MoveFolderModal } from './components/table/MoveFolderModal';
import { EditPesertaModal } from './components/table/EditPesertaModal';
import { ProfilerTableFilters } from './components/table/ProfilerTableFilters';
import { ProfilerTableView } from './components/table/ProfilerTableView';

import { motion, AnimatePresence } from 'framer-motion';
import QaStatePanel from '../../components/ui/QaStatePanel';
import type { ProfilerPeserta } from '@trainers/types';
import { labelJabatan } from '@trainers/types';
import { profilerApi } from '../../lib/profilerService';
import { useQueryParams } from '../../hooks/useQueryParams';
import { useProfilerAccess } from '../../hooks/useProfilerAccess';

import {
  type PhotoFrame,
} from '../../lib/photo-frame';

// ── Move Folder Modal ─────────────────────────────────────────
const selectableId = (p: ProfilerPeserta): string | null => (typeof p.id === 'string' && p.id.length > 0 ? p.id : null);

export default function ProfilerTable() {
  const onViewAnalysis = (id: string) => router.navigate({ to: '/sidak/agents/$id', params: { id } });
  const onAddPeserta = () => router.navigate({ to: `/profiler/add`, search: { batch: batchName } });

  const router = useRouter();
  const { batch } = useQueryParams();
  const batchName = batch || '';
  const { isReadOnly } = useProfilerAccess();

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [initialFolders, setInitialFolders] = useState<any[]>([]);
  const [initialYears, setInitialYears] = useState<any[]>([]);
  const [initialTimList, setInitialTimList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterTim, setFilterTim] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeserta, setSelectedPeserta] = useState<ProfilerPeserta | null>(null);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [isNavigatingFolder, setIsNavigatingFolder] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Sort mode ────────────────────────────────────────────────
  const [sortMode, setSortMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // ── Select mode ──────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [, setPhotoFrameTick] = useState(0);

  // Fetch initial data
  useEffect(() => {
    if (!batchName) return;
    setLoading(true);
    setIsNavigatingFolder(false);
    
    Promise.all([
      profilerApi.getPesertaByBatch(batchName),
      profilerApi.getFolders(),
      profilerApi.getYears(),
      profilerApi.getTeams()
    ]).then(([p, f, y, t]) => {
      // Normalize: if batch not in scoped folders, redirect
      const folderNames = new Set(f.map((folder: any) => folder.name));
      if (batchName && f.length > 0 && !folderNames.has(batchName)) {
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
      setInitialTimList(t.map((team: any) => team.nama));
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [batchName]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setShowFolderDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(
        peserta.map(selectableId).filter((id): id is string => Boolean(id))
      );
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [peserta]);

  const activeTab = 'table';
  const refreshPhotoFrame = useCallback((id: string, frame: PhotoFrame) => {
    setPeserta(prev => prev.map(p => (p.id === id ? { ...p, photo_frame: frame } : p)));
    setPhotoFrameTick((v) => v + 1);
  }, []);

  const handleSaved = (updated: ProfilerPeserta) => setPeserta(prev => prev.map(p => p.id === updated.id ? updated : p));
  const handlePhotoUpdated = (id: string, fotoUrl: string) => {
    setPeserta(prev => prev.map(p => p.id === id ? { ...p, foto_url: fotoUrl } : p));
    setSelectedPeserta(prev => (prev?.id === id ? { ...prev, foto_url: fotoUrl } : prev));
  };
  const handleDeleted = (id: string) => setPeserta(prev => prev.filter(p => p.id !== id));
  const handleMoved = (ids: string[]) => { 
    setPeserta(prev => prev.filter(p => !ids.includes(p.id!))); 
    setSelectedIds(new Set()); 
    setSelectMode(false); 
    setFeedback({ type: 'success', message: `${ids.length} peserta berhasil dipindahkan.` });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => setDragOverIndex(null);

  const handleDragEnd = () => {
    const from = dragIndex;
    const to = dragOverIndex;
    if (from !== null && to !== null && from !== to) {
      setPeserta(prev => {
        const next = [...prev];
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
          .map((p, idx) => ({ id: p.id, nomor_urut: idx + 1 }))
      );
      setOrderChanged(false);
      setSortMode(false);
      setFeedback({ type: 'success', message: 'Urutan peserta berhasil disimpan.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Gagal menyimpan urutan: ${err.message}` });
    }
    finally { setSavingOrder(false); }
  };

  const cancelSort = () => { 
    setSortMode(false); 
    setOrderChanged(false); 
    setDragOverIndex(null); 
    // Reload from server to reset sort
    profilerApi.getPesertaByBatch(batchName).then(setPeserta);
  };

  const onSortClick = () => {
    setSortMode(true);
    setSelectMode(false);
    setSelectedIds(new Set());
    setOrderChanged(false);
    setPeserta(filtered);
  };

  const toggleSelectMode = () => { setSelectMode(v => !v); setSelectedIds(new Set()); };
  const toggleSelect = (id: string) => setSelectedIds(prev => { 
    const n = new Set(prev); 
    if (n.has(id)) { n.delete(id); } else { n.add(id); }
    return n; 
  });
  
  const query = searchQuery.trim().toLowerCase();
  const filtered = peserta.filter((p) => {
    const matchTim = filterTim === 'all'
      ? true
      : (p.tim ?? '').toLowerCase() === filterTim.toLowerCase();
    const matchQuery = query.length === 0
      ? true
      : [
          p.nama,
          p.tim,
          p.nik_ojk,
          p.email_ojk,
          p.jabatan ? labelJabatan[p.jabatan] : '',
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

    return matchTim && matchQuery;
  });

  const allTims = useMemo(() => {
    const present = Array.from(new Set(peserta.map(p => p.tim).filter(Boolean)));
    return ['all', ...present.sort()];
  }, [peserta]);

  const displayList = sortMode ? peserta : filtered;
  const hasActiveFilters = filterTim !== 'all' || query.length > 0;

  const resetFilters = () => {
    setFilterTim('all');
    setSearchQuery('');
  };

  if (!batchName) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          Pilih batch terlebih dahulu dari halaman Profiler.
        </p>
        <Link
          to="/profiler"
          className="mt-4 inline-flex items-center gap-2 text-indigo-600 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Profiler
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="relative h-full"><div className={`h-full overflow-auto bg-background/50 backdrop-blur-sm flex flex-col ${selectMode && selectedIds.size > 0 ? 'pb-28' : ''}`}>
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">

        {/* ── Tabs Navigation ── */}
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-2xl w-fit border border-border/40 backdrop-blur-sm self-center sm:self-start">
          <button
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'table'
                ? 'bg-background text-primary shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Daftar Peserta
          </button>
          <button
            onClick={() => router.navigate({ to: `/profiler/slides`, search: { batch: batchName } })}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tampilan Slide
          </button>
        </div>

        {/* ── Header + Actions ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (sortMode) { cancelSort(); return; }
                if (selectMode) { toggleSelectMode(); return; }
                router.navigate({ to: '/profiler' });
              }}
              className="h-11 w-11 flex shrink-0 items-center justify-center bg-card border border-border/40 rounded-2xl text-primary hover:bg-muted transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={sortMode || selectMode ? 'Batal' : 'Kembali'}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="relative min-w-0" ref={dropdownRef}>
              <button
                onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                className="group flex flex-col items-start hover:bg-muted p-2 -m-2 rounded-2xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0"
              >
                <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 min-w-0">
                  <span className="truncate max-w-[200px] sm:max-w-[320px]">{batchName}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-primary transition-transform duration-300 ${showFolderDropdown ? 'rotate-180' : ''}`} />
                </h1>
                <div className="flex items-center gap-2 mt-1 shrink-0">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Database Peserta</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    {peserta.length} Agen
                  </span>
                </div>
              </button>

              <AnimatePresence>
                {showFolderDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-4 w-80 max-w-[calc(100vw-2rem)] bg-card/95 border border-border/40 rounded-3xl shadow-2xl z-[100] overflow-hidden backdrop-blur-xl"
                  >
                    <div className="max-h-80 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                      {initialYears.map(year => {
                        const yearFolders = initialFolders.filter(f => f.year_id === year.id);
                        if (yearFolders.length === 0) return null;
                        return (
                          <div key={year.id} className="space-y-2">
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.25em] px-3">{year.label}</p>
                            <div className="space-y-1">
                              {yearFolders.map(folder => (
                                <button
                                  key={folder.id}
                                  onClick={() => {
                                    setIsNavigatingFolder(true);
                                    router.navigate({ to: `/profiler/table`, search: { batch: folder.name } });
                                    setShowFolderDropdown(false);
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    folder.name === batchName
                                      ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20'
                                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  <span className="truncate">{folder.name}</span>
                                  {folder.name === batchName && <Check className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {!isReadOnly && !sortMode && !selectMode && (
              <button
                onClick={() => router.navigate({ to: `/profiler/add`, search: { batch: batchName } })}
                className="h-11 inline-flex items-center gap-2 px-5 bg-primary hover:opacity-90 text-primary-foreground rounded-2xl text-xs font-bold shadow-lg shadow-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="w-5 h-5" /> Tambah Peserta
              </button>
            )}

            {!sortMode && !selectMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDensity((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable'))}
                  className="h-11 w-11 flex items-center justify-center bg-card border border-border/40 rounded-2xl text-muted-foreground hover:text-foreground transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={density === 'comfortable' ? 'Mode Ringkas' : 'Mode Nyaman'}
                >
                  <Activity className="w-5 h-5" />
                </button>
                <button
                  onClick={() => router.navigate({ to: `/profiler/export`, search: { batch: batchName } })}
                  className="h-11 w-11 flex items-center justify-center bg-card border border-border/40 rounded-2xl text-muted-foreground hover:text-foreground transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Ekspor"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            )}

            {!isReadOnly && (
              <div className="flex items-center bg-card border border-border/40 rounded-2xl h-11 p-1 gap-1 shadow-sm">
                <button
                  onClick={toggleSelectMode}
                  className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selectMode ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  title="Pilih Banyak"
                >
                  <FolderInput className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-border/40 shrink-0 mx-0.5" />
                {sortMode ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveOrder}
                      disabled={savingOrder || !orderChanged}
                      className="h-9 w-9 flex items-center justify-center bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Simpan Urutan"
                    >
                      <Save className="w-5 h-5" />
                    </button>
                    <button
                      onClick={cancelSort}
                      className="h-9 w-9 flex items-center justify-center text-destructive hover:bg-destructive/5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Batal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onSortClick}
                    className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Atur Urutan"
                  >
                    <ArrowUpDown className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Search & Filter Panel ── */}
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

        {feedback && (
          <QaStatePanel
            type={feedback.type}
            title={feedback.type === 'success' ? 'Perubahan berhasil disimpan' : 'Terjadi kendala saat menyimpan perubahan'}
            description={feedback.message}
            action={
              <button
                onClick={() => setFeedback(null)}
                className="text-xs font-bold uppercase tracking-widest opacity-80 hover:opacity-100"
              >
                Tutup
              </button>
            }
          />
        )}

        {isNavigatingFolder && (
          <QaStatePanel
            type="loading"
            title="Memuat folder tujuan"
            description="Data folder sedang disiapkan. Mohon tunggu sebentar."
          />
        )}

        {/* ── List Peserta ── */}
        <ProfilerTableView
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
          onViewAnalysis={onViewAnalysis}
          onAddPeserta={onAddPeserta}
          dragIndex={dragIndex}
          handleDragStart={handleDragStart}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDragEnd={handleDragEnd}
        />

        {sortMode && orderChanged && (
          <button onClick={saveOrder} disabled={savingOrder}
            className="w-full py-4 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground rounded-3xl text-sm font-bold flex items-center justify-center gap-3 transition-all sticky bottom-4 shadow-2xl shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-primary/20 backdrop-blur-sm">
            {savingOrder ? <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan urutan...</> : <><Save className="w-4 h-4" />Simpan Urutan Baru</>}
          </button>
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 z-50 pointer-events-none">
          <div className="bg-foreground rounded-[2rem] shadow-2xl px-6 py-4 flex items-center gap-4 flex-wrap justify-center pointer-events-auto border border-background/10 backdrop-blur-xl">
            <div className="flex items-center gap-2 pr-2 border-r border-background/20">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-primary-foreground">
                {selectedIds.size}
              </div>
              <p className="text-background text-sm font-bold tracking-tight">Terpilih</p>
            </div>
            
            <button onClick={() => setShowMoveModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-background hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all shadow-lg shadow-black/10">
              <FolderInput className="w-4 h-4 text-primary" />
              Pindah Folder
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center justify-center w-10 h-10 bg-background/10 hover:bg-background/20 text-background rounded-full transition-all border border-background/20"
              title="Batalkan Pilihan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>

      {selectedPeserta && (
        <EditPesertaModal peserta={selectedPeserta} timList={initialTimList}
          onClose={() => setSelectedPeserta(null)} onSaved={handleSaved} onDeleted={handleDeleted} onFrameUpdated={refreshPhotoFrame} onPhotoUpdated={handlePhotoUpdated} isReadOnly={isReadOnly} />
      )}
      {showMoveModal && (
        <MoveFolderModal 
          selectedIds={Array.from(selectedIds)} 
          currentBatch={batchName}
          folders={initialFolders}
          years={initialYears}
          onClose={() => setShowMoveModal(false)} 
          onMoved={handleMoved} 
        />
      )}
    </div>
  );
}
