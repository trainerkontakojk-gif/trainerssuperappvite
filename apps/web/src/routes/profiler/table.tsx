import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft, Plus, X, Save, Trash2, Upload,
  Loader2, FolderInput, Check, GripVertical, ArrowUpDown,
  Download, ChevronDown, Activity, FilterX,
  Inbox,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QaStatePanel from '../../components/ui/QaStatePanel';
import type { ProfilerPeserta } from '@trainers/types';
import { labelJabatan } from '@trainers/types';
import { profilerApi } from '../../lib/profilerService';
import { useQueryParams } from '../../hooks/useQueryParams';
import { useProfilerAccess } from '../../hooks/useProfilerAccess';
import { notify } from '../../lib/toast';

import {
  DEFAULT_PHOTO_FRAME,
  getPhotoFrame,
  getPhotoImageStyle,
  normalizePhotoFrame,
  setPhotoFrame,
  markPhotoFrameAsSaved,
  type PhotoFrame,
} from '../../lib/photo-frame';

const inputClass = "w-full min-w-0 min-h-11 px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm leading-5 text-foreground placeholder-foreground/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
const labelClass = "block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 select-none";

// ── Move Folder Modal ─────────────────────────────────────────
const MoveFolderModal: React.FC<{
  selectedIds: string[];
  currentBatch: string;
  folders: any[];
  years: any[];
  onClose: () => void;
  onMoved: (ids: string[], targetFolder: string) => void;
}> = ({ selectedIds, currentBatch, folders, years, onClose, onMoved }) => {
  const [targetFolder, setTargetFolder] = useState('');
  const [moving, setMoving] = useState(false);

  const handleMove = async () => {
    if (!targetFolder) return;
    setMoving(true);
    try {
      await profilerApi.movePesertaToBatch(selectedIds, targetFolder);
      onMoved(selectedIds, targetFolder);
      onClose();
    } catch (err: any) {
      notify.error('Gagal memindahkan: ' + err.message);
    } finally { 
      setMoving(false); 
    }
  };

  const otherFolders = folders.filter(f => f.name !== currentBatch);

  return (
    <AnimatePresence>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/40 backdrop-blur-md p-0 sm:p-4 overflow-hidden"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="bg-card w-full sm:max-w-md sm:rounded-[2.5rem] rounded-t-[2.5rem] border border-border/40 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] flex flex-col max-h-[90vh]"
        >
          {/* Handle for mobile drag-down feel */}
          <div className="flex justify-center pt-4 pb-2 sm:hidden shrink-0">
            <div className="w-12 h-1.5 bg-muted rounded-full opacity-40" />
          </div>

          <div className="px-8 pt-6 pb-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-foreground tracking-tighter flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-primary" />
                Pindah Folder
              </h2>
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mt-1">
                {selectedIds.length} Peserta Terpilih
              </p>
            </div>
            <button 
              onClick={onClose} 
              className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-all group active:scale-95"
            >
              <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
            {otherFolders.length === 0 ? (
              <div className="py-4">
                <QaStatePanel 
                  type="empty" 
                  title="Folder Tidak Ditemukan" 
                  description="Tidak ada folder lain yang tersedia saat ini. Silakan buat folder baru terlebih dahulu."
                />
              </div>
            ) : (
              <div className="space-y-6 pb-6">
                {years.map(year => {
                  const yearFolders = otherFolders.filter(f => f.year_id === year.id && !f.parent_id);
                  if (yearFolders.length === 0) return null;
                  
                  return (
                    <div key={year.id} className="space-y-3">
                      <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">{year.label}</p>
                      <div className="grid gap-2">
                        {yearFolders.map(folder => {
                          const subFolders = otherFolders.filter(f => f.parent_id === folder.id);
                          const isSelected = targetFolder === folder.name;

                          return (
                            <div key={folder.id} className="grid gap-2">
                              <button 
                                onClick={() => setTargetFolder(folder.name)}
                                className={`group w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all text-left relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                                  isSelected
                                    ? 'border-primary bg-primary/[0.03] shadow-inner'
                                    : 'border-border/40 hover:border-primary/40 bg-background/50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/40 group-hover:text-primary/60'}`}>
                                    <Inbox className="w-4 h-4" />
                                  </div>
                                  <span className={`text-sm font-bold tracking-tight transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                    {folder.name}
                                  </span>
                                </div>
                                {isSelected && (
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary-foreground stroke-[3px]" />
                                  </motion.div>
                                )}
                              </button>
                              
                              {subFolders.map(sub => {
                                const isSubSelected = targetFolder === sub.name;
                                return (
                                  <button 
                                    key={sub.id} 
                                    onClick={() => setTargetFolder(sub.name)}
                                    className={`group w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all text-left ml-6 w-[calc(100%-1.5rem)] relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                                      isSubSelected
                                        ? 'border-primary bg-primary/[0.03] shadow-inner'
                                        : 'border-border/40 hover:border-primary/40 bg-background/50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`transition-colors ${isSubSelected ? 'text-primary' : 'text-muted-foreground/40 group-hover:text-primary/60'}`}>
                                        <Inbox className="w-3.5 h-3.5" />
                                      </div>
                                      <span className={`text-sm font-bold tracking-tight transition-colors ${isSubSelected ? 'text-primary' : 'text-foreground'}`}>
                                        {sub.name}
                                      </span>
                                    </div>
                                    {isSubSelected && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-primary-foreground stroke-[3px]" />
                                      </motion.div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="p-8 pt-4 border-t border-border/40 bg-muted/20 shrink-0 space-y-3">
            <button 
              onClick={handleMove} 
              disabled={!targetFolder || moving}
              className="w-full h-14 bg-primary hover:opacity-90 disabled:opacity-30 text-primary-foreground rounded-2xl text-sm font-bold flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {moving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Sedang Memindahkan...</>
              ) : (
                <><Check className="w-5 h-5" /> Konfirmasi Pemindahan</>
              )}
            </button>
            <button 
              onClick={onClose} 
              className="w-full h-12 hover:bg-muted text-muted-foreground hover:text-foreground rounded-2xl text-sm font-bold transition-all active:scale-[0.98]"
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ── Helper components for EditModal ───────────────────────────
const SectionTitle = ({ children, accent = true }: { children: React.ReactNode; accent?: boolean }) => (
  <div className="flex items-center gap-3 mb-4">
    {accent && <div className="w-1 h-5 bg-primary/40 rounded-full" />}
    <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.12em]">{children}</h3>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0 flex flex-col gap-1.5">
    <label className={labelClass}>{label}</label>
    {children}
  </div>
);

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <section className="rounded-[1.75rem] border border-border/30 bg-background/35 p-5 sm:p-6 space-y-5 shadow-sm">
    {children}
  </section>
);

// ── EditModal ─────────────────────────────────────────────────
const EditModal: React.FC<{
  peserta: ProfilerPeserta;
  timList: string[];
  onClose: () => void;
  onSaved: (updated: ProfilerPeserta) => void;
  onDeleted: (id: string) => void;
  onFrameUpdated: (id: string, frame: PhotoFrame) => void;
  onPhotoUpdated: (id: string, fotoUrl: string) => void;
  isReadOnly?: boolean;
}> = ({ peserta, timList, onClose, onSaved, onDeleted, onFrameUpdated, onPhotoUpdated, isReadOnly }) => {
  const [form, setForm] = useState<ProfilerPeserta>({ ...peserta });
  const [saving, setSaving] = useState(false);
  const [fotoPreview, setFotoPreview] = useState<string>(peserta.foto_url || '');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [photoFrame, setPhotoFrameState] = useState<PhotoFrame>(DEFAULT_PHOTO_FRAME);
  const frameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFrameRef = useRef<PhotoFrame | null>(null);

  useEffect(() => {
    setPhotoFrameState(getPhotoFrame(peserta.id, peserta.photo_frame));
  }, [peserta.id, peserta.photo_frame]);

  const flushPendingFrameSave = async () => {
    if (frameSaveTimerRef.current) {
      clearTimeout(frameSaveTimerRef.current);
      frameSaveTimerRef.current = null;
    }
    if (pendingFrameRef.current && form.id && !isReadOnly) {
      const frameToSave = pendingFrameRef.current;
      pendingFrameRef.current = null;
      try {
        await profilerApi.updatePeserta(form.id, { photo_frame: frameToSave });
        markPhotoFrameAsSaved(form.id, frameToSave);
      } catch (err) {
        console.error('Gagal flush frame foto ke server', err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (frameSaveTimerRef.current) {
        clearTimeout(frameSaveTimerRef.current);
      }
    };
  }, []);

  const set = <K extends keyof ProfilerPeserta>(key: K, value: ProfilerPeserta[K]) => setForm(prev => ({ ...prev, [key]: value }));
  
  const updateFrame = (next: Partial<PhotoFrame>) => {
    if (isReadOnly || !form.id) return;
    const normalized = normalizePhotoFrame({ ...photoFrame, ...next });
    setPhotoFrameState(normalized);
    setPhotoFrame(form.id, normalized);
    setForm(prev => ({ ...prev, photo_frame: normalized }));
    onFrameUpdated(form.id, normalized);

    pendingFrameRef.current = normalized;
    if (frameSaveTimerRef.current) {
      clearTimeout(frameSaveTimerRef.current);
    }
    frameSaveTimerRef.current = setTimeout(async () => {
      if (!pendingFrameRef.current || !form.id) return;
      const frameToSave = pendingFrameRef.current;
      pendingFrameRef.current = null;
      try {
        await profilerApi.updatePeserta(form.id, { photo_frame: frameToSave });
        markPhotoFrameAsSaved(form.id, frameToSave);
      } catch (err) {
        console.error('Gagal sinkronisasi frame foto ke server', err);
      }
    }, 800);
  };

  const handleClose = async () => {
    await flushPendingFrameSave();
    onClose();
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form.id) return;
    const previousPreview = fotoPreview;
    const localPreview = URL.createObjectURL(file);
    setFotoPreview(localPreview);
    setUploadingFoto(true);
    try {
      const url = await profilerApi.uploadFoto(file, form.id);
      await profilerApi.updatePeserta(form.id, { foto_url: url });
      setFotoPreview(url);
      setForm(prev => ({ ...prev, foto_url: url }));
      onPhotoUpdated(form.id, url);
    } catch (err: any) {
      setFotoPreview(previousPreview);
      notify.error('Gagal upload foto: ' + err.message);
    } finally {
      URL.revokeObjectURL(localPreview);
      e.target.value = '';
      setUploadingFoto(false);
    }
  };

  const handleSave = async () => {
    if (!form.nama?.trim()) { notify.error('Nama wajib diisi.'); return; }
    setSaving(true);
    try {
      await flushPendingFrameSave();
      await profilerApi.updatePeserta(form.id!, form);
      onSaved(form); 
      onClose();
      notify.success("Data peserta berhasil disimpan");
    } catch (err: any) { 
      notify.error('Gagal simpan: ' + err.message); 
    }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Hapus ${form.nama}?`)) return;
    await profilerApi.deletePeserta(form.id!);
    onDeleted(form.id!); 
    onClose();
    notify.success("Peserta berhasil dihapus");
  };

  return (
    <AnimatePresence>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/40 backdrop-blur-md p-0 sm:p-4 overflow-hidden"
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 30 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card w-full sm:max-w-3xl sm:rounded-[2.5rem] rounded-t-[2.5rem] border border-border/40 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-border/40 shrink-0 bg-background/50 backdrop-blur-sm">
            <div>
              <h2 className="text-xl font-black text-foreground tracking-tighter">Profil Peserta</h2>
              <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.12em] mt-1">Data & Konfigurasi Visual</p>
            </div>
            <div className="flex items-center gap-3">
              {!isReadOnly && (
                <>
                  <button 
                    onClick={handleDelete} 
                    className="flex sm:hidden items-center justify-center w-11 h-11 text-destructive hover:bg-destructive/10 rounded-2xl transition-all active:scale-95 border border-transparent hover:border-destructive/20"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={handleDelete} 
                    className="hidden sm:flex items-center gap-2 px-4 py-2.5 text-destructive hover:bg-destructive/10 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 border border-transparent hover:border-destructive/20"
                  >
                    <Trash2 className="w-4 h-4" /> Hapus
                  </button>
                </>
              )}
              <button 
                onClick={handleClose} 
                className="w-11 h-11 flex items-center justify-center hover:bg-muted rounded-full transition-all group active:scale-95"
              >
                <X className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-6 sm:px-8 py-8 pb-28 space-y-10 custom-scrollbar">
            {/* Visual Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-primary rounded-full" />
                <h3 className="text-sm font-black text-foreground uppercase tracking-[0.2em]">Visual & Frame</h3>
              </div>
              
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="relative group shrink-0">
                  <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-[2.5rem] bg-muted/20 border-2 border-dashed border-border/60 overflow-hidden flex items-center justify-center transition-all group-hover:border-primary/40 group-hover:shadow-2xl group-hover:shadow-primary/5">
                    {uploadingFoto ? (
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    ) : fotoPreview ? (
                      <div className="relative w-full h-full">
                        <img 
                          src={fotoPreview} 
                          alt="Preview" 
                          className="object-cover w-full h-full" 
                          style={getPhotoImageStyle(photoFrame)} 
                        />
                      </div>
                    ) : (
                      <Upload className="w-8 h-8 text-muted-foreground/30" />
                    )}
                    
                    {!isReadOnly && (
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white text-xs font-bold flex items-center gap-2">
                          <Upload className="w-4 h-4" /> Ganti Foto
                        </div>
                        <input type="file" accept="image/*" onChange={handleFoto} className="sr-only" disabled={uploadingFoto} />
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-6 w-full translate-y-2">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + " !mb-0"}>Posisi Horizontal</label>
                        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(photoFrame.x)}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={1} disabled={isReadOnly} className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed" value={Math.round(photoFrame.x)} onChange={(e) => updateFrame({ x: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + " !mb-0"}>Posisi Vertikal</label>
                        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(photoFrame.y)}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={1} disabled={isReadOnly} className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed" value={Math.round(photoFrame.y)} onChange={(e) => updateFrame({ y: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + " !mb-0"}>Skala Zoom</label>
                        <span className="text-[10px] font-mono text-muted-foreground">{photoFrame.zoom.toFixed(2)}x</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" disabled={isReadOnly} onClick={() => updateFrame({ zoom: photoFrame.zoom - 0.1 })} className="w-10 h-10 rounded-xl border border-border/40 bg-background hover:bg-muted text-lg font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">-</button>
                        <input type="range" min={1} max={3} step={0.05} disabled={isReadOnly} className="flex-1 accent-primary disabled:opacity-40 disabled:cursor-not-allowed" value={photoFrame.zoom} onChange={(e) => updateFrame({ zoom: Number(e.target.value) })} />
                        <button type="button" disabled={isReadOnly} onClick={() => updateFrame({ zoom: photoFrame.zoom + 0.1 })} className="w-10 h-10 rounded-xl border border-border/40 bg-background hover:bg-muted text-lg font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">+</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Fields Grouped */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-6 xl:items-start">
              {/* Left column: Identitas, Data Sensitif, Catatan */}
              <div className="flex flex-col gap-5 self-start">
                <SectionCard>
                  <SectionTitle>Identitas Utama</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><Field label="Nama Lengkap *"><input type="text" className={inputClass} value={form.nama || ''} onChange={e => set('nama', e.target.value)} autoFocus /></Field></div>
                    <div className="md:col-span-2"><Field label="Tim Terdaftar"><select className={inputClass} value={form.tim || ''} onChange={e => set('tim', e.target.value)}>{timList.map(t => <option key={t} value={t}>{t}</option>)}</select></Field></div>
                    <div className="md:col-span-2"><Field label="Level Jabatan"><select className={inputClass} value={form.jabatan || ''} onChange={e => set('jabatan', e.target.value)}>{Object.entries(labelJabatan).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
                    <div><Field label="NIK OJK"><input type="text" className={inputClass} value={form.nik_ojk || ''} onChange={e => set('nik_ojk', e.target.value)} /></Field></div>
                    <div><Field label="Bergabung di 157"><input type="date" className={inputClass} value={form.bergabung_date || ''} onChange={e => set('bergabung_date', e.target.value)} /></Field></div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Data Sensitif</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><Field label="No. KTP"><input type="text" maxLength={16} className={inputClass} value={form.no_ktp || ''} onChange={e => set('no_ktp', e.target.value)} /></Field></div>
                    <div><Field label="No. NPWP"><input type="text" className={inputClass} value={form.no_npwp || ''} onChange={e => set('no_npwp', e.target.value)} /></Field></div>
                    <div><Field label="Nomor Rekening"><input type="text" className={inputClass} value={form.nomor_rekening || ''} onChange={e => set('nomor_rekening', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Nama Bank"><input type="text" className={inputClass} value={form.nama_bank || ''} onChange={e => set('nama_bank', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Alamat Tinggal"><textarea rows={4} placeholder="Masukkan alamat lengkap..." className={inputClass + " resize-none leading-relaxed"} value={form.alamat_tinggal || ''} onChange={e => set('alamat_tinggal', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Status Tempat Tinggal"><select className={inputClass} value={form.status_tempat_tinggal || ''} onChange={e => set('status_tempat_tinggal', e.target.value as any)}><option value="">Pilih</option><option value="Milik Sendiri">Milik Sendiri</option><option value="Milik Orang Tua">Milik Orang Tua</option><option value="Kost/Sewa">Kost/Sewa</option><option value="Lainnya">Lainnya</option></select></Field></div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Catatan & Keterangan</SectionTitle>
                  <div className="grid grid-cols-1 gap-4">
                    <Field label="Catatan Tambahan"><textarea rows={3} placeholder="Prestasi, bakat, hobi, atau hal unik lainnya..." className={inputClass + " resize-none"} value={form.catatan_tambahan || ''} onChange={e => set('catatan_tambahan', e.target.value)} /></Field>
                    <Field label="Keterangan"><textarea rows={2} placeholder="Catatan umum lainnya..." className={inputClass + " resize-none"} value={form.keterangan || ''} onChange={e => set('keterangan', e.target.value)} /></Field>
                  </div>
                </SectionCard>
              </div>

              {/* Right column: Personal, Kontak, Latar Belakang */}
              <div className="flex flex-col gap-5 self-start">
                <SectionCard>
                  <SectionTitle>Informasi Personal</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Field label="Gender"><select className={inputClass} value={form.jenis_kelamin || ''} onChange={e => set('jenis_kelamin', e.target.value as any)}><option value="">Pilih</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></Field></div>
                    <div><Field label="Agama"><select className={inputClass} value={form.agama || ''} onChange={e => set('agama', e.target.value as any)}><option value="">Pilih</option>{['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu'].map(a => <option key={a} value={a}>{a}</option>)}</select></Field></div>
                    <div className="md:col-span-2"><Field label="Tanggal Lahir"><input type="date" className={inputClass} value={form.tgl_lahir || ''} onChange={e => set('tgl_lahir', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Status Perkawinan"><select className={inputClass} value={form.status_perkawinan || ''} onChange={e => set('status_perkawinan', e.target.value as any)}><option value="">Pilih</option><option value="Belum Menikah">Belum Menikah</option><option value="Menikah">Menikah</option><option value="Cerai">Cerai</option></select></Field></div>
                    <div className="md:col-span-2"><Field label="Pendidikan"><select className={inputClass} value={form.pendidikan || ''} onChange={e => set('pendidikan', e.target.value as any)}><option value="">Pilih</option>{['SMA','D3','S1','S2','S3'].map(p => <option key={p} value={p}>{p}</option>)}</select></Field></div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Kontak & Keamanan</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><Field label="Email Official"><input type="email" className={inputClass} value={form.email_ojk || ''} onChange={e => set('email_ojk', e.target.value)} /></Field></div>
                    <div><Field label="WhatsApp Aktif"><input type="text" className={inputClass} value={form.no_telepon || ''} onChange={e => set('no_telepon', e.target.value)} /></Field></div>
                    <div><Field label="No. Telepon Darurat"><input type="text" className={inputClass} value={form.no_telepon_darurat || ''} onChange={e => set('no_telepon_darurat', e.target.value)} /></Field></div>
                    <div><Field label="Nama Kontak Darurat"><input type="text" className={inputClass} value={form.nama_kontak_darurat || ''} onChange={e => set('nama_kontak_darurat', e.target.value)} /></Field></div>
                    <div><Field label="Hubungan Kontak Darurat"><select className={inputClass} value={form.hubungan_kontak_darurat || ''} onChange={e => set('hubungan_kontak_darurat', e.target.value as any)}><option value="">Pilih</option><option value="Orang Tua">Orang Tua</option><option value="Saudara">Saudara</option><option value="Pasangan">Pasangan</option><option value="Teman">Teman</option></select></Field></div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Latar Belakang</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><Field label="Lembaga Pendidikan"><input type="text" className={inputClass} value={form.nama_lembaga || ''} onChange={e => set('nama_lembaga', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Jurusan"><input type="text" className={inputClass} value={form.jurusan || ''} onChange={e => set('jurusan', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Previous Company"><input type="text" className={inputClass} value={form.previous_company || ''} onChange={e => set('previous_company', e.target.value)} /></Field></div>
                    <div className="md:col-span-2"><Field label="Pengalaman Contact Center"><select className={inputClass} value={form.pengalaman_cc || ''} onChange={e => set('pengalaman_cc', e.target.value as any)}><option value="">Pilih</option><option value="Pernah">Pernah</option><option value="Tidak Pernah">Tidak Pernah</option></select></Field></div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 p-6 sm:p-8 border-t border-border/40 bg-card/95 backdrop-blur flex flex-col sm:flex-row gap-4">
            {!isReadOnly && (
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex-1 h-14 bg-primary hover:opacity-90 disabled:opacity-30 text-primary-foreground rounded-2xl text-base font-black tracking-tight shadow-xl shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 order-1 sm:order-2"
              >
                {saving ? (
                  <><Loader2 className="w-6 h-6 animate-spin" /> Menyetorkan Data...</>
                ) : (
                  <><Check className="w-6 h-6" /> Simpan Perubahan</>
                )}
              </button>
            )}
            <button 
              onClick={onClose} 
              className="flex-1 h-14 bg-background hover:bg-muted text-foreground rounded-2xl text-base font-bold transition-all active:scale-[0.98] border border-border/40 order-2 sm:order-1"
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};


const selectableId = (p: ProfilerPeserta): string | null => (typeof p.id === 'string' && p.id.length > 0 ? p.id : null);

export default function ProfilerTable() {
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
        <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="relative group">
            <Inbox className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Cari nama, NIP, atau email..."
              className="w-full pl-11 pr-12 py-2.5 bg-background border border-border/40 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                title="Reset semua filter"
              >
                <FilterX className="w-3 h-3" /> Reset
              </button>
            )}
            {!hasActiveFilters && searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {!sortMode && allTims.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {allTims.map(tim => (
                <button key={tim} onClick={() => setFilterTim(tim)}
                  className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    (tim === 'all' ? filterTim === 'all' : filterTim.toLowerCase() === tim.toLowerCase())
                      ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/10'
                      : 'bg-background text-muted-foreground hover:text-foreground border-border/40 hover:border-primary/30'
                  }`}>
                  {tim === 'all' ? 'Semua Tim' : tim}
                </button>
              ))}
            </div>
          )}
        </div>

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
        {displayList.length === 0 ? (
          <div className="bg-card rounded-[2rem] p-4 sm:p-8 border border-border/40 shadow-sm">
            {hasActiveFilters ? (
              <QaStatePanel
                type="empty"
                title="Data sesuai filter belum ditemukan"
                description="Tidak ada peserta yang cocok dengan filter atau kata kunci saat ini. Sesuaikan filter untuk melanjutkan."
                action={
                  <button
                    onClick={resetFilters}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-background hover:bg-muted border border-border/40 text-foreground rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FilterX className="w-4 h-4" /> Reset Semua Filter
                  </button>
                }
              />
            ) : (
              <QaStatePanel
                type="empty"
                title="Folder ini belum memiliki peserta"
                description="Tambahkan peserta pertama untuk mulai menyusun profil batch."
                action={
                  !isReadOnly && (
                    <button
                      onClick={() => router.navigate({ to: `/profiler/add`, search: { batch: batchName } })}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-bold shadow-md shadow-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="w-4 h-4" /> Tambah Peserta Pertama
                    </button>
                  )
                }
              />
            )}
          </div>
        ) : (
          <div className="bg-card rounded-[2rem] overflow-hidden divide-y divide-border/40 border border-border/40 shadow-sm">
            {displayList.map((p, i) => {
              const rowId = selectableId(p);
              const isSelected = rowId ? selectedIds.has(rowId) : false;
              const isDragging = sortMode && dragIndex === i;

              return (
                <div
                  key={rowId || p.id}
                  draggable={sortMode}
                  onDragStart={sortMode ? e => handleDragStart(e, i) : undefined}
                  onDragOver={sortMode ? e => handleDragOver(e, i) : undefined}
                  onDragLeave={sortMode ? handleDragLeave : undefined}
                  onDragEnd={sortMode ? handleDragEnd : undefined}
                  className={`group relative flex items-center gap-4 transition-colors ${
                    sortMode 
                      ? isDragging 
                        ? 'opacity-40 bg-primary/5 cursor-grabbing scale-[0.98]' 
                        : 'cursor-grab hover:bg-muted/30 select-none'
                      : isSelected && selectMode
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/30'
                  } ${density === 'compact' ? 'px-3 py-2.5 sm:px-4 sm:py-3' : 'px-4 py-3.5 sm:px-6 sm:py-5'}`}
                >
                  {sortMode ? (
                    <div className="text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0">
                      <GripVertical className="w-5 h-5" />
                    </div>
                  ) : selectMode ? (
                    <button
                      onClick={() => rowId && toggleSelect(rowId)}
                      disabled={!rowId}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected ? 'bg-primary border-primary shadow-md shadow-primary/20' : 'border-border/60 hover:border-primary/40'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                    </button>
                  ) : (
                    <span className="text-[10px] font-black text-muted-foreground/30 w-5 text-right flex-shrink-0 font-mono tabular-nums group-hover:text-primary/40 transition-colors">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                  )}

                  <div className="relative shrink-0">
                    <div 
                      onClick={() => {
                        if (sortMode) return;
                        if (selectMode && rowId) { toggleSelect(rowId); return; }
                        setSelectedPeserta(p);
                      }}
                      className={`rounded-[1.25rem] border border-border/40 overflow-hidden bg-muted/20 transition-colors group-hover:border-primary/40 cursor-pointer ${
                        density === 'compact' ? 'w-10 h-10 sm:w-11 sm:h-11' : 'w-12 h-12 sm:w-14 sm:h-14'
                      }`}
                    >
                      {p.foto_url ? (
                        <img 
                          src={p.foto_url} 
                          alt={p.nama} 
                          className="object-cover w-full h-full" 
                          style={getPhotoImageStyle(getPhotoFrame(p.id, p.photo_frame))} 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-lg font-black text-muted-foreground/40">
                            {p.nama?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div 
                    onClick={() => {
                      if (sortMode) return;
                      if (selectMode && rowId) { toggleSelect(rowId); return; }
                      setSelectedPeserta(p);
                    }}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-bold text-foreground truncate group-hover:text-primary transition-colors leading-none tracking-tight ${
                        density === 'compact' ? 'text-sm' : 'text-base'
                      }`}>
                        {p.nama}
                      </h3>
                      {p.jabatan && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                          {labelJabatan[p.jabatan] || p.jabatan}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 min-w-0">
                        <div className="w-1 h-1 rounded-full bg-border shrink-0" />
                        <span className="truncate max-w-[140px]">{p.tim || 'Tanpa Tim'}</span>
                      </span>
                      {p.nik_ojk && (
                        <span className="text-[11px] text-muted-foreground/60 font-mono tracking-tighter truncate max-w-[120px]">
                          #{p.nik_ojk}
                        </span>
                      )}
                    </div>
                  </div>

                  {!sortMode && !selectMode && (
                    <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPeserta(p);
                        }}
                        className="p-2.5 bg-card hover:bg-primary/5 text-muted-foreground hover:text-primary rounded-xl transition-all border border-transparent hover:border-primary/20"
                        title="Edit Data"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.navigate({ to: '/sidak/agents/$id', params: { id: p.id } });
                        }}
                        className="p-2.5 bg-card hover:bg-module-sidak/5 text-muted-foreground hover:text-module-sidak rounded-xl transition-all border border-transparent hover:border-module-sidak/20"
                        title="Lihat Analisis QA"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {!sortMode && !selectMode && (
                    <div className="sm:hidden text-muted-foreground/30">
                      <ChevronDown className="-rotate-90 w-5 h-5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
        <EditModal peserta={selectedPeserta} timList={initialTimList}
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
