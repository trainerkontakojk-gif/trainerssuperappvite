import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Plus,
  Check,
  Edit2,
  Trash2,
  Image as ImageIcon,
  User,
  Settings,
  FileText,
  Users,
  Save,
  Sparkles,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePdktSettingsDraft } from "./settings/usePdktSettingsDraft";
import { PdktSystemTab } from "./settings/PdktSystemTab";
import type {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
} from "@trainers/types";
import ScenarioImage from "./ScenarioImage";
import { postApi } from "../../../hooks/useApi";
import { notify } from "../../../lib/toast";
import {
  type PdktAppSettings as AppSettings,
  TEXT_MODELS,
  DEFAULT_PDKT_MODEL_ID,
  coercePdktModelId,
} from "../pdktSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  defaultScenarios: PdktScenario[];
  defaultConsumerTypes: PdktConsumerType[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  defaultScenarios,
  defaultConsumerTypes,
}) => {
  const {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    editingScenarioId,
    setEditingScenarioId,
    isAddingScenario,
    setIsAddingScenario,
    newScenarioCategory,
    setNewScenarioCategory,
    isNewCategoryInput,
    setIsNewCategoryInput,
    newScenarioTitle,
    setNewScenarioTitle,
    newScenarioDesc,
    setNewScenarioDesc,
    newScenarioTemplateSubject,
    setNewScenarioTemplateSubject,
    newScenarioTemplateBody,
    setNewScenarioTemplateBody,
    newScenarioAlwaysUseTemplate,
    setNewScenarioAlwaysUseTemplate,
    newScenarioIsLicensed,
    setNewScenarioIsLicensed,
    isGeneratingTemplate,
    setIsGeneratingTemplate,
    newScenarioImages,
    setNewScenarioImages,
    fileInputRef,
    editingConsumerId,
    setEditingConsumerId,
    isAddingConsumer,
    setIsAddingConsumer,
    newConsumerName,
    setNewConsumerName,
    newConsumerDesc,
    setNewConsumerDesc,
    newConsumerDifficulty,
    setNewConsumerDifficulty,
    newConsumerTone,
    setNewConsumerTone,
    customSenderName,
    setCustomSenderName,
    customBodyName,
    setCustomBodyName,
    customEmail,
    setCustomEmail,
    customCity,
    setCustomCity,
    enableImageGeneration,
    setEnableImageGeneration,
    globalConsumerTypeId,
    setGlobalConsumerTypeId,
    selectedModel,
    setSelectedModel,
    consumerNameMentionPattern,
    setConsumerNameMentionPattern,
    writingStyleMode,
    setWritingStyleMode,
    categories,
    handleToggleScenario,
    handleAddScenario,
    handleEditScenario,
    resetScenarioForm,
    handleImageUpload,
    handleRemoveImage,
    handleSaveScenario,
    handleGenerateTemplate,
    handleAddConsumer,
    handleEditConsumer,
    resetConsumerForm,
    handleSaveConsumer,
    handleSave,
    handleResetDefaults,
    handleDeleteScenario,
    handleDeleteConsumer,
  } = usePdktSettingsDraft({
    settings,
    isOpen,
    onSave,
    onClose,
    defaultScenarios,
    defaultConsumerTypes,
  });

  if (!isOpen) return null;

  const tabs = [
    { id: "scenarios" as const, label: "Masalah", icon: FileText },
    { id: "consumers" as const, label: "Karakter", icon: Users },
    { id: "identity" as const, label: "Identitas", icon: User },
    { id: "system" as const, label: "Sistem", icon: Settings },
  ];

  const activeCount = localSettings.scenarios.filter((s) => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[86vh] rounded-xl flex flex-col overflow-hidden shadow-xl bg-card border border-border/50"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-border/50 flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Module PDKT
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <button
                  onClick={handleSave}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center gap-2.5 group"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Simpan Perubahan</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Segmented Control Tabs */}
            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0 bg-transparent">
              <div className="flex p-2 rounded-2xl bg-foreground/5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-medium uppercase tracking-wide rounded-xl transition-all relative group ${
                      activeTab === tab.id
                        ? "text-primary"
                        : "text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabPDKT"
                        className="absolute inset-0 shadow-sm rounded-xl bg-card border border-border/50"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.6,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <tab.icon
                        className={`w-4 h-4 transition-transform group-hover:scale-110 ${activeTab === tab.id ? "text-primary" : ""}`}
                      />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 sm:pb-8 custom-scrollbar">
              {activeTab === "scenarios" && (
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
                          <span className="text-primary">{activeCount}</span> /{" "}
                          {totalScenarios} Aktif
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setEnableImageGeneration(!enableImageGeneration)
                        }
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
                    {localSettings.scenarios.map((scenario) => (
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
                          {scenario.attachmentImages &&
                            scenario.attachmentImages.length > 0 && (
                              <div className="mt-4 flex items-center gap-3">
                                <div className="px-3 py-1 border border-primary/20 bg-primary/5 rounded-lg inline-flex items-center gap-2">
                                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-[10px] font-medium text-primary uppercase tracking-wide">
                                    {scenario.attachmentImages?.length}{" "}
                                    Attachments
                                  </span>
                                </div>
                              </div>
                            )}
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-2 ml-6 relative z-10">
                          <button
                            onClick={() => handleEditScenario(scenario)}
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

                    {!isAddingScenario && !editingScenarioId && (
                      <button
                        onClick={handleAddScenario}
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
                  {(isAddingScenario || editingScenarioId) && (
                    <div
                      id="scenario-form"
                      className="bg-card/60 backdrop-blur-3xl rounded-xl border border-border/50 shadow-sm overflow-hidden mt-8 relative"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/50 to-primary/10" />
                      <div className="px-8 py-6 border-b border-border/50 flex justify-between items-center group">
                        <h3 className="font-semibold text-foreground text-lg tracking-tight">
                          {editingScenarioId
                            ? "Edit Skenario"
                            : "Tambah Skenario"}
                        </h3>
                        <button
                          onClick={resetScenarioForm}
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
                                value={newScenarioCategory}
                                onChange={(e) => {
                                  if (e.target.value === "NEW") {
                                    setIsNewCategoryInput(true);
                                    setNewScenarioCategory("");
                                  } else {
                                    setNewScenarioCategory(e.target.value);
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
                                onChange={(e) =>
                                  setNewScenarioCategory(e.target.value)
                                }
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
                            value={newScenarioTitle}
                            onChange={(e) =>
                              setNewScenarioTitle(e.target.value)
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
                            value={newScenarioDesc}
                            onChange={(e) => setNewScenarioDesc(e.target.value)}
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
                              checked={newScenarioIsLicensed}
                              onChange={(e) =>
                                setNewScenarioIsLicensed(e.target.checked)
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
                                  !newScenarioTitle ||
                                  !newScenarioDesc
                                }
                                className="flex items-center gap-2 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[9px] font-medium uppercase tracking-wide transition-all disabled:opacity-50"
                              >
                                {isGeneratingTemplate ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span>
                                  {isGeneratingTemplate
                                    ? "Generating..."
                                    : "Generate"}
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
                                  checked={newScenarioAlwaysUseTemplate}
                                  onChange={(e) =>
                                    setNewScenarioAlwaysUseTemplate(
                                      e.target.checked,
                                    )
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
                              value={newScenarioTemplateSubject}
                              onChange={(e) =>
                                setNewScenarioTemplateSubject(e.target.value)
                              }
                            />
                            <textarea
                              className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none font-medium placeholder:text-foreground/10"
                              rows={10}
                              placeholder="Tulis isi email template di sini. Gunakan wording netral; nama konsumen akan disisipkan otomatis sesuai pengaturan sistem."
                              value={newScenarioTemplateBody}
                              onChange={(e) =>
                                setNewScenarioTemplateBody(e.target.value)
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

                            {newScenarioImages.length > 0 && (
                              <div className="flex gap-2 p-4 bg-foreground/5 rounded-xl border border-border/50 overflow-x-auto custom-scrollbar">
                                {newScenarioImages.map((img, index) => (
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
                            onClick={resetScenarioForm}
                            className="px-8 py-3 rounded-xl text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
                          >
                            Batal
                          </button>
                          <button
                            onClick={handleSaveScenario}
                            disabled={
                              !newScenarioTitle ||
                              !newScenarioDesc ||
                              (!newScenarioCategory && !isNewCategoryInput)
                            }
                            className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold text-[10px] uppercase tracking-widest shadow-sm transition-all disabled:opacity-50"
                          >
                            {editingScenarioId
                              ? "Perbarui Skenario"
                              : "Simpan Skenario"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "consumers" && (
                <div className="space-y-8 mt-4">
                  <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl flex gap-5 items-start backdrop-blur-md">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground uppercase tracking-wide text-[11px] mb-1">
                        💡 Tips Simulasi
                      </h4>
                      <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                        Pilih tipe konsumen yang akan disimulasikan. Variasi
                        tingkat kesulitan akan mempengaruhi gaya bahasa dan
                        respon AI. Pilih{" "}
                        <span className="text-primary font-bold">Acak</span>{" "}
                        untuk tantangan yang berbeda setiap saat.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Random Option */}
                    <div
                      onClick={() => setGlobalConsumerTypeId("random")}
                      className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
                        globalConsumerTypeId === "random"
                          ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
                          : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
                      }`}
                    >
                      {globalConsumerTypeId === "random" && (
                        <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
                      )}
                      <div className="flex justify-between items-start mb-4">
                        <h4
                          className={`font-semibold text-lg tracking-tight flex items-center gap-3 ${globalConsumerTypeId === "random" ? "text-primary-foreground" : "text-foreground"}`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${globalConsumerTypeId === "random" ? "bg-primary-foreground animate-pulse" : "bg-foreground/20"}`}
                          />
                          Acak (Random)
                        </h4>
                        {globalConsumerTypeId === "random" && (
                          <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md">
                            <Check className="w-4 h-4 stroke-[3px]" />
                          </div>
                        )}
                      </div>
                      <p
                        className={`text-xs font-medium leading-relaxed ${globalConsumerTypeId === "random" ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                      >
                        Sistem akan memilih tipe konsumen secara acak untuk
                        setiap sesi simulasi untuk variasi maksimal.
                      </p>
                    </div>

                    {localSettings.consumerTypes.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setGlobalConsumerTypeId(c.id)}
                        className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
                          globalConsumerTypeId === c.id
                            ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
                            : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
                        } ${editingConsumerId === c.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
                      >
                        {globalConsumerTypeId === c.id && (
                          <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
                        )}
                        <div className="flex justify-between items-start mb-4">
                          <h4
                            className={`font-semibold text-lg tracking-tight flex items-center gap-3 pr-8 ${globalConsumerTypeId === c.id ? "text-primary-foreground" : "text-foreground"}`}
                          >
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${globalConsumerTypeId === c.id ? "bg-primary-foreground" : "bg-foreground/20"}`}
                            />
                            {c.name}
                          </h4>
                          <div className="flex items-center gap-2 relative z-10">
                            {globalConsumerTypeId === c.id && (
                              <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md mr-1">
                                <Check className="w-4 h-4 stroke-[3px]" />
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditConsumer(c);
                              }}
                              className={`p-2 rounded-xl transition-all border border-transparent ${
                                globalConsumerTypeId === c.id
                                  ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                                  : "bg-foreground/5 text-muted-foreground hover:text-primary hover:border-primary/20"
                              }`}
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConsumer(c.id);
                              }}
                              className={`p-2 rounded-xl transition-all border border-transparent ${
                                globalConsumerTypeId === c.id
                                  ? "bg-primary-foreground/10 text-primary-foreground hover:bg-red-400"
                                  : "bg-foreground/5 text-muted-foreground hover:text-red-500 hover:border-red-500/20"
                              }`}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2 mb-3">
                          <span
                            className={`text-[9px] px-2.5 py-1 rounded-lg font-medium uppercase tracking-wide border ${
                              globalConsumerTypeId === c.id
                                ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground"
                                : "bg-foreground/5 border-border/50 text-muted-foreground"
                            }`}
                          >
                            {c.difficulty}
                          </span>
                        </div>
                        <p
                          className={`text-xs font-medium leading-relaxed line-clamp-2 ${globalConsumerTypeId === c.id ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                        >
                          {c.description}
                        </p>
                      </div>
                    ))}
                  </div>

                  {!isAddingConsumer && !editingConsumerId ? (
                    <button
                      onClick={handleAddConsumer}
                      className="w-full py-10 rounded-xl border-2 border-dashed border-border/50 bg-card/10 text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-3 group mt-4 shadow-inner"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                        <Plus className="w-7 h-7" />
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-wide">
                        Tambah Karakter Baru
                      </span>
                    </button>
                  ) : (
                    <div
                      id="consumer-form"
                      className="bg-card/60 backdrop-blur-3xl rounded-xl border border-border/50 shadow-sm overflow-hidden mt-8 relative"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/50 to-primary/10" />
                      <div className="px-8 py-6 border-b border-border/50 flex justify-between items-center">
                        <h3 className="font-semibold text-foreground text-lg tracking-tight">
                          {editingConsumerId
                            ? "Edit Karakter"
                            : "Tambah Karakter"}
                        </h3>
                        <button
                          onClick={resetConsumerForm}
                          className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-xl transition-all"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-8 grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                            Nama Karakter / Tipe
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
                            placeholder="Contoh: Konsumen Milenial Galak"
                            value={newConsumerName}
                            onChange={(e) => setNewConsumerName(e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                            Tingkat Kesulitan
                          </label>
                          <select
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium appearance-none"
                            value={newConsumerDifficulty}
                            onChange={(e) =>
                              setNewConsumerDifficulty(e.target.value as any)
                            }
                          >
                            <option value="Easy">Mudah (Sopan)</option>
                            <option value="Medium">Menengah (Netral)</option>
                            <option value="Hard">Sulit (Marah/Kritis)</option>
                          </select>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                            Tone Bicara / Keyword
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10"
                            placeholder="Contoh: ketus, menggunakan 'saya', menuntut"
                            value={newConsumerTone}
                            onChange={(e) => setNewConsumerTone(e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3 ml-2">
                            Deskripsi Karakteristik
                          </label>
                          <textarea
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none font-medium placeholder:text-foreground/10"
                            rows={3}
                            placeholder="Jelaskan detail perilaku karakter ini agar AI dapat menirunya..."
                            value={newConsumerDesc}
                            onChange={(e) => setNewConsumerDesc(e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 pt-6 border-t border-border/50">
                          <button
                            onClick={resetConsumerForm}
                            className="px-8 py-3 rounded-xl text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
                          >
                            Batal
                          </button>
                          <button
                            onClick={handleSaveConsumer}
                            disabled={!newConsumerName || !newConsumerDesc}
                            className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold text-[10px] uppercase tracking-widest shadow-sm transition-all disabled:opacity-50"
                          >
                            {editingConsumerId
                              ? "Perbarui Karakter"
                              : "Simpan Karakter"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "identity" && (
                <div className="space-y-8 mt-4">
                  <div className="bg-primary/5 border border-primary/20 p-8 rounded-xl relative overflow-hidden group backdrop-blur-md">
                    <div className="absolute top-0 right-0 p-8 text-primary/10 group-hover:scale-125 transition-transform">
                      <User className="w-32 h-32" />
                    </div>
                    <div className="relative z-10 max-w-2xl">
                      <h3 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
                        Personalisasi Identitas
                      </h3>
                      <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                        Atur detail identitas Anda yang akan muncul dalam
                        simulasi email. Data ini akan digunakan AI untuk menyapa
                        dan menandatangani balasan secara otomatis.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-card/40 p-10 rounded-xl border border-border/50 backdrop-blur-xl">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Data Personal
                        </h4>
                      </div>

                      <div className="space-y-4">
                        <div className="group">
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                            Nama Pengirim (Header)
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all group-focus-within:bg-foreground/10"
                            placeholder="Contoh: Ahmad Fauzi"
                            value={customSenderName}
                            onChange={(e) =>
                              setCustomSenderName(e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                            Nama Panggilan (Body)
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                            placeholder="Contoh: Fauzi"
                            value={customBodyName}
                            onChange={(e) => setCustomBodyName(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Settings className="w-5 h-5 text-primary" />
                        </div>
                        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Konfigurasi Tambahan
                        </h4>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                            Email Kantor
                          </label>
                          <input
                            type="email"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                            placeholder="fauzi@ojk.go.id"
                            value={customEmail}
                            onChange={(e) => setCustomEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                            Kota Tugas
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium placeholder:text-foreground/10 transition-all focus:bg-foreground/10"
                            placeholder="Contoh: Jakarta"
                            value={customCity}
                            onChange={(e) => setCustomCity(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5 ml-2">
                            Pola Penyebutan Nama Konsumen
                          </label>
                          <select
                            className="w-full rounded-2xl border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none font-medium transition-all focus:bg-foreground/10"
                            value={consumerNameMentionPattern}
                            onChange={(e) =>
                              setConsumerNameMentionPattern(
                                e.target.value as any,
                              )
                            }
                          >
                            <option value="random">Acak</option>
                            <option value="upfront">
                              Nama disebut di awal
                            </option>
                            <option value="middle">
                              Nama disebut di tengah
                            </option>
                            <option value="late">Nama disebut di akhir</option>
                            <option value="none">Tidak menyebut nama</option>
                          </select>
                          <p className="mt-2 ml-2 text-xs text-muted-foreground font-medium leading-relaxed">
                            Mengatur kapan nama konsumen boleh muncul di email
                            awal simulasi.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2 pt-10 border-t border-border/50 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                            <Trash2 className="w-6 h-6 text-red-500" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-foreground text-base tracking-tight">
                              Hapus Semua Data
                            </h4>
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Kembalikan semua skenario dan karakter ke bawaan
                              sistem.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleResetDefaults}
                          className="px-8 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-[10px] font-medium uppercase tracking-widest transition-all border border-red-500/20 shadow-lg shadow-red-500/5"
                        >
                          Reset Module PDKT
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "system" && (
                <PdktSystemTab
                  writingStyleMode={writingStyleMode}
                  setWritingStyleMode={setWritingStyleMode}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
