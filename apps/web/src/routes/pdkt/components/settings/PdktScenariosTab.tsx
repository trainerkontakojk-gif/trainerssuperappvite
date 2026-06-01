import React, { useState, useRef } from "react";
import { Check, Edit2, Trash2, Plus, X, Image as ImageIcon, Sparkles, Loader2, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { PdktScenario, PdktIdentity } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { postApi } from "../../../../hooks/useApi";
import ScenarioImage from "../ScenarioImage";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktScenarioDraft } from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "./SettingsPrimitives";

interface PdktScenariosTabProps {
  scenarios: PdktScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  enableImageGeneration: boolean;
  setEnableImageGeneration: (val: boolean) => void;
  customIdentity: PdktIdentity;
  globalConsumerTypeId: string;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function PdktScenariosTab({
  scenarios,
  scenarioForm,
  enableImageGeneration,
  setEnableImageGeneration,
  customIdentity,
  globalConsumerTypeId,
  setLocalSettings,
}: PdktScenariosTabProps) {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = Array.from(new Set(scenarios.map((s) => s.category)));
  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleSelectAll = () => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: true })),
    }));
  };

  const handleUnselectAll = () => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: false })),
    }));
  };

  const handleToggleScenario = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      ),
    }));
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
    }
  };

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsGeneratingTemplate(false);
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleEditClick = (scenario: PdktScenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsGeneratingTemplate(false);
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > 500 * 1024) {
        notify.error("Ukuran gambar terlalu besar! Maksimal 500KB per gambar agar pengaturan dapat disimpan.");
        return;
      }
      const currentImages = scenarioForm.draft.attachmentImages || [];
      if (currentImages.length >= 5) {
        notify.warning("Maksimal 5 gambar per skenario.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        scenarioForm.setDraft({ attachmentImages: [...currentImages, reader.result as string] });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const currentImages = scenarioForm.draft.attachmentImages || [];
    scenarioForm.setDraft({
      attachmentImages: currentImages.filter((_, idx) => idx !== indexToRemove),
    });
  };

  const handleGenerateTemplate = async () => {
    const title = scenarioForm.draft.title;
    const desc = scenarioForm.draft.description;
    if (!title || !desc) {
      notify.warning("Isi judul dan deskripsi masalah terlebih dahulu untuk generate template.");
      return;
    }

    setIsGeneratingTemplate(true);
    try {
      const category = isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category || "Umum";
      const draft: PdktScenario = {
        id: scenarioForm.editingId || "draft",
        category,
        title,
        description: desc,
        isActive: true,
        isLicensed: scenarioForm.draft.isLicensed,
        sampleEmailTemplate: {
          subject: scenarioForm.draft.sampleEmailTemplate?.subject || "",
          body: scenarioForm.draft.sampleEmailTemplate?.body || "",
        },
        attachmentImages: scenarioForm.draft.attachmentImages || [],
      };

      const identity: PdktIdentity = {
        name: customIdentity.name || "Budi Santoso",
        email: customIdentity.email || "budi.santoso88@gmail.com",
        city: customIdentity.city || "Jakarta",
        bodyName: customIdentity.bodyName || "Budi",
      };

      const result = await postApi<{ subject: string; body: string }>(
        "/pdkt/generate-template",
        {
          scenarioDraft: draft,
          consumerTypeId: globalConsumerTypeId === "random" ? "ramah" : globalConsumerTypeId,
          identity,
        }
      );

      scenarioForm.setDraft({
        sampleEmailTemplate: {
          subject: result.subject,
          body: result.body,
        },
      });
    } catch (e: any) {
      notify.error(e.message || "Gagal generate template.");
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const handleSaveScenario = () => {
    const title = scenarioForm.draft.title;
    const desc = scenarioForm.draft.description;
    if (!title || !desc) return;
    if (scenarioForm.draft.alwaysUseSampleEmail && !scenarioForm.draft.sampleEmailTemplate?.body?.trim()) {
      notify.warning('Isi body template email jika Anda memilih "Always use this email".');
      return;
    }

    const category = isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category || "Umum";

    const normalizedDraft = normalizePdktScenarioDraft({
      ...scenarioForm.draft,
      category,
    });

    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));

    scenarioForm.close();
  };

  const handleCancelScenarioForm = () => {
    if (scenarioForm.isDirty(scenarios)) {
      if (!window.confirm("Skenario belum disimpan. Buang perubahan?")) return;
    }
    scenarioForm.close();
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 p-4 rounded-xl border border-border/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm tracking-tight">
              Daftar Skenario
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              <span className="text-primary">{activeCount}</span> / {totalScenarios} Aktif
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => setEnableImageGeneration(!enableImageGeneration)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-2 cursor-pointer ${
                enableImageGeneration
                  ? "bg-primary border-primary/20 text-primary-foreground shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              {enableImageGeneration ? "AI Aktif" : "AI Mati"}
            </button>
            {enableImageGeneration && (
              <p className="text-[9px] text-muted-foreground italic max-w-[150px] text-right leading-tight">
                AI akan generate gambar relevan jika skenario tidak memiliki lampiran manual.
              </p>
            )}
          </div>
          <div className="h-6 w-px bg-border/60 mx-1" />
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      {/* Scenario List */}
      <div className="grid grid-cols-1 gap-3">
        {scenarios.map((scenario) => (
          <motion.div
            layout
            key={scenario.id}
            className={`flex items-start p-5 rounded-xl border transition-all relative overflow-hidden ${
              scenario.isActive
                ? "bg-card border-primary/40 shadow-sm"
                : "bg-card/40 border-border/40 opacity-50 hover:opacity-100 hover:bg-card/70"
            }`}
          >
            {scenario.isActive && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}

            {/* Checkbox Toggle */}
            <div className="pt-0.5 mr-4 flex items-center justify-center relative z-10">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-muted/40 hover:border-primary/50 text-transparent"
                }`}
              >
                {scenario.isActive && (
                  <Check className="w-4 h-4 stroke-[3px]" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border/30">
                  {scenario.category}
                </span>
                <h4 className="text-sm font-bold text-foreground tracking-tight truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground font-medium line-clamp-2 leading-relaxed">
                {scenario.description}
              </p>
              {scenario.attachmentImages && scenario.attachmentImages.length > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="px-2 py-0.5 border border-primary/20 bg-primary/5 rounded-md inline-flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                      {scenario.attachmentImages?.length} Lampiran
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 ml-4 relative z-10">
              <button
                onClick={() => handleEditClick(scenario)}
                className="p-2 rounded-lg bg-background border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="p-2 rounded-lg bg-background border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}

        {!scenarioForm.isOpen && (
          <button
            onClick={handleAddClick}
            className="w-full py-8 rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-border transition-all flex flex-col items-center justify-center gap-2.5 group mt-2 shadow-inner cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:scale-105 transition-all">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold">
              Tambah Skenario Baru
            </span>
          </button>
        )}
      </div>

      {scenarioForm.isOpen && (
        <div
          id="scenario-form"
          className="bg-card rounded-xl border border-border/80 shadow-md overflow-hidden mt-6 relative"
        >
          <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
          <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-muted/10">
            <h3 className="font-semibold text-foreground text-sm tracking-tight">
              {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario"}
            </h3>
            <button
              onClick={handleCancelScenarioForm}
              className="w-8 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <SettingsField label="Kategori Masalah" id="scenario-category">
                {!isNewCategoryInput ? (
                  <SettingsSelect
                    id="scenario-category"
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
                  </SettingsSelect>
                ) : (
                  <div className="flex gap-2">
                    <SettingsInput
                      id="scenario-category-new"
                      type="text"
                      placeholder="Nama Kategori Baru"
                      value={newScenarioCategory}
                      onChange={(e) => {
                        setNewScenarioCategory(e.target.value);
                        scenarioForm.setDraft({ category: e.target.value });
                      }}
                    />
                    <button
                      onClick={() => setIsNewCategoryInput(false)}
                      className="px-3 text-xs font-semibold text-red-500 hover:bg-red-500/5 rounded-lg transition-all cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </SettingsField>
            </div>

            <div className="col-span-2">
              <SettingsField label="Judul Skenario" id="scenario-title">
                <SettingsInput
                  id="scenario-title"
                  type="text"
                  placeholder="Contoh: Kesalahan Transaksi Real-time"
                  value={scenarioForm.draft.title || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({ title: e.target.value })
                  }
                />
              </SettingsField>
            </div>
            <div className="col-span-2">
              <SettingsField label="Deskripsi Detail Masalah" id="scenario-description">
                <textarea
                  id="scenario-description"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-medium placeholder:text-muted-foreground/30"
                  rows={3}
                  placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
                  value={scenarioForm.draft.description || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({ description: e.target.value })
                  }
                />
              </SettingsField>
            </div>

            <div className="col-span-2 p-4 rounded-lg border border-border/80 bg-muted/10 flex items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground">
                  Entitas Berizin OJK (LJK Resmi)
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed font-medium">
                  Aktifkan jika skenario ini ditujukan untuk entitas legal berizin (Bank, Asuransi resmi) agar AI memakai nama asli LJK.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={scenarioForm.draft.isLicensed || false}
                  onChange={(e) =>
                    scenarioForm.setDraft({ isLicensed: e.target.checked })
                  }
                />
                <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="col-span-2 space-y-3 pt-2">
              <div className="flex items-center justify-between ml-1">
                <div className="flex items-center gap-2">
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Template Email (Opsional)
                  </label>
                  <button
                    onClick={handleGenerateTemplate}
                    disabled={
                      isGeneratingTemplate ||
                      !scenarioForm.draft.title ||
                      !scenarioForm.draft.description
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isGeneratingTemplate ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>
                      {isGeneratingTemplate ? "Generating..." : "Generate"}
                    </span>
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-primary transition-colors">
                    Always use this email
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={scenarioForm.draft.alwaysUseSampleEmail || false}
                      onChange={(e) =>
                        scenarioForm.setDraft({ alwaysUseSampleEmail: e.target.checked })
                      }
                    />
                    <div className="w-7 h-4 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </label>
              </div>
              <div className="space-y-2">
                <SettingsInput
                  type="text"
                  placeholder="Subjek email template (opsional)..."
                  value={scenarioForm.draft.sampleEmailTemplate?.subject || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({
                      sampleEmailTemplate: {
                        subject: e.target.value,
                        body: scenarioForm.draft.sampleEmailTemplate?.body || "",
                      },
                    })
                  }
                />
                <textarea
                  className="w-full rounded-lg border border-border bg-background p-3 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-mono placeholder:text-muted-foreground/30"
                  rows={8}
                  placeholder="Tulis isi email template di sini. Gunakan wording netral; nama konsumen akan disisipkan otomatis sesuai pengaturan sistem."
                  value={scenarioForm.draft.sampleEmailTemplate?.body || ""}
                  onChange={(e) =>
                    scenarioForm.setDraft({
                      sampleEmailTemplate: {
                        subject: scenarioForm.draft.sampleEmailTemplate?.subject || "",
                        body: e.target.value,
                      },
                    })
                  }
                />
                <p className="text-[10px] text-muted-foreground/80 italic ml-1">
                  * Jika &quot;Always use this email&quot; aktif, AI tidak akan meng-generate email baru melainkan langsung memakai teks di atas.
                </p>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Lampiran Bukti / Media
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed border-border/85 rounded-xl cursor-pointer bg-muted/10 hover:bg-primary/5 hover:border-primary/30 transition-all group">
                  <div className="flex flex-col items-center justify-center py-4">
                    <ImageIcon className="w-7 h-7 mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                      Upload Media
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                {scenarioForm.draft.attachmentImages && scenarioForm.draft.attachmentImages.length > 0 && (
                  <div className="flex gap-2 p-3 bg-muted/20 border border-border/40 rounded-xl overflow-x-auto custom-scrollbar">
                    {scenarioForm.draft.attachmentImages.map((img, index) => (
                      <div
                        key={index}
                        className="relative shrink-0 group"
                      >
                        <ScenarioImage
                          base64={img}
                          variant="thumbnail"
                          className="w-16 h-16 rounded-lg"
                        />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 flex justify-end gap-2 pt-4 border-t border-border/40 mt-2">
              <button
                onClick={handleCancelScenarioForm}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scenarioForm.editingId ? "Perbarui Skenario" : "Simpan Skenario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
