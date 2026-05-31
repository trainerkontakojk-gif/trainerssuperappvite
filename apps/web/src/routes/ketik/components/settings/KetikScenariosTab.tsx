import React, { useState } from "react";
import { Check, Edit2, Trash2, Plus, X, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";
import { KetikAppSettings, KetikScenario } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";

interface KetikScenariosTabProps {
  scenarios: KetikScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<KetikScenario>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
}

export function KetikScenariosTab({
  scenarios,
  scenarioForm,
  setLocalSettings,
}: KetikScenariosTabProps) {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);

  const handleSelectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: true })),
    }));

  const handleUnselectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: false })),
    }));

  const handleToggleScenario = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s,
      ),
    }));

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?"))
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
  };

  const categories = Array.from(new Set(scenarios.map((s) => s.category)));
  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsScenarioScriptEnabled(false);
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleEditClick = (scenario: KetikScenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleSaveScenario = () => {
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    if (!scenarioForm.draft.title || !scenarioForm.draft.description || !category) return;

    const draftScript = isScenarioScriptEnabled ? scenarioForm.draft.script : "";

    const normalizedDraft: Omit<KetikScenario, "id"> = {
      ...scenarioForm.draft,
      category,
      script: draftScript,
      images: scenarioForm.draft.images ?? [],
      isActive: scenarioForm.draft.isActive ?? true,
    };

    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));

    scenarioForm.close();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file) => {
        if (file.size > 500 * 1024) {
          notify.error(
            `File ${file.name} terlalu besar (>500KB). Mohon kompres gambar terlebih dahulu.`
          );
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const currentImages = scenarioForm.draft.images || [];
          scenarioForm.setDraft({ images: [...currentImages, reader.result as string] });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const currentImages = scenarioForm.draft.images || [];
    scenarioForm.setDraft({
      images: currentImages.filter((_, idx) => idx !== indexToRemove),
    });
  };

  return (
    <div className="space-y-8 pb-10 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-card/50 p-6 rounded-[2rem] border border-border/50">
        <div>
          <h3 className="font-black text-foreground text-xl tracking-tighter">
            Daftar Skenario
          </h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1 opacity-80">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all disabled:opacity-30 shadow-sm"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-all disabled:opacity-30 shadow-sm"
          >
            Hapus Semua
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`flex items-start p-6 rounded-[2rem] border transition-all ${scenario.isActive ? "bg-card border-primary/30" : "bg-card/40 border-border/50 opacity-40 grayscale hover:grayscale-0 hover:opacity-100"}`}
          >
            <div className="pt-1 mr-5">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${scenario.isActive ? "bg-primary border-primary text-white" : "border-foreground/10 bg-foreground/5 text-transparent"}`}
              >
                <Check
                  className={`w-4 h-4 ${scenario.isActive ? "scale-100 opacity-100" : "scale-50 opacity-0"} transition-all`}
                />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                  {scenario.category}
                </span>
                <h4 className="text-base font-black text-foreground tracking-tight truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium">
                {scenario.description}
              </p>
              {scenario.images && scenario.images.length > 0 && (
                <div className="mt-3">
                  <span className="text-[10px] bg-foreground/5 text-muted-foreground px-3 py-1.5 rounded-xl inline-flex items-center gap-2 font-black uppercase tracking-widest border border-border/50">
                    <ImageIcon className="w-3.5 h-3.5" />{" "}
                    {scenario.images.length} Lampiran
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => handleEditClick(scenario)}
                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {!scenarioForm.isOpen ? (
        <button
          onClick={handleAddClick}
          className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 backdrop-blur-md border border-dashed border-border/50 rounded-[2rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest shadow-sm group"
        >
          <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <span>Tambah Skenario Baru</span>
        </button>
      ) : (
        <div
          id="scenario-form"
          className="bg-card border border-border/50 rounded-[2rem] shadow-3xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
            <h3 className="font-black text-foreground text-lg tracking-tighter">
              {scenarioForm.editingId
                ? "Edit Skenario"
                : "Tambah Skenario Baru"}
            </h3>
          </div>
          <div className="p-8 grid grid-cols-2 gap-6 relative z-10">
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Kategori
              </label>
              {!isNewCategoryInput ? (
                <div className="relative">
                  <select
                    className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                    value={scenarioForm.draft.category || ""}
                    onChange={(e) => {
                      if (e.target.value === "NEW") {
                        setIsNewCategoryInput(true);
                        setNewScenarioCategory("");
                        scenarioForm.setDraft({ category: "" });
                      } else {
                        setNewScenarioCategory(e.target.value);
                        scenarioForm.setDraft({ category: e.target.value });
                      }
                    }}
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="NEW">
                      + Tambah Kategori Lainnya
                    </option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <svg
                      width="10"
                      height="6"
                      viewBox="0 0 10 6"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 1L5 5L9 1"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <input
                    type="text"
                    className="flex-1 rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    placeholder="Kategori Baru"
                    value={newScenarioCategory}
                    onChange={(e) => {
                      setNewScenarioCategory(e.target.value);
                      scenarioForm.setDraft({ category: e.target.value });
                    }}
                  />
                  <button
                    onClick={() => setIsNewCategoryInput(false)}
                    className="px-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-all"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Judul Masalah
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-foreground/20"
                placeholder="Contoh: Gagal Transfer"
                value={scenarioForm.draft.title || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ title: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Deskripsi Masalah
              </label>
              <textarea
                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all"
                rows={3}
                value={scenarioForm.draft.description || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ description: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between gap-4 mb-3">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Skrip Percakapan
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setIsScenarioScriptEnabled((prev) => !prev)
                  }
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isScenarioScriptEnabled ? "bg-primary/10 text-primary border-primary/20" : "bg-foreground/5 text-muted-foreground border-border/50"}`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isScenarioScriptEnabled ? "bg-primary border-primary text-white" : "border-foreground/20 bg-transparent text-transparent"}`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                  {isScenarioScriptEnabled
                    ? "Ikuti Skrip"
                    : "Sangat Kreatif"}
                </button>
              </div>
              <textarea
                className={`w-full rounded-2xl border p-4 text-sm outline-none resize-none transition-all ${isScenarioScriptEnabled ? "border-border/50 bg-foreground/5 text-foreground focus:ring-2 focus:ring-primary" : "border-border/30 bg-foreground/[0.03] text-muted-foreground cursor-not-allowed"}`}
                rows={12}
                value={scenarioForm.draft.script || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ script: e.target.value })
                }
                disabled={!isScenarioScriptEnabled}
                placeholder={`Contoh format 1 - Dialog:
