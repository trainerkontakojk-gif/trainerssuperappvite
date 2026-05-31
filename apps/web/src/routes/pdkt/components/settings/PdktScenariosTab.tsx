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
    <div className="space-y-8 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-card/40 p-6 rounded-xl border border-border/50 backdrop-blur-md">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-xl tracking-tight">
              Daftar Skenario
            </h3>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mt-1">
              <span className="text-primary">{activeCount}</span> / {totalScenarios} Aktif
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setEnableImageGeneration(!enableImageGeneration)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-medium uppercase tracking-widest border transition-all shadow-sm flex items-center gap-3 ${enableImageGeneration ? "bg-primary border-primary/20 text-primary-foreground" : "bg-foreground/5 border-border/50 text-muted-foreground hover:bg-foreground/10"}`}
          >
            <ImageIcon className="w-4 h-4" />
            {enableImageGeneration ? "AI Aktif" : "AI Mati"}
          </button>
          <div className="h-8 w-px bg-border/50 mx-1" />
          <button
            onClick={handleSelectAll}
            disabled={allSelected}
            className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-medium uppercase tracking-widest text-primary hover:bg-primary/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-sm"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleUnselectAll}
            disabled={noneSelected}
            className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-medium uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-sm"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      {/* Scenario List */}
      <div className="grid grid-cols-1 gap-4">
        {scenarios.map((scenario) => (
          <motion.div
            layout
            key={scenario.id}
            className={`flex items-start p-6 rounded-xl border transition-all group relative overflow-hidden ${
              scenario.isActive
                ? "bg-card/80 border-primary/30 shadow-xl"
                : "bg-card/20 border-border/50 opacity-40 hover:opacity-100 hover:bg-card/40"
            }`}
          >
            {scenario.isActive && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}

            {/* Checkbox */}
            <div className="pt-1.5 mr-6 flex items-center justify-center relative z-10">
              <button
                onClick={() => handleToggleScenario(scenario.id)}
                className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all ${
                  scenario.isActive
                    ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "border-border/50 bg-foreground/5 text-transparent hover:border-primary/50"
                }`}
              >
                {scenario.isActive && (
                  <Check className="w-5 h-5 stroke-[4px]" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 rounded-lg text-[9px] font-medium uppercase tracking-wide bg-foreground/5 text-muted-foreground border border-border/50">
                  {scenario.category}
                </span>
                <h4 className="text-lg font-semibold text-foreground tracking-tight truncate">
                  {scenario.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground font-medium line-clamp-2 leading-relaxed">
                {scenario.description}
              </p>
              {scenario.attachmentImages && scenario.attachmentImages.length > 0 && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="px-3 py-1 border border-primary/20 bg-primary/5 rounded-lg inline-flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-medium text-primary uppercase tracking-wide">
                      {scenario.attachmentImages?.length} Attachments
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action */}
            <div className="flex items-center gap-2 ml-6 relative z-10">
              <button
                onClick={() => handleEditClick(scenario)}
                className="w-12 h-12 flex items-center justify-center bg-foreground/5 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-2xl transition-all border border-transparent hover:border-primary/20"
                title="Edit"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="w-12 h-12 flex items-center justify-center bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-2xl transition-all border border-transparent hover:border-red-500/20"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        ))}

        {!scenarioForm.isOpen && (
          <button
            onClick={handleAddClick}
            className="w-full py-10 rounded-xl border-2 border-dashed border-border/50 bg-card/10 text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 group mt-4 shadow-inner"
          >
            <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
              <Plus className="w-7 h-7" />
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Tambah Skenario Baru
            </span>
          </button>
        )}
      </div>

      {scenarioForm.isOpen && (
        <div
          id="scenario-form"
          className="bg-card/60 backdrop-blur-3xl rounded-xl border border-border/50 shadow-sm overflow-hidden mt-8 relative"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/50 to-primary/10" />
          <div className="px-8 py-6 border-b border-border/50 flex justify-between items-center group">
            <h3 className="font-semibold text-foreground text-lg tracking-tight">
              {scenarioForm.editingId ? "Edit Skenario" : "Tambah Skenario"}
            </h3>
            <button
              onClick={handleCancelScenarioForm}
              className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-8 grid grid-cols-2 gap-6">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Kategori Masalah
              </label>
              {!isNewCategoryInput ? (
                <div className="relative group">
                  <select
                    className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium appearance-none transition-all group-focus-within:bg-foreground/10"
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium"
                    placeholder="Nama Kategori Baru"
                    value={newScenarioCategory}
                    onChange={(e) => {
                      setNewScenarioCategory(e.target.value);
                      scenarioForm.setDraft({ category: e.target.value });
                    }}
                  />
                  <button
                    onClick={() => setIsNewCategoryInput(false)}
                    className="px-5 text-[10px] font-medium uppercase tracking-widest text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Judul Skenario
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
                placeholder="Contoh: Kesalahan Transaksi Real-time"
                value={scenarioForm.draft.title || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ title: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Deskripsi Detail Masalah
              </label>
              <textarea
                className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none font-medium placeholder:text-foreground/10"
                rows={3}
                placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
                value={scenarioForm.draft.description || ""}
                onChange={(e) =>
                  scenarioForm.setDraft({ description: e.target.value })
                }
              />
            </div>

            <div className="col-span-2 p-5 rounded-2xl border border-border/50 bg-foreground/5 flex items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground tracking-wide">
                  Entitas Berizin OJK (LJK Resmi)
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  Aktifkan jika skenario ini ditujukan untuk entitas
                  legal berizin (Bank, Asuransi resmi) agar AI
                  memakai nama asli.
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
                <div className="w-10 h-5 bg-foreground/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="col-span-2 space-y-4 pt-2">
              <div className="flex items-center justify-between ml-2">
                <div className="flex items-center gap-3">
                  <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Template Email (Opsional)
                  </label>
                  <button
                    onClick={handleGenerateTemplate}
                    disabled={
                      isGeneratingTemplate ||
                      !scenarioForm.draft.title ||
                      !scenarioForm.draft.description
                    }
                    className="flex items-center gap-2 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[9px] font-medium uppercase tracking-wide transition-all disabled:opacity-50"
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
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide group-hover:text-primary transition-colors">
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
                    <div className="w-8 h-4 bg-foreground/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </label>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  className="w-full rounded-xl border-border/50 bg-foreground/5 p-3 text-xs text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
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
                  className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none font-medium placeholder:text-foreground/10"
                  rows={10}
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
                <p className="text-[10px] text-muted-foreground/60 italic ml-2">
                  * Jika &quot;Always use this email&quot; aktif, AI
                  tidak akan meng-generate email baru; sistem akan
                  langsung memakai teks di atas.
                </p>
                <p className="text-[10px] text-muted-foreground/60 italic ml-2">
                  * Setiap skenario aktif dibuat sebagai email
                  terpisah. Pilih satu skenario saat Create Email.
                </p>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                Lampiran Bukti / Media
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border/50 border-dashed rounded-xl cursor-pointer bg-foreground/5 hover:bg-primary/5 hover:border-primary/30 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <ImageIcon className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground group-hover:text-primary transition-colors">
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
                  <div className="flex gap-2 p-4 bg-foreground/5 rounded-xl border border-border/50 overflow-x-auto custom-scrollbar">
                    {scenarioForm.draft.attachmentImages.map((img, index) => (
                      <div
                        key={index}
                        className="relative shrink-0 group"
                      >
                        <ScenarioImage
                          base64={img}
                          variant="thumbnail"
                          className="w-20 h-20"
                        />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 flex justify-end gap-3 pt-6 border-t border-border/50 mt-4">
              <button
                onClick={handleCancelScenarioForm}
                className="px-8 py-3 rounded-xl text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={!scenarioForm.draft.title || !scenarioForm.draft.description}
                className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold text-[10px] uppercase tracking-widest shadow-sm transition-all"
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
