import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  FileText,
  Lock,
  Upload,
  User,
  Briefcase,
  Loader2,
  Trash2,
} from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { profilerApi } from "../../../../lib/profilerService";
import { notify } from "../../../../lib/toast";
import {
  DEFAULT_PHOTO_FRAME,
  getPhotoFrame,
  getPhotoImageStyle,
  normalizePhotoFrame,
  setPhotoFrame,
  markPhotoFrameAsSaved,
  type PhotoFrame,
} from "../../../../lib/photo-frame";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Badge } from "../../../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../../components/ui/tabs";

const fieldClass = "grid min-w-0 gap-2";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={fieldClass}>
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  allowEmpty = true,
}: {
  id: string;
  label: string;
  value?: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value || null}
        onValueChange={(nextValue) => {
          if (nextValue === "__empty__") onChange("");
          else if (nextValue) onChange(nextValue);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="min-h-11 w-full bg-background">
          <SelectValue placeholder="Pilih" />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {allowEmpty ? (
              <SelectItem value="__empty__">Pilih</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

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
  const [fotoPreview, setFotoPreview] = useState(peserta.foto_url || "");
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [photoFrame, setPhotoFrameState] =
    useState<PhotoFrame>(DEFAULT_PHOTO_FRAME);
  const [activeTab, setActiveTab] = useState<
    "profil" | "kontak" | "personal" | "catatan"
  >("profil");
  const frameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFrameRef = useRef<PhotoFrame | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

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
      } catch (error) {
        console.error("Gagal flush frame foto ke server", error);
      }
    }
  };

  useEffect(
    () => () => {
      if (frameSaveTimerRef.current) clearTimeout(frameSaveTimerRef.current);
    },
    [],
  );

  const set = <K extends keyof ProfilerPeserta>(
    key: K,
    value: ProfilerPeserta[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const updateFrame = (next: Partial<PhotoFrame>) => {
    if (isReadOnly || !form.id) return;
    const normalized = normalizePhotoFrame({ ...photoFrame, ...next });
    setPhotoFrameState(normalized);
    setPhotoFrame(form.id, normalized);
    setForm((previous) => ({ ...previous, photo_frame: normalized }));
    onFrameUpdated(form.id, normalized);
    pendingFrameRef.current = normalized;
    if (frameSaveTimerRef.current) clearTimeout(frameSaveTimerRef.current);
    frameSaveTimerRef.current = setTimeout(async () => {
      if (!pendingFrameRef.current || !form.id) return;
      const frameToSave = pendingFrameRef.current;
      pendingFrameRef.current = null;
      try {
        await profilerApi.updatePeserta(form.id, { photo_frame: frameToSave });
        markPhotoFrameAsSaved(form.id, frameToSave);
      } catch (error) {
        console.error("Gagal sinkronisasi frame foto ke server", error);
      }
    }, 800);
  };

  const handleClose = async () => {
    await flushPendingFrameSave();
    onClose();
  };

  const handleFoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !form.id) return;
    const previousPreview = fotoPreview;
    const localPreview = URL.createObjectURL(file);
    setFotoPreview(localPreview);
    setUploadingFoto(true);
    try {
      const url = await profilerApi.uploadFoto(file, form.id);
      await profilerApi.updatePeserta(form.id, { foto_url: url });
      setFotoPreview(url);
      setForm((previous) => ({ ...previous, foto_url: url }));
      onPhotoUpdated(form.id, url);
    } catch (error: any) {
      setFotoPreview(previousPreview);
      notify.error("Gagal upload foto: " + error.message);
    } finally {
      URL.revokeObjectURL(localPreview);
      event.target.value = "";
      setUploadingFoto(false);
    }
  };

  const handleSave = async () => {
    if (!form.nama?.trim()) {
      notify.error("Nama wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await flushPendingFrameSave();
      await profilerApi.updatePeserta(form.id!, form);
      onSaved(form);
      onClose();
      notify.success("Data peserta berhasil disimpan");
    } catch (error: any) {
      notify.error("Gagal simpan: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Hapus ${form.nama}?`)) return;
    await profilerApi.deletePeserta(form.id!);
    onDeleted(form.id!);
    onClose();
    notify.success("Peserta berhasil dihapus");
  };

  const tabs = [
    { id: "profil" as const, label: "Profil & foto", icon: User },
    { id: "kontak" as const, label: "Kontak & karir", icon: Briefcase },
    { id: "personal" as const, label: "Pribadi & sensitif", icon: Lock },
    { id: "catatan" as const, label: "Catatan & memo", icon: FileText },
  ];
  const jabatanOptions = Object.entries(labelJabatan).map(([value, label]) => ({
    value,
    label,
  }));
  const timOptions = timList.map((value) => ({ value, label: value }));

  return (
    <Dialog open onOpenChange={(open) => !open && void handleClose()}>
      <DialogContent
        initialFocus={() =>
          document.getElementById("edit-peserta-dialog-title")
        }
        className="!w-[calc(100vw-2rem)] !max-w-4xl flex h-[min(92dvh,52rem)] max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle
                id="edit-peserta-dialog-title"
                tabIndex={-1}
                className="text-lg"
              >
                Profil peserta
              </DialogTitle>
              <DialogDescription className="mt-1">
                Kelola identitas, kontak, data personal, dan catatan
                administrasi.
              </DialogDescription>
            </div>
            {!isReadOnly ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
              >
                <Trash2 data-icon="inline-start" aria-hidden="true" /> Hapus
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (
              value === "profil" ||
              value === "kontak" ||
              value === "personal" ||
              value === "catatan"
            )
              setActiveTab(value);
          }}
          className="min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 overflow-x-auto border-b border-border px-5 sm:px-7">
            <TabsList variant="line" className="min-w-max">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="min-h-11 gap-2 px-3 text-xs sm:px-4"
                  >
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div
            role="region"
            aria-label="Konten profil peserta"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6"
          >
            <TabsContent value="profil" className="mt-0 grid gap-6">
              <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-[10rem_1fr] sm:p-5">
                <div className="grid place-items-center gap-3">
                  <div className="size-36 overflow-hidden rounded-lg border border-border bg-muted sm:size-40">
                    {uploadingFoto ? (
                      <Loader2
                        className="mx-auto mt-14 size-7 animate-spin text-primary"
                        aria-label="Mengunggah foto"
                      />
                    ) : fotoPreview ? (
                      <img
                        src={fotoPreview}
                        alt="Preview foto peserta"
                        className="h-full w-full object-cover"
                        style={getPhotoImageStyle(photoFrame)}
                      />
                    ) : (
                      <Upload
                        className="mx-auto mt-14 size-7 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {!isReadOnly ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="min-h-11"
                        onClick={() => fotoInputRef.current?.click()}
                        disabled={uploadingFoto}
                      >
                        <Upload data-icon="inline-start" aria-hidden="true" />{" "}
                        Ganti foto
                      </Button>
                      <input
                        ref={fotoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFoto}
                        className="sr-only"
                        disabled={uploadingFoto}
                      />
                    </>
                  ) : null}
                </div>
                <div className="grid content-start gap-5">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Bingkai & posisi foto
                    </p>
                    <Badge variant="secondary">
                      {photoFrame.zoom.toFixed(2)}x
                    </Badge>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className={fieldClass}>
                      <Label
                        htmlFor="photo-x"
                        className="text-xs text-muted-foreground"
                      >
                        Posisi X{" "}
                        <span className="font-mono">
                          {Math.round(photoFrame.x)}%
                        </span>
                      </Label>
                      <Input
                        id="photo-x"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(photoFrame.x)}
                        onChange={(event) =>
                          updateFrame({ x: Number(event.target.value) })
                        }
                        disabled={isReadOnly}
                        className="accent-primary"
                      />
                    </div>
                    <div className={fieldClass}>
                      <Label
                        htmlFor="photo-y"
                        className="text-xs text-muted-foreground"
                      >
                        Posisi Y{" "}
                        <span className="font-mono">
                          {Math.round(photoFrame.y)}%
                        </span>
                      </Label>
                      <Input
                        id="photo-y"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(photoFrame.y)}
                        onChange={(event) =>
                          updateFrame({ y: Number(event.target.value) })
                        }
                        disabled={isReadOnly}
                        className="accent-primary"
                      />
                    </div>
                  </div>
                  <div className={fieldClass}>
                    <Label
                      htmlFor="photo-zoom"
                      className="text-xs text-muted-foreground"
                    >
                      Skala zoom
                    </Label>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="size-8"
                        disabled={isReadOnly}
                        onClick={() =>
                          updateFrame({ zoom: photoFrame.zoom - 0.1 })
                        }
                        aria-label="Kurangi zoom"
                      >
                        −
                      </Button>
                      <Input
                        id="photo-zoom"
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={photoFrame.zoom}
                        onChange={(event) =>
                          updateFrame({ zoom: Number(event.target.value) })
                        }
                        disabled={isReadOnly}
                        className="accent-primary"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="size-8"
                        disabled={isReadOnly}
                        onClick={() =>
                          updateFrame({ zoom: photoFrame.zoom + 0.1 })
                        }
                        aria-label="Tambah zoom"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5">
                <div className="sm:col-span-2">
                  <Field label="Nama lengkap *" htmlFor="edit-nama">
                    <Input
                      id="edit-nama"
                      value={form.nama || ""}
                      onChange={(event) => set("nama", event.target.value)}
                      disabled={isReadOnly}
                    />
                  </Field>
                </div>
                <SelectField
                  id="edit-tim"
                  label="Tim terdaftar"
                  value={form.tim}
                  options={timOptions}
                  onChange={(value) => set("tim", value)}
                  disabled={isReadOnly}
                  allowEmpty={false}
                />
                <SelectField
                  id="edit-jabatan"
                  label="Level jabatan"
                  value={form.jabatan}
                  options={jabatanOptions}
                  onChange={(value) =>
                    set("jabatan", value as ProfilerPeserta["jabatan"])
                  }
                  disabled={isReadOnly}
                  allowEmpty={false}
                />
                <Field label="NIK OJK" htmlFor="edit-nik">
                  <Input
                    id="edit-nik"
                    value={form.nik_ojk || ""}
                    onChange={(event) => set("nik_ojk", event.target.value)}
                    disabled={isReadOnly}
                  />
                </Field>
                <Field label="Bergabung di 157" htmlFor="edit-bergabung">
                  <Input
                    id="edit-bergabung"
                    type="date"
                    value={form.bergabung_date || ""}
                    onChange={(event) =>
                      set("bergabung_date", event.target.value)
                    }
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent
              value="kontak"
              className="mt-0 grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
            >
              <div className="sm:col-span-2">
                <Field label="Email official" htmlFor="edit-email">
                  <Input
                    id="edit-email"
                    type="email"
                    value={form.email_ojk || ""}
                    onChange={(event) => set("email_ojk", event.target.value)}
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
              <Field label="WhatsApp aktif" htmlFor="edit-phone">
                <Input
                  id="edit-phone"
                  value={form.no_telepon || ""}
                  onChange={(event) => set("no_telepon", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="No. telepon darurat" htmlFor="edit-emergency-phone">
                <Input
                  id="edit-emergency-phone"
                  value={form.no_telepon_darurat || ""}
                  onChange={(event) =>
                    set("no_telepon_darurat", event.target.value)
                  }
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="Nama kontak darurat" htmlFor="edit-emergency-name">
                <Input
                  id="edit-emergency-name"
                  value={form.nama_kontak_darurat || ""}
                  onChange={(event) =>
                    set("nama_kontak_darurat", event.target.value)
                  }
                  disabled={isReadOnly}
                />
              </Field>
              <SelectField
                id="edit-emergency-relation"
                label="Hubungan kontak darurat"
                value={form.hubungan_kontak_darurat}
                options={["Orang Tua", "Saudara", "Pasangan", "Teman"].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(value) => set("hubungan_kontak_darurat", value)}
                disabled={isReadOnly}
              />
              <div className="sm:col-span-2 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Pendidikan & karir
                </p>
              </div>
              <div className="sm:col-span-2">
                <Field label="Lembaga pendidikan" htmlFor="edit-institution">
                  <Input
                    id="edit-institution"
                    value={form.nama_lembaga || ""}
                    onChange={(event) =>
                      set("nama_lembaga", event.target.value)
                    }
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
              <Field label="Jurusan" htmlFor="edit-major">
                <Input
                  id="edit-major"
                  value={form.jurusan || ""}
                  onChange={(event) => set("jurusan", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="Perusahaan sebelumnya" htmlFor="edit-company">
                <Input
                  id="edit-company"
                  value={form.previous_company || ""}
                  onChange={(event) =>
                    set("previous_company", event.target.value)
                  }
                  disabled={isReadOnly}
                />
              </Field>
              <div className="sm:col-span-2">
                <SelectField
                  id="edit-cc"
                  label="Pengalaman contact center"
                  value={form.pengalaman_cc}
                  options={["Pernah", "Tidak Pernah"].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => set("pengalaman_cc", value)}
                  disabled={isReadOnly}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="personal"
              className="mt-0 grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
            >
              <SelectField
                id="edit-gender"
                label="Gender"
                value={form.jenis_kelamin}
                options={["Laki-laki", "Perempuan"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("jenis_kelamin", value)}
                disabled={isReadOnly}
              />
              <SelectField
                id="edit-religion"
                label="Agama"
                value={form.agama}
                options={[
                  "Islam",
                  "Kristen",
                  "Katolik",
                  "Hindu",
                  "Buddha",
                  "Konghucu",
                ].map((value) => ({ value, label: value }))}
                onChange={(value) => set("agama", value)}
                disabled={isReadOnly}
              />
              <Field label="Tanggal lahir" htmlFor="edit-birth">
                <Input
                  id="edit-birth"
                  type="date"
                  value={form.tgl_lahir || ""}
                  onChange={(event) => set("tgl_lahir", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
              <SelectField
                id="edit-marital"
                label="Status perkawinan"
                value={form.status_perkawinan}
                options={["Belum Menikah", "Menikah", "Cerai"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("status_perkawinan", value)}
                disabled={isReadOnly}
              />
              <div className="sm:col-span-2">
                <SelectField
                  id="edit-education"
                  label="Pendidikan"
                  value={form.pendidikan}
                  options={["SMA", "D3", "S1", "S2", "S3"].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => set("pendidikan", value)}
                  disabled={isReadOnly}
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 border-t border-border pt-5">
                <Lock
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Informasi sensitif
                </p>
              </div>
              <div className="sm:col-span-2">
                <Field label="No. KTP" htmlFor="edit-ktp">
                  <Input
                    id="edit-ktp"
                    maxLength={16}
                    value={form.no_ktp || ""}
                    onChange={(event) => set("no_ktp", event.target.value)}
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
              <Field label="No. NPWP" htmlFor="edit-npwp">
                <Input
                  id="edit-npwp"
                  value={form.no_npwp || ""}
                  onChange={(event) => set("no_npwp", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="Nomor rekening" htmlFor="edit-account">
                <Input
                  id="edit-account"
                  value={form.nomor_rekening || ""}
                  onChange={(event) =>
                    set("nomor_rekening", event.target.value)
                  }
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="Nama bank" htmlFor="edit-bank">
                <Input
                  id="edit-bank"
                  value={form.nama_bank || ""}
                  onChange={(event) => set("nama_bank", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
              <SelectField
                id="edit-housing"
                label="Status tempat tinggal"
                value={form.status_tempat_tinggal}
                options={[
                  "Milik Sendiri",
                  "Milik Orang Tua",
                  "Kost/Sewa",
                  "Lainnya",
                ].map((value) => ({ value, label: value }))}
                onChange={(value) => set("status_tempat_tinggal", value)}
                disabled={isReadOnly}
              />
              <div className="sm:col-span-2">
                <Field label="Alamat tinggal" htmlFor="edit-address">
                  <Textarea
                    id="edit-address"
                    rows={3}
                    value={form.alamat_tinggal || ""}
                    onChange={(event) =>
                      set("alamat_tinggal", event.target.value)
                    }
                    disabled={isReadOnly}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent
              value="catatan"
              className="mt-0 grid gap-5 rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <Field label="Catatan tambahan" htmlFor="edit-notes">
                <Textarea
                  id="edit-notes"
                  rows={5}
                  placeholder="Prestasi, bakat, hobi, atau hal unik lainnya..."
                  value={form.catatan_tambahan || ""}
                  onChange={(event) =>
                    set("catatan_tambahan", event.target.value)
                  }
                  disabled={isReadOnly}
                />
              </Field>
              <Field label="Keterangan admin" htmlFor="edit-description">
                <Textarea
                  id="edit-description"
                  rows={4}
                  placeholder="Catatan umum atau administratif lainnya..."
                  value={form.keterangan || ""}
                  onChange={(event) => set("keterangan", event.target.value)}
                  disabled={isReadOnly}
                />
              </Field>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none p-4 sm:p-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={onClose}
          >
            Batal
          </Button>
          {!isReadOnly ? (
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {saving ? "Menyimpan..." : "Simpan perubahan"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
