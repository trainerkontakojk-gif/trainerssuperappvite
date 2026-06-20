import React, { useState } from "react";
import { Check, Edit2, Trash2, Plus, ArrowLeft, Image as ImageIcon, X } from "lucide-react";
import { KetikAppSettings, KetikScenario } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { normalizeKetikScenarioDraft } from "./ketikDraftNormalizers";

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
  };

  const handleEditClick = (scenario: KetikScenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
  };

  const handleSaveScenario = () => {
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    if (!scenarioForm.draft.title || !scenarioForm.draft.description || !category) return;

    const draftScript = isScenarioScriptEnabled ? scenarioForm.draft.script : "";

    const normalizedDraft = normalizeKetikScenarioDraft({
      ...scenarioForm.draft,
      category,
      script: draftScript,
    });

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

  if (scenarioForm.isOpen) {
    return (
      <div className="space-y-6 pb-10">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={scenarioForm.close}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Daftar Skenario
          </button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden relative">
          <div className="px-6 py-4 border-b border-border bg-foreground/[0.01]">
            <h3 className="font-bold text-foreground text-base tracking-tight">
              {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario Baru"}
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Kategori
              </label>
              {!isNewCategoryInput ? (
                <div className="relative">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none appearance-none transition-colors"
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
                    <option value="NEW">+ Tambah Kategori Lainnya</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
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
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors"
                    placeholder="Kategori Baru"
                    value={newScenarioCategory}
                    onChange={(e) => {
                      setNewScenarioCategory(e.target.value);
                      scenarioForm.setDraft({ category: e.target.value });
                    }}
                  />
                  <button
                    onClick={() => setIsNewCategoryInput(false)}
                    className="px-3.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 border border-transparent rounded-md transition-colors"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Judul Masalah
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30"
                placeholder="Contoh: Gagal Transfer"
                value={scenarioForm.draft.title || ""}
                onChange={(e) => scenarioForm.setDraft({ title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Deskripsi Masalah
              </label>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none transition-colors"
                rows={3}
                value={scenarioForm.draft.description || ""}
                onChange={(e) => scenarioForm.setDraft({ description: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Skrip Percakapan
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsScenarioScriptEnabled((prev) => {
                      if (prev) {
                        scenarioForm.setDraft({ script: "" });
                      }
                      return !prev;
                    });
                  }}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    isScenarioScriptEnabled
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-transparent text-muted-foreground border-border hover:bg-foreground/[0.02]"
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                      isScenarioScriptEnabled ? "bg-primary border-primary text-primary-foreground" : "border-border bg-transparent text-transparent"
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  {isScenarioScriptEnabled ? "Ikuti Skrip" : "Sangat Kreatif"}
                </button>
              </div>
              <textarea
                className={`w-full rounded-md border p-3 text-sm outline-none resize-none transition-colors ${
                  isScenarioScriptEnabled
                    ? "border-border bg-background text-foreground focus:border-foreground"
                    : "border-border/40 bg-muted/30 text-muted-foreground cursor-not-allowed"
                }`}
                rows={8}
                value={scenarioForm.draft.script || ""}
                onChange={(e) => scenarioForm.setDraft({ script: e.target.value })}
                disabled={!isScenarioScriptEnabled}
                placeholder={`Contoh format 1 - Dialog:\nAgent: Selamat pagi, ada yang bisa saya bantu?\nKonsumen: Mas saya ada masalah transaksi.\n\nContoh format 2 - Alur:\nAwal:\n- Konsumen membuka chat dengan nada panik.`}
              />
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Checklist <span className="font-semibold text-foreground">Ikuti Skrip</span> untuk mengaktifkan kolom ini. Saat tidak dicentang, konsumen akan dibiarkan lebih bebas dan kreatif mengikuti konteks skenario.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Lampiran Gambar
              </label>
              <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-border rounded-md cursor-pointer hover:bg-foreground/[0.02] hover:border-foreground/30 transition-colors">
                <div className="flex flex-col items-center justify-center py-4">
                  <ImageIcon className="w-5 h-5 text-muted-foreground mb-2" />
                  <p className="text-xs font-medium text-foreground">
                    Pilih gambar untuk dilampirkan
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    PNG, JPG (Maksimal 500KB)
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
                <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                  {scenarioForm.draft.images.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 shrink-0 group">
                      <img
                        src={img}
                        alt={`Preview ${idx}`}
                        className="object-cover w-full h-full rounded-md border border-border"
                      />
                      <button
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center shadow transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button
                onClick={scenarioForm.close}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
                className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="font-bold text-foreground text-lg tracking-tight">
            Daftar Skenario
          </h3>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary mt-0.5">
            {activeCount} / {totalScenarios} AKTIF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-3.5 py-1.5 border border-border rounded-md text-[13px] font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors disabled:opacity-30"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-3.5 py-1.5 border border-border rounded-md text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`flex items-start p-4 rounded-xl border transition-all ${
              scenario.isActive
                ? "bg-card border-border/80"
                : "bg-card/40 border-border/30 opacity-60 hover:opacity-100"
            }`}
          >
            <div className="pt-0.5 mr-3 shrink-0">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border hover:border-foreground/30 bg-transparent text-transparent"
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {scenario.description}
              </p>
              {scenario.images && scenario.images.length > 0 && (
                <div className="mt-2.5">
                  <span className="text-[11px] bg-foreground/5 text-muted-foreground px-2 py-1 rounded-md inline-flex items-center gap-1.5 font-medium border border-border/50">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {scenario.images.length} Lampiran
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 ml-3 shrink-0">
              <button
                onClick={() => handleEditClick(scenario)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-destructive/20"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleAddClick}
        className="w-full py-5 flex flex-col items-center justify-center gap-2 bg-transparent hover:bg-foreground/[0.02] border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors group"
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">Tambah Skenario Baru</span>
      </button>
    </div>
  );
}
