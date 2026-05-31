import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Upload, Loader2, Check } from 'lucide-react';
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
  "w-full min-w-0 min-h-11 px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm leading-5 text-foreground placeholder-foreground/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 select-none";

// ── Helper components for EditPesertaModal ───────────────────────────
const SectionTitle = ({
  children,
  accent = true,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) => (
  <div className="flex items-center gap-3 mb-4">
    {accent && <div className="w-1 h-5 bg-primary/40 rounded-full" />}
    <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.12em]">
      {children}
    </h3>
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
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card w-full sm:max-w-3xl sm:rounded-[2.5rem] rounded-t-[2.5rem] border border-border/40 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] flex flex-col max-h-[92vh]"
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

          <div className="overflow-y-auto flex-1 px-6 sm:px-8 py-8 pb-28 space-y-10 custom-scrollbar">
            {/* Visual Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-primary rounded-full" />
                <h3 className="text-sm font-black text-foreground uppercase tracking-[0.2em]">
                  Visual & Frame
                </h3>
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

                <div className="flex-1 space-y-6 w-full translate-y-2">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + ' !mb-0'}>Posisi Horizontal</label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round(photoFrame.x)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={isReadOnly}
                        className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        value={Math.round(photoFrame.x)}
                        onChange={(e) => updateFrame({ x: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + ' !mb-0'}>Posisi Vertikal</label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Math.round(photoFrame.y)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={isReadOnly}
                        className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        value={Math.round(photoFrame.y)}
                        onChange={(e) => updateFrame({ y: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <label className={labelClass + ' !mb-0'}>Skala Zoom</label>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {photoFrame.zoom.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => updateFrame({ zoom: photoFrame.zoom - 0.1 })}
                          className="w-10 h-10 rounded-xl border border-border/40 bg-background hover:bg-muted text-lg font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={0.05}
                          disabled={isReadOnly}
                          className="flex-1 accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                          value={photoFrame.zoom}
                          onChange={(e) => updateFrame({ zoom: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => updateFrame({ zoom: photoFrame.zoom + 0.1 })}
                          className="w-10 h-10 rounded-xl border border-border/40 bg-background hover:bg-muted text-lg font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
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
                    <div className="md:col-span-2">
                      <Field label="Nama Lengkap *">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama || ''}
                          onChange={(e) => set('nama', e.target.value)}
                          autoFocus
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Tim Terdaftar">
                        <select
                          className={inputClass}
                          value={form.tim || ''}
                          onChange={(e) => set('tim', e.target.value)}
                        >
                          {timList.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Level Jabatan">
                        <select
                          className={inputClass}
                          value={form.jabatan || ''}
                          onChange={(e) => set('jabatan', e.target.value)}
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
                        />
                      </Field>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Data Sensitif</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Field label="No. KTP">
                        <input
                          type="text"
                          maxLength={16}
                          className={inputClass}
                          value={form.no_ktp || ''}
                          onChange={(e) => set('no_ktp', e.target.value)}
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
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Nama Bank">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama_bank || ''}
                          onChange={(e) => set('nama_bank', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Alamat Tinggal">
                        <textarea
                          rows={4}
                          placeholder="Masukkan alamat lengkap..."
                          className={inputClass + ' resize-none leading-relaxed'}
                          value={form.alamat_tinggal || ''}
                          onChange={(e) => set('alamat_tinggal', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Status Tempat Tinggal">
                        <select
                          className={inputClass}
                          value={form.status_tempat_tinggal || ''}
                          onChange={(e) => set('status_tempat_tinggal', e.target.value as any)}
                        >
                          <option value="">Pilih</option>
                          <option value="Milik Sendiri">Milik Sendiri</option>
                          <option value="Milik Orang Tua">Milik Orang Tua</option>
                          <option value="Kost/Sewa">Kost/Sewa</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Catatan & Keterangan</SectionTitle>
                  <div className="grid grid-cols-1 gap-4">
                    <Field label="Catatan Tambahan">
                      <textarea
                        rows={3}
                        placeholder="Prestasi, bakat, hobi, atau hal unik lainnya..."
                        className={inputClass + ' resize-none'}
                        value={form.catatan_tambahan || ''}
                        onChange={(e) => set('catatan_tambahan', e.target.value)}
                      />
                    </Field>
                    <Field label="Keterangan">
                      <textarea
                        rows={2}
                        placeholder="Catatan umum lainnya..."
                        className={inputClass + ' resize-none'}
                        value={form.keterangan || ''}
                        onChange={(e) => set('keterangan', e.target.value)}
                      />
                    </Field>
                  </div>
                </SectionCard>
              </div>

              {/* Right column: Personal, Kontak, Latar Belakang */}
              <div className="flex flex-col gap-5 self-start">
                <SectionCard>
                  <SectionTitle>Informasi Personal</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Field label="Gender">
                        <select
                          className={inputClass}
                          value={form.jenis_kelamin || ''}
                          onChange={(e) => set('jenis_kelamin', e.target.value as any)}
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
                        >
                          <option value="">Pilih</option>
                          {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'].map(
                            (a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            )
                          )}
                        </select>
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Tanggal Lahir">
                        <input
                          type="date"
                          className={inputClass}
                          value={form.tgl_lahir || ''}
                          onChange={(e) => set('tgl_lahir', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Status Perkawinan">
                        <select
                          className={inputClass}
                          value={form.status_perkawinan || ''}
                          onChange={(e) => set('status_perkawinan', e.target.value as any)}
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
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Kontak & Keamanan</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Field label="Email Official">
                        <input
                          type="email"
                          className={inputClass}
                          value={form.email_ojk || ''}
                          onChange={(e) => set('email_ojk', e.target.value)}
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
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="Hubungan Kontak Darurat">
                        <select
                          className={inputClass}
                          value={form.hubungan_kontak_darurat || ''}
                          onChange={(e) => set('hubungan_kontak_darurat', e.target.value as any)}
                        >
                          <option value="">Pilih</option>
                          <option value="Orang Tua">Orang Tua</option>
                          <option value="Saudara">Saudara</option>
                          <option value="Pasangan">Pasangan</option>
                          <option value="Teman">Teman</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>Latar Belakang</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Field label="Lembaga Pendidikan">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.nama_lembaga || ''}
                          onChange={(e) => set('nama_lembaga', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Jurusan">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.jurusan || ''}
                          onChange={(e) => set('jurusan', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Previous Company">
                        <input
                          type="text"
                          className={inputClass}
                          value={form.previous_company || ''}
                          onChange={(e) => set('previous_company', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Pengalaman Contact Center">
                        <select
                          className={inputClass}
                          value={form.pengalaman_cc || ''}
                          onChange={(e) => set('pengalaman_cc', e.target.value as any)}
                        >
                          <option value="">Pilih</option>
                          <option value="Pernah">Pernah</option>
                          <option value="Tidak Pernah">Tidak Pernah</option>
                        </select>
                      </Field>
                    </div>
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
