import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Upload, Loader2, Check, User, Briefcase, Lock, FileText } from 'lucide-react';
import type { ProfilerPeserta } from '@trainers/types';
import { labelJabatan } from '@trainers/types';
import { profilerApi } from '../../../../lib/profilerService';
import { notify } from '../../../../lib/toast';
import {
  DEFAULT_PHOTO_FRAME,
  getPhotoFrame,
  getPhotoImageStyle,
  normalizePhotoFrame,
  setPhotoFrame,
  markPhotoFrameAsSaved,
  type PhotoFrame,
} from '../../../../lib/photo-frame';

const inputClass =
  "w-full min-w-0 min-h-11 px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm leading-5 text-foreground placeholder-foreground/20 transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 select-none";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0 flex flex-col gap-1.5">
    <label className={labelClass}>{label}</label>
    {children}
  </div>
);

interface EditPesertaModalProps {
  peserta: ProfilerPeserta;
  timList: string[];
  onClose: () => void;
  onSaved: (updated: ProfilerPeserta) => void;
  onDeleted: (id: string) => void;
  onFrameUpdated: (id: string, frame: PhotoFrame) => void;
  onPhotoUpdated: (id: string, fotoUrl: string) => void;
  isReadOnly?: boolean;
}

export const EditPesertaModal: React.FC<EditPesertaModalProps> = ({
  peserta,
  timList,
  onClose,
  onSaved,
  onDeleted,
  onFrameUpdated,
  onPhotoUpdated,
  isReadOnly,
}) => {
  const [form, setForm] = useState<ProfilerPeserta>({ ...peserta });
  const [saving, setSaving] = useState(false);
  const [fotoPreview, setFotoPreview] = useState<string>(peserta.foto_url || '');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [photoFrame, setPhotoFrameState] = useState<PhotoFrame>(DEFAULT_PHOTO_FRAME);
  const [activeTab, setActiveTab] = useState<'profil' | 'kontak' | 'personal' | 'catatan'>('profil');
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

  const set = <K extends keyof ProfilerPeserta>(key: K, value: ProfilerPeserta[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateFrame = (next: Partial<PhotoFrame>) => {
    if (isReadOnly || !form.id) return;
    const normalized = normalizePhotoFrame({ ...photoFrame, ...next });
    setPhotoFrameState(normalized);
    setPhotoFrame(form.id, normalized);
    setForm((prev) => ({ ...prev, photo_frame: normalized }));
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
      setForm((prev) => ({ ...prev, foto_url: url }));
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
    if (!form.nama?.trim()) {
      notify.error('Nama wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await flushPendingFrameSave();
      await profilerApi.updatePeserta(form.id!, form);
      onSaved(form);
      onClose();
      notify.success('Data peserta berhasil disimpan');
    } catch (err: any) {
      notify.error('Gagal simpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Hapus ${form.nama}?`)) return;
    await profilerApi.deletePeserta(form.id!);
    onDeleted(form.id!);
    onClose();
    notify.success('Peserta berhasil dihapus');
  };

  const tabs = [
    { id: 'profil' as const, label: 'Profil & Foto', icon: User },
    { id: 'kontak' as const, label: 'Kontak & Karir', icon: Briefcase },
    { id: 'personal' as const, label: 'Pribadi & Sensitif', icon: Lock },
    { id: 'catatan' as const, label: 'Catatan & Memo', icon: FileText },
  ];

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/40 backdrop-blur-md p-0 sm:p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 30 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card w-full sm:max-w-4xl sm:rounded-[2rem] rounded-t-[2rem] border border-border/40 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.25)] flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-border/40 shrink-0 bg-background/50 backdrop-blur-sm">
            <div>
              <h2 className="text-xl font-black text-foreground tracking-tighter">
                Profil Peserta
              </h2>
              <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.12em] mt-1">
                Data & Konfigurasi Visual
              </p>
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

          {/* Segmented Tab Controls */}
          <div className="px-6 sm:px-8 py-3.5 border-b border-border/40 bg-muted/10 shrink-0 overflow-x-auto custom-scrollbar">
            <div className="flex bg-muted/40 p-1 rounded-2xl gap-1.5 w-full min-w-[550px]">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer select-none focus:outline-none ${
                      isActive
                        ? "bg-background text-primary shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-border/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground/75"}`} />
                    <span>{t.label}</span>
                    {t.id === 'personal' && <span className="text-[10px] text-muted-foreground/60">🔒</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Container with Animating Tabs */}
          <div className="overflow-y-auto flex-1 px-6 sm:px-8 py-6 pb-28 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {activeTab === 'profil' && (
                  <div className="space-y-6">
                    {/* Visual Photo Editor Box */}
                    <div className="flex flex-col md:flex-row gap-6 p-5 rounded-[1.75rem] border border-border/30 bg-muted/5 shadow-sm items-center md:items-start">
                      <div className="relative group shrink-0">
                        <div className="relative w-40 h-40 rounded-[2rem] bg-muted/20 border-2 border-dashed border-border/60 overflow-hidden flex items-center justify-center transition-all group-hover:border-primary/40 group-hover:shadow-lg">
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
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleFoto}
                                className="sr-only"
                                disabled={uploadingFoto}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-4">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/30 pb-2">
                          Bingkai & Posisi Foto
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between mb-1.5 px-1">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Posisi X</label>
                              <span className="text-[9px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                                {Math.round(photoFrame.x)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              disabled={isReadOnly}
                              className="w-full accent-primary disabled:opacity-40"
                              value={Math.round(photoFrame.x)}
                              onChange={(e) => updateFrame({ x: Number(e.target.value) })}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1.5 px-1">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Posisi Y</label>
                              <span className="text-[9px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                                {Math.round(photoFrame.y)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              disabled={isReadOnly}
                              className="w-full accent-primary disabled:opacity-40"
                              value={Math.round(photoFrame.y)}
                              onChange={(e) => updateFrame({ y: Number(e.target.value) })}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5 px-1">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Skala Zoom</label>
                            <span className="text-[9px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                              {photoFrame.zoom.toFixed(2)}x
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => updateFrame({ zoom: photoFrame.zoom - 0.1 })}
                              className="w-9 h-9 rounded-xl border border-border/40 bg-background hover:bg-muted text-sm font-bold flex items-center justify-center disabled:opacity-40"
                            >
                              -
                            </button>
                            <input
                              type="range"
                              min={1}
                              max={3}
                              step={0.05}
                              disabled={isReadOnly}
                              className="flex-1 accent-primary disabled:opacity-40"
                              value={photoFrame.zoom}
                              onChange={(e) => updateFrame({ zoom: Number(e.target.value) })}
                            />
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => updateFrame({ zoom: photoFrame.zoom + 0.1 })}
                              className="w-9 h-9 rounded-xl border border-border/40 bg-background hover:bg-muted text-sm font-bold flex items-center justify-center disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Identitas Utama Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 rounded-[1.75rem] border border-border/20 bg-card">
                      <div className="md:col-span-2">
                        <Field label="Nama Lengkap *">
                          <input
                            type="text"
                            className={inputClass}
                            value={form.nama || ''}
                            onChange={(e) => set('nama', e.target.value)}
                            disabled={isReadOnly}
                            autoFocus
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Tim Terdaftar">
                          <select
                            className={inputClass}
                            value={form.tim || ''}
                            onChange={(e) => set('tim', e.target.value)}
                            disabled={isReadOnly}
                          >
                            {timList.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div>
                        <Field label="Level Jabatan">
                          <select
                            className={inputClass}
                            value={form.jabatan || ''}
                            onChange={(e) => set('jabatan', e.target.value)}
                            disabled={isReadOnly}
                          >
                            {Object.entries(labelJabatan).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div>
                        <Field label="NIK OJK">
                          <input
                            type="text"
                            className={inputClass}
                            value={form.nik_ojk || ''}
                            onChange={(e) => set('nik_ojk', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Bergabung di 157">
                          <input
                            type="date"
                            className={inputClass}
                            value={form.bergabung_date || ''}
                            onChange={(e) => set('bergabung_date', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'kontak' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 rounded-[1.75rem] border border-border/20 bg-card">
                    <div className="md:col-span-2">
                      <Field label="Email Official">
                        <input
                          type="email"
                          className={inputClass}
                          value={form.email_ojk || ''}
                          onChange={(e) => set('email_ojk', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="WhatsApp Aktif">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.no_telepon || ''}
                          onChange={(e) => set('no_telepon', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="No. Telepon Darurat">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.no_telepon_darurat || ''}
                          onChange={(e) => set('no_telepon_darurat', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Nama Kontak Darurat">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama_kontak_darurat || ''}
                          onChange={(e) => set('nama_kontak_darurat', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Hubungan Kontak Darurat">
                        <select
                          className={inputClass}
                          value={form.hubungan_kontak_darurat || ''}
                          onChange={(e) => set('hubungan_kontak_darurat', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          <option value="Orang Tua">Orang Tua</option>
                          <option value="Saudara">Saudara</option>
                          <option value="Pasangan">Pasangan</option>
                          <option value="Teman">Teman</option>
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2 border-t border-border/30 my-2 pt-4">
                      <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Pendidikan & Karir</h4>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Lembaga Pendidikan">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama_lembaga || ''}
                          onChange={(e) => set('nama_lembaga', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Jurusan">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.jurusan || ''}
                          onChange={(e) => set('jurusan', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Perusahaan Sebelumnya">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.previous_company || ''}
                          onChange={(e) => set('previous_company', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Pengalaman Contact Center">
                        <select
                          className={inputClass}
                          value={form.pengalaman_cc || ''}
                          onChange={(e) => set('pengalaman_cc', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          <option value="Pernah">Pernah</option>
                          <option value="Tidak Pernah">Tidak Pernah</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                )}

                {activeTab === 'personal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-6 rounded-[1.75rem] border border-border/20 bg-card">
                    <div>
                      <Field label="Gender">
                        <select
                          className={inputClass}
                          value={form.jenis_kelamin || ''}
                          onChange={(e) => set('jenis_kelamin', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          <option value="Laki-laki">Laki-laki</option>
                          <option value="Perempuan">Perempuan</option>
                        </select>
                      </Field>
                    </div>
                    <div>
                      <Field label="Agama">
                        <select
                          className={inputClass}
                          value={form.agama || ''}
                          onChange={(e) => set('agama', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'].map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div>
                      <Field label="Tanggal Lahir">
                        <input
                          type="date"
                          className={inputClass}
                          value={form.tgl_lahir || ''}
                          onChange={(e) => set('tgl_lahir', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Status Perkawinan">
                        <select
                          className={inputClass}
                          value={form.status_perkawinan || ''}
                          onChange={(e) => set('status_perkawinan', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          <option value="Belum Menikah">Belum Menikah</option>
                          <option value="Menikah">Menikah</option>
                          <option value="Cerai">Cerai</option>
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Pendidikan">
                        <select
                          className={inputClass}
                          value={form.pendidikan || ''}
                          onChange={(e) => set('pendidikan', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          {['SMA', 'D3', 'S1', 'S2', 'S3'].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2 border-t border-border/30 my-2 pt-4 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Informasi Sensitif (Terlindungi)</h4>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="No. KTP">
                        <input
                          type="text"
                          maxLength={16}
                          className={inputClass}
                          value={form.no_ktp || ''}
                          onChange={(e) => set('no_ktp', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="No. NPWP">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.no_npwp || ''}
                          onChange={(e) => set('no_npwp', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Nomor Rekening">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nomor_rekening || ''}
                          onChange={(e) => set('nomor_rekening', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Nama Bank">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama_bank || ''}
                          onChange={(e) => set('nama_bank', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Status Tempat Tinggal">
                        <select
                          className={inputClass}
                          value={form.status_tempat_tinggal || ''}
                          onChange={(e) => set('status_tempat_tinggal', e.target.value as any)}
                          disabled={isReadOnly}
                        >
                          <option value="">Pilih</option>
                          <option value="Milik Sendiri">Milik Sendiri</option>
                          <option value="Milik Orang Tua">Milik Orang Tua</option>
                          <option value="Kost/Sewa">Kost/Sewa</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Alamat Tinggal">
                        <textarea
                          rows={3}
                          placeholder="Masukkan alamat lengkap..."
                          className={inputClass + ' resize-none leading-relaxed'}
                          value={form.alamat_tinggal || ''}
                          onChange={(e) => set('alamat_tinggal', e.target.value)}
                          disabled={isReadOnly}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {activeTab === 'catatan' && (
                  <div className="grid grid-cols-1 gap-5 p-6 rounded-[1.75rem] border border-border/20 bg-card">
                    <Field label="Catatan Tambahan">
                      <textarea
                        rows={4}
                        placeholder="Prestasi, bakat, hobi, atau hal unik lainnya..."
                        className={inputClass + ' resize-none'}
                        value={form.catatan_tambahan || ''}
                        onChange={(e) => set('catatan_tambahan', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </Field>
                    <Field label="Keterangan Admin">
                      <textarea
                        rows={3}
                        placeholder="Catatan umum atau administratif lainnya..."
                        className={inputClass + ' resize-none'}
                        value={form.keterangan || ''}
                        onChange={(e) => set('keterangan', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </Field>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 p-6 sm:p-8 border-t border-border/40 bg-card/95 backdrop-blur flex flex-col sm:flex-row gap-4">
            {!isReadOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-14 bg-primary hover:opacity-90 disabled:opacity-30 text-primary-foreground rounded-2xl text-base font-black tracking-tight shadow-xl shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 order-1 sm:order-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" /> Menyetorkan Data...
                  </>
                ) : (
                  <>
                    <Check className="w-6 h-6" /> Simpan Perubahan
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 h-14 bg-background hover:bg-muted text-foreground rounded-2xl text-base font-bold transition-all active:scale-[0.98] border border-border/40 order-2 sm:order-1 cursor-pointer"
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

