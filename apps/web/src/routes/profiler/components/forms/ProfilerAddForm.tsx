import React, { useState, useEffect, useRef } from "react";
import { Lock, Plus, Save, Upload } from "lucide-react";
import type {
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerYear,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { profilerApi } from "../../../../lib/profilerService";
import { supabase } from "../../../../lib/supabase";
import { notify } from "../../../../lib/toast";
import { ProfilerFolderSelect } from "../ProfilerFolderSelect";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";

const DEFAULT_TIMS = ["Telepon", "Chat", "Email"];

function Field({
  label,
  id,
  children,
  className = "",
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  id,
  value,
  options,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  id: string;
  value?: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} id={id}>
      <Select
        items={options}
        value={value || null}
        onValueChange={(nextValue) => {
          if (nextValue === "__empty__") onChange("");
          else if (nextValue) onChange(nextValue);
        }}
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-5">{children}</CardContent>
    </Card>
  );
}

interface ProfilerAddFormProps {
  /** Folder asal (`?batch=`); kosong berarti pengguna wajib memilih. */
  initialBatch: string;
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  onCancel: () => void;
  onSaved: (batchName: string, created: ProfilerPeserta) => void;
}

/** Form Tambah peserta di area utama workspace (`?view=tambah`). */
export default function ProfilerAddForm({
  initialBatch,
  years,
  folders,
  onCancel,
  onSaved,
}: ProfilerAddFormProps) {
  // Folder tujuan wajib dipilih; tanpa `?batch=` peserta tidak boleh jatuh
  // diam-diam ke folder tebakan.
  const [batchName, setBatchName] = useState(initialBatch);
  const [batchError, setBatchError] = useState(false);
  const [namaError, setNamaError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState("");
  const [timList, setTimList] = useState<string[]>(DEFAULT_TIMS);
  const [selectedTim, setSelectedTim] = useState("Telepon");
  const [showAddTim, setShowAddTim] = useState(false);
  const [newTimName, setNewTimName] = useState("");
  const [timLoading, setTimLoading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<ProfilerPeserta>>({
    tim: selectedTim,
    jabatan: "cca",
  });

  const set = (key: keyof ProfilerPeserta, value: any) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    profilerApi
      .getTeams()
      .then((teams) => {
        if (teams.length > 0) {
          const names = teams.map((team) => team.nama);
          setTimList(names);
          setSelectedTim(names[0]);
          set("tim", names[0]);
        }
      })
      .catch((error) => console.error("Gagal memuat tim", error));
  }, []);

  const handleSelectTim = (tim: string) => {
    setSelectedTim(tim);
    set("tim", tim);
  };
  const handleAddTim = async () => {
    const name = newTimName.trim();
    if (!name || timList.includes(name)) return;
    setTimLoading(true);
    try {
      await profilerApi.createTeam(name);
      setTimList((previous) => [...previous, name]);
      handleSelectTim(name);
      setNewTimName("");
      setShowAddTim(false);
    } catch (error: any) {
      notify.error("Gagal menambah tim", error.message);
    } finally {
      setTimLoading(false);
    }
  };
  const handleFoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };
  const handleSubmit = async () => {
    const missingBatch = !batchName;
    const missingNama = !form.nama?.trim();
    setBatchError(missingBatch);
    setNamaError(missingNama);
    if (missingBatch || missingNama) return;
    setLoading(true);
    try {
      const newId = crypto.randomUUID();
      const foto_url = fotoFile
        ? await profilerApi.uploadFoto(fotoFile, newId)
        : "";
      const { data: userData } = await supabase.auth.getUser();
      const created = await profilerApi.createPeserta({
        ...form,
        batch_name: batchName,
        id: newId,
        foto_url,
        trainer_id: userData?.user?.id || undefined,
      } as Partial<ProfilerPeserta>);
      notify.success(`${form.nama?.trim()} ditambahkan ke ${batchName}`);
      onSaved(batchName, created);
    } catch (error: any) {
      notify.error("Gagal menyimpan peserta", error.message);
    } finally {
      setLoading(false);
    }
  };

  const actions = (
    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-11"
        onClick={onCancel}
        disabled={loading}
      >
        Batal
      </Button>
      <Button
        type="button"
        size="lg"
        className="min-h-11"
        onClick={handleSubmit}
        disabled={loading}
      >
        <Save data-icon="inline-start" aria-hidden="true" />
        {loading ? "Menyimpan..." : "Simpan peserta"}
      </Button>
    </div>
  );
  const jabatanOptions = Object.entries(labelJabatan).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <section
      aria-labelledby="profiler-add-title"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {initialBatch || "KTP"}
          </p>
          <h1
            id="profiler-add-title"
            className="font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Tambah peserta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hanya kolom bertanda * yang wajib. Sisanya bisa dilengkapi nanti.
          </p>
        </div>
        {actions}
      </header>

      <div className="flex flex-col gap-5">
          <Section
            title="Identitas utama"
            description="Data wajib untuk mengenali peserta."
          >
            <div className="grid gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Folder tujuan *
              </Label>
              <ProfilerFolderSelect
                years={years}
                folders={folders}
                value={batchName}
                onChange={(value) => {
                  setBatchName(value);
                  setBatchError(false);
                }}
                label="Folder tujuan"
                hideLabel
              />
              {batchError ? (
                <p role="alert" className="text-sm text-destructive">
                  Pilih folder tujuan dulu.
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-[7rem_1fr]">
              <div className="grid place-items-center gap-2">
                <div className="grid size-24 place-items-center overflow-hidden rounded-lg border border-border bg-background sm:size-28">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt="Preview foto peserta"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Upload
                      className="size-6 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <div>
                  <p className="font-medium">Foto peserta</p>
                  <p className="text-sm text-muted-foreground">
                    JPG/PNG, maksimal 5MB. Foto akan dikompres otomatis.
                  </p>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-11"
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    <Upload data-icon="inline-start" aria-hidden="true" /> Pilih
                    foto
                  </Button>
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFoto}
                    className="sr-only"
                  />
                </div>
              </div>
            </div>
            <Field label="Nama lengkap *" id="add-nama">
              <Input
                id="add-nama"
                placeholder="Nama lengkap peserta"
                value={form.nama || ""}
                onChange={(event) => {
                  set("nama", event.target.value);
                  if (event.target.value.trim()) setNamaError(false);
                }}
                aria-invalid={namaError || undefined}
              />
              {namaError ? (
                <p role="alert" className="text-sm text-destructive">
                  Nama lengkap wajib diisi.
                </p>
              ) : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Tim *
                </Label>
                <div className="flex flex-wrap gap-2">
                  {timList.map((tim) => (
                    <Button
                      key={tim}
                      type="button"
                      variant={selectedTim === tim ? "default" : "outline"}
                      size="lg"
                      className="min-h-11"
                      aria-pressed={selectedTim === tim}
                      onClick={() => handleSelectTim(tim)}
                    >
                      {tim}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="min-h-11"
                    onClick={() => setShowAddTim((value) => !value)}
                    disabled={timLoading}
                  >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Tim baru
                  </Button>
                </div>
                {showAddTim ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={newTimName}
                      onChange={(event) => setNewTimName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleAddTim();
                        if (event.key === "Escape") setShowAddTim(false);
                      }}
                      placeholder="Nama tim baru"
                    />
                    <Button
                      type="button"
                      size="lg"
                      className="min-h-11"
                      onClick={() => void handleAddTim()}
                      disabled={timLoading}
                    >
                      {timLoading ? "..." : "Tambah"}
                    </Button>
                  </div>
                ) : null}
              </div>
              <SelectField
                label="Jabatan *"
                id="add-jabatan"
                value={form.jabatan}
                options={jabatanOptions}
                onChange={(value) => set("jabatan", value)}
                allowEmpty={false}
              />
            </div>
          </Section>

          <Section title="Data kerja">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NIK OJK" id="add-nik">
                <Input
                  id="add-nik"
                  value={form.nik_ojk || ""}
                  onChange={(event) => set("nik_ojk", event.target.value)}
                  placeholder="NIK OJK"
                />
              </Field>
              <Field label="Bergabung di 157" id="add-join">
                <Input
                  id="add-join"
                  type="date"
                  value={form.bergabung_date || ""}
                  onChange={(event) =>
                    set("bergabung_date", event.target.value)
                  }
                />
              </Field>
              <Field
                label="Alamat email OJK"
                id="add-email"
                className="sm:col-span-2"
              >
                <Input
                  id="add-email"
                  type="email"
                  value={form.email_ojk || ""}
                  onChange={(event) => set("email_ojk", event.target.value)}
                  placeholder="nama@ojk.go.id"
                />
              </Field>
              <Field label="No. telepon aktif" id="add-phone">
                <Input
                  id="add-phone"
                  value={form.no_telepon || ""}
                  onChange={(event) => set("no_telepon", event.target.value)}
                  placeholder="0812xxxxxxxx"
                />
              </Field>
              <Field label="No. telepon darurat" id="add-emergency-phone">
                <Input
                  id="add-emergency-phone"
                  value={form.no_telepon_darurat || ""}
                  onChange={(event) =>
                    set("no_telepon_darurat", event.target.value)
                  }
                  placeholder="0812xxxxxxxx"
                />
              </Field>
              <Field label="Nama kontak darurat" id="add-emergency-name">
                <Input
                  id="add-emergency-name"
                  value={form.nama_kontak_darurat || ""}
                  onChange={(event) =>
                    set("nama_kontak_darurat", event.target.value)
                  }
                />
              </Field>
              <SelectField
                label="Hubungan kontak darurat"
                id="add-emergency-relation"
                value={form.hubungan_kontak_darurat}
                options={["Orang Tua", "Saudara", "Pasangan", "Teman"].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(value) => set("hubungan_kontak_darurat", value)}
              />
            </div>
          </Section>

          <Section title="Data pribadi">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Jenis kelamin"
                id="add-gender"
                value={form.jenis_kelamin}
                options={["Laki-laki", "Perempuan"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("jenis_kelamin", value)}
              />
              <SelectField
                label="Agama"
                id="add-religion"
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
              />
              <Field label="Tanggal lahir" id="add-birth">
                <Input
                  id="add-birth"
                  type="date"
                  value={form.tgl_lahir || ""}
                  onChange={(event) => set("tgl_lahir", event.target.value)}
                />
              </Field>
              <SelectField
                label="Status perkawinan"
                id="add-marital"
                value={form.status_perkawinan}
                options={["Belum Menikah", "Menikah", "Cerai"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => set("status_perkawinan", value)}
              />
              <div className="sm:col-span-2">
                <SelectField
                  label="Pendidikan"
                  id="add-education"
                  value={form.pendidikan}
                  options={["SMA", "D3", "S1", "S2", "S3"].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => set("pendidikan", value)}
                />
              </div>
            </div>
          </Section>

          <Section
            title="Data sensitif"
            description="Data ini ikut tampil di profil, slide, dan file ekspor."
          >
            <Alert>
              <Lock aria-hidden="true" />
              <AlertDescription>
                Pastikan data sensitif hanya diisi sesuai kebutuhan administrasi
                dan akses yang berlaku.
              </AlertDescription>
            </Alert>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="No. KTP" id="add-ktp" className="sm:col-span-2">
                <Input
                  id="add-ktp"
                  maxLength={16}
                  value={form.no_ktp || ""}
                  onChange={(event) => set("no_ktp", event.target.value)}
                  placeholder="16 digit NIK"
                />
              </Field>
              <Field label="No. NPWP" id="add-npwp">
                <Input
                  id="add-npwp"
                  value={form.no_npwp || ""}
                  onChange={(event) => set("no_npwp", event.target.value)}
                />
              </Field>
              <Field label="Nomor rekening" id="add-account">
                <Input
                  id="add-account"
                  value={form.nomor_rekening || ""}
                  onChange={(event) =>
                    set("nomor_rekening", event.target.value)
                  }
                />
              </Field>
              <Field label="Nama bank" id="add-bank">
                <Input
                  id="add-bank"
                  value={form.nama_bank || ""}
                  onChange={(event) => set("nama_bank", event.target.value)}
                  placeholder="BCA, BRI, Mandiri"
                />
              </Field>
              <SelectField
                label="Status tempat tinggal"
                id="add-housing"
                value={form.status_tempat_tinggal}
                options={[
                  { value: "Milik Sendiri", label: "Rumah milik sendiri" },
                  { value: "Milik Orang Tua", label: "Rumah milik orang tua" },
                  { value: "Kost/Sewa", label: "Kost/Sewa" },
                  { value: "Lainnya", label: "Lainnya" },
                ]}
                onChange={(value) => set("status_tempat_tinggal", value)}
              />
              <Field
                label="Alamat tempat tinggal"
                id="add-address"
                className="sm:col-span-2"
              >
                <Textarea
                  id="add-address"
                  rows={3}
                  value={form.alamat_tinggal || ""}
                  onChange={(event) =>
                    set("alamat_tinggal", event.target.value)
                  }
                />
              </Field>
            </div>
          </Section>

          <Section title="Latar belakang">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama lembaga pendidikan" id="add-institution">
                <Input
                  id="add-institution"
                  value={form.nama_lembaga || ""}
                  onChange={(event) => set("nama_lembaga", event.target.value)}
                />
              </Field>
              <Field label="Jurusan" id="add-major">
                <Input
                  id="add-major"
                  value={form.jurusan || ""}
                  onChange={(event) => set("jurusan", event.target.value)}
                />
              </Field>
              <Field
                label="Previous company"
                id="add-company"
                className="sm:col-span-2"
              >
                <Input
                  id="add-company"
                  value={form.previous_company || ""}
                  onChange={(event) =>
                    set("previous_company", event.target.value)
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <SelectField
                  label="Pengalaman contact center"
                  id="add-cc"
                  value={form.pengalaman_cc}
                  options={["Pernah", "Tidak Pernah"].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => set("pengalaman_cc", value)}
                />
              </div>
            </div>
          </Section>

          <Section
            title="Catatan tambahan"
            description="Prestasi, bakat, hobi, atau hal unik lainnya."
          >
            <Textarea
              rows={4}
              placeholder="Tulis catatan tambahan..."
              value={form.catatan_tambahan || ""}
              onChange={(event) => set("catatan_tambahan", event.target.value)}
            />
          </Section>
          <Section title="Keterangan">
            <Textarea
              rows={3}
              placeholder="Catatan umum lainnya..."
              value={form.keterangan || ""}
              onChange={(event) => set("keterangan", event.target.value)}
            />
          </Section>
      </div>
      <div className="flex justify-end border-t border-border pt-5">
        {actions}
      </div>
    </section>
  );
}