Agent: Selamat pagi, ada yang bisa saya bantu?
Konsumen: Mas saya ada masalah transaksi.
Agent: Baik, transaksi seperti apa ya?
Konsumen: Tadi pagi ada transaksi kartu kredit yang saya tidak kenal.

Contoh format 2 - Alur:
Awal:
- Konsumen membuka chat dengan nada panik dan singkat.
- Menyebut ada transaksi kartu kredit yang tidak dikenali.

Jika agen bertanya detail:
- Konsumen menyebut transaksi terjadi tadi pagi.
- Nilai transaksi sekitar Rp3.250.000.
- Konsumen tidak pernah memberikan OTP ke siapa pun.

Jika agen memberi arahan pemblokiran:
- Konsumen mulai sedikit tenang.
- Lalu bertanya apakah dana masih bisa diselamatkan.

Akhir:
- Konsumen berterima kasih setelah mendapat langkah lanjut.`}
              />
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed font-medium">
                Checklist{" "}
                <span className="font-black text-foreground">
                  Ikuti Skrip
                </span>{" "}
                untuk mengaktifkan kolom ini. Saat tidak dicentang,
                konsumen akan dibiarkan lebih bebas dan kreatif
                mengikuti konteks skenario. Saat dicentang, AI akan
                berusaha mengikuti skrip sebagai panduan alur.
              </p>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                Lampiran Gambar
              </label>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border/50 rounded-[2rem] cursor-pointer bg-foreground/5 hover:bg-foreground/10 hover:border-primary/30 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Drop File atau Klik
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground italic">
                    PNG, JPG (MAX. 500KB)
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              {scenarioForm.draft.images && scenarioForm.draft.images.length > 0 && (
                <div className="flex gap-4 mt-6 overflow-x-auto pb-4">
                  {scenarioForm.draft.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative w-24 h-24 shrink-0 group"
                    >
                      <img
                        src={img}
                        alt={`Preview ${idx}`}
                        className="object-cover w-full h-full rounded-2xl border border-border/50 shadow-md"
                      />
                      <button
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-6 border-t border-border/50">
              <button
                onClick={scenarioForm.close}
                className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
                className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
