import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Save, Upload, Plus, X, UserPlus } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { profilerApi } from "../../lib/profilerService";
import { supabase } from "../../lib/supabase";
import { useQueryParams } from "../../hooks/useQueryParams";
import PageHeroHeader from "../../components/PageHeroHeader";

const DEFAULT_TIMS = ["Telepon", "Chat", "Email"];

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-border/40 bg-background text-sm text-foreground placeholder-foreground/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
const labelClass =
  "block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1";
const sectionClass =
  "bg-card border border-border/40 rounded-[2rem] p-8 space-y-6 shadow-sm";

export default function ProfilerAdd() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const batchName = batch || "Batch 1";

  const [loading, setLoading] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>("");

  const [timList, setTimList] = useState<string[]>(DEFAULT_TIMS);
  const [selectedTim, setSelectedTim] = useState<string>("Telepon");
  const [showAddTim, setShowAddTim] = useState(false);
  const [newTimName, setNewTimName] = useState("");
  const [timLoading, setTimLoading] = useState(false);

  const [form, setForm] = useState<Partial<ProfilerPeserta>>({
    batch_name: batchName,
    tim: selectedTim,
    jabatan: "cca",
  });

  const set = (key: keyof ProfilerPeserta, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    profilerApi
      .getTeams()
      .then((teams) => {
        if (teams.length > 0) {
          const names = teams.map((t) => t.nama);
          setTimList(names);
          setSelectedTim(names[0]);
          set("tim", names[0]);
        }
      })
      .catch((err) => console.error("Gagal memuat tim", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setTimList((prev) => [...prev, name]);
      handleSelectTim(name);
      setNewTimName("");
      setShowAddTim(false);
    } catch (err: any) {
      alert("Gagal tambah tim: " + err.message);
    } finally {
      setTimLoading(false);
    }
  };

  const handleRemoveTim = async (tim: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (DEFAULT_TIMS.includes(tim)) return;
    if (!confirm(`Hapus tim "${tim}"?`)) return;
    setTimLoading(true);
    try {
      // Find the team id
      const teams = await profilerApi.getTeams();
      const teamObj = teams.find((t) => t.nama === tim);
      if (teamObj) {
        await profilerApi.deleteTeam(teamObj.id);
      }
      const updated = timList.filter((t) => t !== tim);
      setTimList(updated);
      if (selectedTim === tim) handleSelectTim(updated[0] || "Telepon");
    } catch (err: any) {
      alert("Gagal hapus tim: " + err.message);
    } finally {
      setTimLoading(false);
    }
  };

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!form.nama?.trim()) {
      alert("Nama wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const newId = crypto.randomUUID();
      let foto_url = "";
      if (fotoFile) {
        foto_url = await profilerApi.uploadFoto(fotoFile, newId);
      }
      const { data: userData } = await supabase.auth.getUser();
      await profilerApi.createPeserta({
        ...form,
        id: newId,
        foto_url,
        trainer_id: userData?.user?.id || undefined,
      } as Partial<ProfilerPeserta>);
      navigate({ to: "/profiler/table", search: { batch: batchName } });
    } catch (err: any) {
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const heroAction = (
    <button
      onClick={handleSubmit}
      disabled={loading}
      className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-50"
    >
      <Save className="h-4 w-4" />
      {loading ? "Menyimpan..." : "Simpan"}
    </button>
  );

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <main className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref={`/profiler/table?batch=${encodeURIComponent(batchName)}`}
            backLabel="Kembali ke tabel batch"
            eyebrow="Profiler workspace"
            title="Tambah data peserta ke batch aktif."
            description="Lengkapi identitas, tim, dan data kerja peserta melalui formulir yang konsisten dengan standar visual workspace KTP."
            icon={<UserPlus className="h-3.5 w-3.5" />}
            actions={heroAction}
          />

          <div className="mb-6 rounded-[1.75rem] border border-border/60 bg-card/75 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Batch aktif
            </p>
            <p className="mt-2 text-sm font-semibold">{batchName}</p>
          </div>

          <div className="space-y-8">
            {/* Identitas Utama */}
            <div className={sectionClass}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-foreground">
                  Identitas Utama
                </h2>
              </div>

              {/* Foto */}
              <div className="flex items-center gap-6 p-6 rounded-2xl bg-foreground/[0.02] border border-border/50">
                <div className="w-24 h-24 rounded-2xl bg-background border border-border overflow-hidden flex items-center justify-center shrink-0 shadow-inner relative">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt="Preview"
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <Upload className="w-8 h-8 text-foreground/10" />
                  )}
                </div>
                <div className="space-y-3">
                  <label className="inline-flex cursor-pointer px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-bold transition-all shadow-sm">
                    Pilih Foto
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFoto}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                    JPG/PNG, maks 5MB. Auto-compress.
                  </p>
                </div>
              </div>

              {/* Nama */}
              <div>
                <label className={labelClass}>Nama Lengkap *</label>
                <input
                  type="text"
                  placeholder="Nama lengkap peserta"
                  className={inputClass}
                  value={form.nama || ""}
                  onChange={(e) => set("nama", e.target.value)}
                />
              </div>

              {/* Tim */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelClass + " mb-0"}>Tim *</label>
                  <button
                    onClick={() => setShowAddTim(!showAddTim)}
                    disabled={timLoading}
                    className="flex items-center gap-1 text-[10px] text-primary hover:opacity-70 font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-1"
                  >
                    <Plus className="w-3 h-3" /> Tim Baru
                  </button>
                </div>
                {showAddTim && (
                  <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <input
                      autoFocus
                      type="text"
                      value={newTimName}
                      onChange={(e) => setNewTimName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTim();
                        if (e.key === "Escape") setShowAddTim(false);
                      }}
                      placeholder="Nama tim baru..."
                      className={inputClass}
                    />
                    <button
                      onClick={handleAddTim}
                      disabled={timLoading}
                      className="px-6 py-2 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {timLoading ? "..." : "Tambah"}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {timList.map((tim) => (
                    <button
                      key={tim}
                      type="button"
                      onClick={() => handleSelectTim(tim)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                        selectedTim === tim
                          ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/10"
                          : "bg-background border-border/40 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {tim}
                      {!DEFAULT_TIMS.includes(tim) && (
                        <span
                          onClick={(e) => handleRemoveTim(tim, e)}
                          className={`ml-1 hover:opacity-70 ${selectedTim === tim ? "text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          <X className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jabatan */}
              <div>
                <label className={labelClass}>Jabatan *</label>
                <select
                  className={inputClass}
                  value={form.jabatan}
                  onChange={(e) =>
                    set("jabatan", e.target.value as "cca" | "tl" | "qa" | "spv")
                  }
                >
                  {Object.entries(labelJabatan).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Data Kerja */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                Data Kerja
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={labelClass}>NIK OJK</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.nik_ojk || ""}
                      onChange={(e) => set("nik_ojk", e.target.value)}
                      placeholder="NIK OJK"
                    />
                </div>
                <div>
                  <label className={labelClass}>Bergabung di 157</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.bergabung_date || ""}
                    onChange={(e) => set("bergabung_date", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Alamat Email OJK</label>
                  <input
                    type="email"
                    placeholder="nama@ojk.go.id"
                    className={inputClass}
                    value={form.email_ojk || ""}
                    onChange={(e) => set("email_ojk", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>No. Telepon Aktif</label>
                  <input
                    type="text"
                    placeholder="0812xxxxxxxx"
                    className={inputClass}
                    value={form.no_telepon || ""}
                    onChange={(e) => set("no_telepon", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>No. Telepon Darurat</label>
                  <input
                    type="text"
                    placeholder="0812xxxxxxxx"
                    className={inputClass}
                    value={form.no_telepon_darurat || ""}
                    onChange={(e) => set("no_telepon_darurat", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nama Kontak Darurat</label>
                  <input
                    type="text"
                    placeholder="Nama lengkap"
                    className={inputClass}
                    value={form.nama_kontak_darurat || ""}
                    onChange={(e) => set("nama_kontak_darurat", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Hubungan Kontak Darurat</label>
                  <select
                    className={inputClass}
                    value={form.hubungan_kontak_darurat || ""}
                    onChange={(e) =>
                      set("hubungan_kontak_darurat", e.target.value)
                    }
                  >
                    <option value="">Pilih</option>
                    <option value="Orang Tua">Orang Tua</option>
                    <option value="Saudara">Saudara</option>
                    <option value="Pasangan">Pasangan</option>
                    <option value="Teman">Teman</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Data Pribadi */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                Data Pribadi
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Jenis Kelamin</label>
                  <select
                    className={inputClass}
                    value={form.jenis_kelamin || ""}
                    onChange={(e) => set("jenis_kelamin", e.target.value)}
                  >
                    <option value="">Pilih</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Agama</label>
                  <select
                    className={inputClass}
                    value={form.agama || ""}
                    onChange={(e) => set("agama", e.target.value)}
                  >
                    <option value="">Pilih</option>
                    {["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"].map(
                      (a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tanggal Lahir</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.tgl_lahir || ""}
                    onChange={(e) => set("tgl_lahir", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status Perkawinan</label>
                  <select
                    className={inputClass}
                    value={form.status_perkawinan || ""}
                    onChange={(e) => set("status_perkawinan", e.target.value)}
                  >
                    <option value="">Pilih</option>
                    <option value="Belum Menikah">Belum Menikah</option>
                    <option value="Menikah">Menikah</option>
                    <option value="Cerai">Cerai</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Pendidikan</label>
                  <select
                    className={inputClass}
                    value={form.pendidikan || ""}
                    onChange={(e) => set("pendidikan", e.target.value)}
                  >
                    <option value="">Pilih</option>
                    {["SMA", "D3", "S1", "S2", "S3"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Data Sensitif */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                🔒 Data Sensitif
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Data ini tidak tampil di slide PPTX secara default.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>No. KTP</label>
                  <input
                    type="text"
                    placeholder="16 digit NIK"
                    maxLength={16}
                    className={inputClass}
                    value={form.no_ktp || ""}
                    onChange={(e) => set("no_ktp", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>No. NPWP</label>
                  <input
                    type="text"
                    placeholder="xx.xxx.xxx.x-xxx.xxx"
                    className={inputClass}
                    value={form.no_npwp || ""}
                    onChange={(e) => set("no_npwp", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nomor Rekening</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.nomor_rekening || ""}
                    onChange={(e) => set("nomor_rekening", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Nama Bank</label>
                  <input
                    type="text"
                    placeholder="BCA, BRI, Mandiri..."
                    className={inputClass}
                    value={form.nama_bank || ""}
                    onChange={(e) => set("nama_bank", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Alamat Tempat Tinggal</label>
                  <textarea
                    rows={2}
                    className={inputClass}
                    value={form.alamat_tinggal || ""}
                    onChange={(e) => set("alamat_tinggal", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Status Tempat Tinggal</label>
                  <select
                    className={inputClass}
                    value={form.status_tempat_tinggal || ""}
                    onChange={(e) =>
                      set("status_tempat_tinggal", e.target.value)
                    }
                  >
                    <option value="">Pilih</option>
                    <option value="Milik Sendiri">
                      Rumah/Apartemen Milik Sendiri
                    </option>
                    <option value="Milik Orang Tua">
                      Rumah/Apartemen Milik Orang Tua
                    </option>
                    <option value="Kost/Sewa">Kost/Sewa Apartemen</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Latar Belakang */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                Latar Belakang
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Nama Lembaga Pendidikan</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.nama_lembaga || ""}
                    onChange={(e) => set("nama_lembaga", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Jurusan</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.jurusan || ""}
                    onChange={(e) => set("jurusan", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Previous Company</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.previous_company || ""}
                    onChange={(e) => set("previous_company", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Pengalaman Contact Center</label>
                  <select
                    className={inputClass}
                    value={form.pengalaman_cc || ""}
                    onChange={(e) => set("pengalaman_cc", e.target.value)}
                  >
                    <option value="">Pilih</option>
                    <option value="Pernah">Pernah</option>
                    <option value="Tidak Pernah">Tidak Pernah</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Catatan Tambahan */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                ⭐ Catatan Tambahan
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Prestasi, bakat, hobi, atau hal unik lainnya.
              </p>
              <textarea
                rows={3}
                placeholder="Contoh: 🏆 Juara 1 Public Speaking 2024&#10;🎸 Hobi: Bermain gitar&#10;💡 Bakat: Desain grafis"
                className={inputClass}
                value={form.catatan_tambahan || ""}
                onChange={(e) => set("catatan_tambahan", e.target.value)}
              />
            </div>

            {/* Keterangan */}
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                Keterangan
              </h2>
              <textarea
                rows={2}
                placeholder="Catatan umum lainnya..."
                className={inputClass}
                value={form.keterangan || ""}
                onChange={(e) => set("keterangan", e.target.value)}
              />
            </div>

            {/* Tombol Simpan */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-4 bg-primary hover:opacity-90 hover:shadow-lg disabled:opacity-50 text-primary-foreground rounded-2xl text-base font-bold shadow-md shadow-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              {loading ? "Menyimpan..." : "✓ Simpan Data"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
