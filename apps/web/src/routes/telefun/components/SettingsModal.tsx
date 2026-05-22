import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Settings,
  Save,
  Zap,
  User,
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  Clock,
  ShieldCheck,
  FileText,
  AlertTriangle,
} from "lucide-react";
import type {
  TelefunAppSettings,
  TelefunScenario,
  TelefunConsumerType,
} from "../telefunSettings";
import {
  VOICE_MODELS,
  VOICE_OPTIONS,
  MALE_VOICES,
  FEMALE_VOICES,
  DEFAULT_TELEFUN_SETTINGS,
  DISRUPTION_TYPES,
  ConsumerDifficulty,
} from "../telefunSettings";
import { notify } from "../../../lib/toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TelefunAppSettings;
  onSave: (newSettings: TelefunAppSettings) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<
    "scenario" | "consumer" | "identity" | "system"
  >("scenario");
  const [localSettings, setLocalSettings] = useState<TelefunAppSettings>(
    () => ({
      ...DEFAULT_TELEFUN_SETTINGS,
      ...settings,
      scenarios: settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
      consumerTypes:
        settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
    }),
  );

  // Scenario Form State
  const [isScenarioFormOpen, setIsScenarioFormOpen] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState("");
  const [newScenarioInstruction, setNewScenarioInstruction] = useState("");
  const [newScenarioScript, setNewScenarioScript] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);

  // Consumer Form State
  const [isConsumerFormOpen, setIsConsumerFormOpen] = useState(false);
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(null);
  const [newConsumerName, setNewConsumerName] = useState("");
  const [newConsumerGender, setNewConsumerGender] = useState("male");
  const [newConsumerDesc, setNewConsumerDesc] = useState("");
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<ConsumerDifficulty>(
    ConsumerDifficulty.Medium,
  );

  // Filter state for scenario category
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Custom simulation duration input state
  const [customInputValue, setCustomInputValue] = useState("");
  const [durationValidationError, setDurationValidationError] = useState<string | null>(null);

  const PRESET_DURATIONS = [3, 5, 10];
  const MIN_DURATION = 1;
  const MAX_DURATION = 60;

  const classifyDurationMode = (val: number | undefined): "preset" | "custom" => {
    const d = Number(val);
    if (isNaN(d)) return "custom";
    return PRESET_DURATIONS.includes(d) ? "preset" : "custom";
  };

  const durationMode = classifyDurationMode(localSettings.maxCallDuration);

  const handlePresetClick = (d: number) => {
    setCustomInputValue("");
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, maxCallDuration: d }));
  };

  const handleCustomClick = () => {
    const current = localSettings.maxCallDuration;
    const val = PRESET_DURATIONS.includes(current) ? 5 : current;
    setCustomInputValue(String(val));
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, maxCallDuration: val }));
  };

  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const filtered = raw.replace(/[^0-9]/g, "");
    setCustomInputValue(filtered);
    setDurationValidationError(null);
    const num = parseInt(filtered, 10);
    if (filtered.length > 0 && !isNaN(num) && num >= MIN_DURATION && num <= MAX_DURATION) {
      setLocalSettings((prev) => ({ ...prev, maxCallDuration: num }));
    }
  };

  const handleDurationBlur = () => {
    const num = parseInt(customInputValue, 10);
    if (isNaN(num) || num < MIN_DURATION || num > MAX_DURATION) {
      setDurationValidationError(`Masukkan angka ${MIN_DURATION}-${MAX_DURATION}.`);
      setLocalSettings((prev) => ({
        ...prev,
        maxCallDuration: clampDuration(prev.maxCallDuration),
      }));
      return;
    }
    setCustomInputValue(String(num));
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, maxCallDuration: num }));
  };

  const clampDuration = (val: number | undefined): number => {
    const d = Number(val);
    if (isNaN(d) || d < MIN_DURATION) return MIN_DURATION;
    if (d > MAX_DURATION) return MAX_DURATION;
    return d;
  };

  useEffect(() => {
    if (isOpen) {
      setLocalSettings({
        ...DEFAULT_TELEFUN_SETTINGS,
        ...settings,
        scenarios: settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
        consumerTypes:
          settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
      });
      setIsScenarioFormOpen(false);
      setIsConsumerFormOpen(false);
      setEditingScenarioId(null);
      setEditingConsumerId(null);
      setSelectedCategory("all");
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const categories = Array.from(
    new Set(localSettings.scenarios.map((s) => s.category || "Umum")),
  );
  const activeCount = localSettings.scenarios.filter((s) => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

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

  const resetScenarioForm = () => {
    setEditingScenarioId(null);
    setNewScenarioTitle("");
    setNewScenarioInstruction("");
    setNewScenarioScript("");
    setIsScenarioScriptEnabled(false);
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
  };

  const handleEditScenario = (scenario: TelefunScenario) => {
    setEditingScenarioId(scenario.id);
    setNewScenarioCategory(scenario.category || "Umum");
    setNewScenarioTitle(scenario.title);
    setNewScenarioInstruction(scenario.instruction);
    setNewScenarioScript(scenario.script || "");
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
    setIsNewCategoryInput(!categories.includes(scenario.category || "Umum"));
    setIsScenarioFormOpen(true);
    setTimeout(
      () =>
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  };

  const handleSaveScenario = () => {
    if (!newScenarioTitle || !newScenarioInstruction) return;
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";
    if (editingScenarioId) {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.map((s) =>
          s.id === editingScenarioId
            ? {
                ...s,
                category,
                title: newScenarioTitle,
                instruction: newScenarioInstruction,
                script: isScenarioScriptEnabled ? newScenarioScript : "",
              }
            : s,
        ),
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: [
          ...prev.scenarios,
          {
            id: `s-${Date.now()}`,
            category,
            title: newScenarioTitle,
            instruction: newScenarioInstruction,
            script: isScenarioScriptEnabled ? newScenarioScript : "",
            isActive: true,
          },
        ],
      }));
    }
    resetScenarioForm();
    setIsScenarioFormOpen(false);
  };

  const handleCancelScenario = () => {
    resetScenarioForm();
    setIsScenarioFormOpen(false);
  };

  const resetConsumerForm = () => {
    setEditingConsumerId(null);
    setNewConsumerName("");
    setNewConsumerGender("male");
    setNewConsumerDesc("");
    setNewConsumerDifficulty(ConsumerDifficulty.Medium);
  };

  const handleEditConsumer = (consumer: TelefunConsumerType) => {
    setEditingConsumerId(consumer.id);
    setNewConsumerName(consumer.name);
    setNewConsumerGender(consumer.gender || "male");
    setNewConsumerDesc(consumer.description);
    setNewConsumerDifficulty(consumer.difficulty || ConsumerDifficulty.Medium);
    setIsConsumerFormOpen(true);
    setTimeout(
      () =>
        document
          .getElementById("consumer-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  };

  const handleSaveConsumer = () => {
    if (!newConsumerName || !newConsumerDesc) return;
    if (editingConsumerId) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.map((c) =>
          c.id === editingConsumerId
            ? {
                ...c,
                name: newConsumerName,
                gender: newConsumerGender,
                description: newConsumerDesc,
                difficulty: newConsumerDifficulty,
              }
            : c,
        ),
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: [
          ...prev.consumerTypes,
          {
            id: `c-${Date.now()}`,
            name: newConsumerName,
            gender: newConsumerGender,
            description: newConsumerDesc,
            difficulty: newConsumerDifficulty,
          },
        ],
      }));
    }
    resetConsumerForm();
    setIsConsumerFormOpen(false);
  };

  const handleCancelConsumer = () => {
    resetConsumerForm();
    setIsConsumerFormOpen(false);
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus tipe karakter ini?")) {
      setLocalSettings((prev) => {
        const nextTypes = prev.consumerTypes.filter((c) => c.id !== id);
        return {
          ...prev,
          consumerTypes: nextTypes,
          preferredConsumerTypeId:
            prev.preferredConsumerTypeId === id ? "random" : prev.preferredConsumerTypeId,
        };
      });
    }
  };

  const handleClose = () => {
    if (isScenarioFormOpen) {
      notify.warning(
        "Skenario yang sedang Anda edit/buat belum disimpan. Harap simpan atau batalkan terlebih dahulu.",
      );
      return;
    }
    if (isConsumerFormOpen) {
      notify.warning(
        "Karakter yang sedang Anda edit/buat belum disimpan. Harap simpan atau batalkan terlebih dahulu.",
      );
      return;
    }
    onClose();
  };

  const handleSave = () => {
    if (isScenarioFormOpen) {
      notify.warning(
        "Skenario yang sedang Anda edit/buat belum disimpan. Harap simpan atau batalkan terlebih dahulu.",
      );
      return;
    }
    if (isConsumerFormOpen) {
      notify.warning(
        "Karakter yang sedang Anda edit/buat belum disimpan. Harap simpan atau batalkan terlebih dahulu.",
      );
      return;
    }
    onSave(localSettings);
    onClose();
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
      )
    ) {
      setLocalSettings(DEFAULT_TELEFUN_SETTINGS);
      notify.success("Pengaturan berhasil direset ke default.");
    }
  };

  const getDifficultyLabel = (diff?: ConsumerDifficulty | string): string => {
    if (!diff) return "Sedang";
    switch (diff) {
      case ConsumerDifficulty.Easy:
      case "Easy":
        return "Mudah";
      case ConsumerDifficulty.Medium:
      case "Medium":
        return "Sedang";
      case ConsumerDifficulty.Hard:
      case "Hard":
        return "Sulit";
      case ConsumerDifficulty.Random:
      case "Random":
        return "Random";
      default:
        return "Sedang";
    }
  };

  const getDifficultyColor = (diff?: ConsumerDifficulty | string): string => {
    if (!diff) return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    switch (diff) {
      case ConsumerDifficulty.Easy:
      case "Easy":
        return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
      case ConsumerDifficulty.Medium:
      case "Medium":
        return "text-amber-600 bg-amber-500/10 border-amber-500/20";
      case ConsumerDifficulty.Hard:
      case "Hard":
        return "text-rose-600 bg-rose-500/10 border-rose-500/20";
      default:
        return "text-slate-600 bg-slate-500/10 border-slate-500/20";
    }
  };

  const filteredScenarios =
    selectedCategory === "all"
      ? localSettings.scenarios
      : localSettings.scenarios.filter((s) => s.category === selectedCategory);

  const isDisruptionDisabled = (id: string) => {
    const current = localSettings.realisticModeDisruptionTypes || [];
    return !current.includes(id) && current.length >= 3;
  };

  const tabs = [
    { id: "scenario" as const, label: "Masalah", icon: FileText },
    { id: "consumer" as const, label: "Karakter", icon: Users },
    { id: "identity" as const, label: "Identitas", icon: User },
    { id: "system" as const, label: "Sistem", icon: Settings },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          data-module="telefun"
          className="module-clean-app fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/25 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-5xl max-h-[86vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-black/10 bg-card border border-border/50"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-border/50 flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                    Module Telefun
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <button
                  onClick={handleClose}
                  className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Segmented Control Tabs */}
            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0">
              <div className="flex p-2 rounded-2xl bg-foreground/[0.02] border border-border/50">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative group ${
                      activeTab === tab.id ? "text-violet-600" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabTele"
                        className="absolute inset-0 bg-background shadow-sm rounded-xl border border-border/40"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.6,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 sm:pb-8">
              {activeTab === "scenario" && (
                <div className="space-y-6 pb-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-card/50 p-6 rounded-[2rem] border border-border/50">
                    <div>
                      <h3 className="font-black text-foreground text-xl tracking-tighter">
                        Daftar Skenario
                      </h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 mt-1 opacity-80">
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

                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedCategory("all")}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                        selectedCategory === "all"
                          ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/20"
                          : "bg-card border-border/50 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      Semua
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                          selectedCategory === cat
                            ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/20"
                            : "bg-card border-border/50 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Scenarios Grid */}
                  <div className="grid grid-cols-1 gap-4">
                    {filteredScenarios.map((scenario) => {
                      const isPreset = scenario.id.startsWith("preset-");
                      return (
                        <div
                          key={scenario.id}
                          className={`flex items-start p-6 rounded-[2rem] border transition-all ${
                            scenario.isActive
                              ? "bg-card border-violet-600/30"
                              : "bg-card/40 border-border/50 opacity-40 grayscale hover:grayscale-0 hover:opacity-100"
                          }`}
                        >
                          <div className="pt-1 mr-5">
                            <button
                              onClick={() => handleToggleScenario(scenario.id)}
                              className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                                scenario.isActive
                                  ? "bg-violet-600 border-violet-600 text-white"
                                  : "border-foreground/10 bg-foreground/5 text-transparent"
                              }`}
                            >
                              <Check
                                className={`w-4 h-4 ${
                                  scenario.isActive ? "scale-100 opacity-100" : "scale-50 opacity-0"
                                } transition-all`}
                              />
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-violet-600/10 text-violet-600 border border-violet-600/20">
                                {scenario.category || "Umum"}
                              </span>
                              <h4 className="text-base font-black text-foreground tracking-tight truncate">
                                {scenario.title}
                              </h4>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium">
                              {scenario.instruction}
                            </p>
                            {scenario.script && (
                              <div className="mt-3">
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 font-bold uppercase tracking-wider">
                                  <FileText className="w-3.5 h-3.5" /> Skrip Dialog Aktif
                                </span>
                              </div>
                            )}
                          </div>
                          {!isPreset && (
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleEditScenario(scenario)}
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
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Scenario Form / Toggle Button */}
                  {!isScenarioFormOpen ? (
                    <button
                      onClick={() => {
                        resetScenarioForm();
                        setIsScenarioFormOpen(true);
                      }}
                      className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 backdrop-blur-md border border-dashed border-border/50 rounded-[2rem] text-muted-foreground hover:text-violet-600 hover:border-violet-600/30 transition-all font-black text-xs uppercase tracking-widest shadow-sm group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-violet-600/10 transition-colors">
                        <Plus className="w-6 h-6" />
                      </div>
                      <span>Tambah Skenario Baru</span>
                    </button>
                  ) : (
                    <div
                      id="scenario-form"
                      className="bg-card border border-border/50 rounded-[2rem] shadow-3xl overflow-hidden relative animate-in fade-in slide-in-from-bottom-4 duration-300"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">
                          {editingScenarioId ? "Edit Skenario" : "Tambah Skenario Baru"}
                        </h3>
                      </div>
                      <div className="p-8 space-y-6 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                              Judul Masalah
                            </label>
                            <input
                              type="text"
                              value={newScenarioTitle}
                              onChange={(e) => setNewScenarioTitle(e.target.value)}
                              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                              placeholder="Nama skenario/masalah..."
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                              Kategori
                            </label>
                            {!isNewCategoryInput ? (
                              <div className="space-y-2">
                                <select
                                  className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none appearance-none transition-all font-medium"
                                  value={newScenarioCategory}
                                  onChange={(e) => setNewScenarioCategory(e.target.value)}
                                >
                                  <option value="">Pilih Kategori...</option>
                                  {categories.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsNewCategoryInput(true);
                                    setNewScenarioCategory("");
                                  }}
                                  className="text-xs font-black text-violet-600 hover:underline block"
                                >
                                  + Tambah Kategori Lainnya
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    className="flex-1 rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                                    placeholder="Nama kategori baru..."
                                    value={newScenarioCategory}
                                    onChange={(e) => setNewScenarioCategory(e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsNewCategoryInput(false);
                                      setNewScenarioCategory("");
                                    }}
                                    className="px-4 py-2 bg-foreground/5 hover:bg-foreground/10 border border-border/50 rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground transition-all"
                                  >
                                    Batal
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsNewCategoryInput(false);
                                    setNewScenarioCategory("");
                                  }}
                                  className="text-xs font-black text-violet-600 hover:underline block"
                                >
                                  Pilih dari Kategori Terdaftar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                            Instruksi Masalah (Prompt Guidelines)
                          </label>
                          <textarea
                            value={newScenarioInstruction}
                            onChange={(e) => setNewScenarioInstruction(e.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium resize-none"
                            placeholder="Deskripsi skenario, peran konsumen, dan alur masalah yang dihadapi..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                            Mode Alur AI
                          </label>
                          <div className="grid grid-cols-2 gap-4">
                            <button
                              type="button"
                              onClick={() => setIsScenarioScriptEnabled(false)}
                              className={`p-5 rounded-2xl border-2 transition-all flex flex-col gap-1.5 text-left ${
                                !isScenarioScriptEnabled
                                  ? "border-violet-600 bg-violet-600/5 text-foreground"
                                  : "border-border/50 bg-card hover:bg-foreground/5 text-muted-foreground"
                              }`}
                            >
                              <span className="font-bold text-sm">Sangat Kreatif</span>
                              <span className="text-[10px] opacity-80 leading-relaxed font-medium">
                                AI mengalir bebas merespons percakapan tanpa skrip kaku.
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsScenarioScriptEnabled(true)}
                              className={`p-5 rounded-2xl border-2 transition-all flex flex-col gap-1.5 text-left ${
                                isScenarioScriptEnabled
                                  ? "border-violet-600 bg-violet-600/5 text-foreground"
                                  : "border-border/50 bg-card hover:bg-foreground/5 text-muted-foreground"
                              }`}
                            >
                              <span className="font-bold text-sm">Ikuti Skrip</span>
                              <span className="text-[10px] opacity-80 leading-relaxed font-medium">
                                AI dipandu skrip dialog tertentu untuk melatih kepatuhan alur.
                              </span>
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isScenarioScriptEnabled && (
                            <motion.div
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              className="overflow-hidden pt-2"
                            >
                              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                                Skrip Dialog Percakapan
                              </label>
                              <textarea
                                value={newScenarioScript}
                                onChange={(e) => setNewScenarioScript(e.target.value)}
                                rows={5}
                                disabled={!isScenarioScriptEnabled}
                                className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium resize-none disabled:opacity-50"
                                placeholder="Masukkan skrip/panduan respons dialog baris per baris untuk AI..."
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                          <button
                            type="button"
                            onClick={handleCancelScenario}
                            className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveScenario}
                            disabled={!newScenarioTitle || !newScenarioInstruction}
                            className="px-6 py-3 bg-violet-600 hover:bg-violet-600/95 text-white disabled:opacity-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/25 flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            <span>Simpan Skenario</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "consumer" && (
                <div className="space-y-6 pb-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-foreground text-xl tracking-tighter">
                        Karakter & Kepribadian
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium mt-1">
                        Pilih tipe karakter yang akan diperankan oleh AI untuk melatih komunikasi Anda.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Random Characteristics Card */}
                    <div
                      onClick={() => {
                        setLocalSettings((prev) => ({
                          ...prev,
                          preferredConsumerTypeId: "random",
                          consumerName: "Acak",
                          consumerGender: "random",
                        }));
                      }}
                      className={`cursor-pointer p-6 rounded-[2rem] border transition-all flex items-start gap-4 ${
                        localSettings.preferredConsumerTypeId === "random"
                          ? "bg-card border-violet-600/30 shadow-2xl shadow-violet-600/5"
                          : "bg-card/40 border-border/50 hover:bg-foreground/5"
                      }`}
                    >
                      <div className="pt-1">
                        <div
                          className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                            localSettings.preferredConsumerTypeId === "random"
                              ? "bg-violet-600 border-violet-600 text-white"
                              : "border-foreground/10 bg-foreground/5 text-transparent"
                          }`}
                        >
                          <Check className="w-4.5 h-4.5" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Acak
                          </span>
                          <h4 className="text-base font-black text-foreground tracking-tight">
                            🎲 Karakteristik Random
                          </h4>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                          Sistem akan memilih kepribadian, gender, dan tingkat kesulitan secara acak di setiap sesi panggilan untuk meningkatkan kemampuan adaptasi Anda.
                        </p>
                      </div>
                    </div>

                    {/* Consumer List Cards */}
                    {localSettings.consumerTypes.map((c) => {
                      const isSelected = localSettings.preferredConsumerTypeId === c.id;
                      const isDefault =
                        c.id.startsWith("default-") ||
                        c.id === "angry-male" ||
                        c.id === "confused-female";
                      return (
                        <div
                          key={c.id}
                          className={`p-6 rounded-[2rem] border transition-all flex items-start gap-4 ${
                            isSelected
                              ? "bg-card border-violet-600/30 shadow-2xl shadow-violet-600/5"
                              : "bg-card/40 border-border/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div
                            onClick={() => {
                              setLocalSettings((prev) => ({
                                ...prev,
                                preferredConsumerTypeId: c.id,
                                consumerName: c.name,
                                consumerGender: c.gender,
                              }));
                            }}
                            className="pt-1 cursor-pointer"
                          >
                            <div
                              className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? "bg-violet-600 border-violet-600 text-white"
                                  : "border-foreground/10 bg-foreground/5 text-transparent"
                              }`}
                            >
                              <Check className="w-4.5 h-4.5" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2.5 mb-2">
                              <h4 className="text-base font-black text-foreground tracking-tight">
                                {c.name}
                              </h4>
                              <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-violet-600/10 text-violet-600 border border-violet-600/20">
                                {c.gender === "male" ? "Pria" : "Wanita"}
                              </span>
                              {c.difficulty && (
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getDifficultyColor(
                                    c.difficulty,
                                  )}`}
                                >
                                  {getDifficultyLabel(c.difficulty)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                              {c.description}
                            </p>
                          </div>
                          {!isDefault && (
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleEditConsumer(c)}
                                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteConsumer(c.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Consumer Form / Toggle */}
                  {!isConsumerFormOpen ? (
                    <button
                      onClick={() => {
                        resetConsumerForm();
                        setIsConsumerFormOpen(true);
                      }}
                      className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 backdrop-blur-md border border-dashed border-border/50 rounded-[2rem] text-muted-foreground hover:text-violet-600 hover:border-violet-600/30 transition-all font-black text-xs uppercase tracking-widest shadow-sm group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-violet-600/10 transition-colors">
                        <Plus className="w-6 h-6" />
                      </div>
                      <span>Tambah Karakter Baru</span>
                    </button>
                  ) : (
                    <div
                      id="consumer-form"
                      className="bg-card border border-border/50 rounded-[2rem] shadow-3xl overflow-hidden relative animate-in fade-in slide-in-from-bottom-4 duration-300"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">
                          {editingConsumerId ? "Edit Karakter" : "Tambah Karakter Baru"}
                        </h3>
                      </div>
                      <div className="p-8 space-y-6 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                              Nama Profil Karakter
                            </label>
                            <input
                              type="text"
                              value={newConsumerName}
                              onChange={(e) => setNewConsumerName(e.target.value)}
                              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                              placeholder="Contoh: Budi Santoso..."
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                              Gender
                            </label>
                            <select
                              value={newConsumerGender}
                              onChange={(e) => setNewConsumerGender(e.target.value)}
                              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none appearance-none transition-all font-medium"
                            >
                              <option value="male">Pria</option>
                              <option value="female">Wanita</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                              Tingkat Kesulitan
                            </label>
                            <select
                              value={newConsumerDifficulty}
                              onChange={(e) => setNewConsumerDifficulty(e.target.value as ConsumerDifficulty)}
                              className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none appearance-none transition-all font-medium"
                            >
                              <option value={ConsumerDifficulty.Easy}>Mudah</option>
                              <option value={ConsumerDifficulty.Medium}>Sedang</option>
                              <option value={ConsumerDifficulty.Hard}>Sulit</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                            Deskripsi Karakteristik & Kepribadian
                          </label>
                          <textarea
                            value={newConsumerDesc}
                            onChange={(e) => setNewConsumerDesc(e.target.value)}
                            rows={3}
                            className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium resize-none"
                            placeholder="Deskripsikan gaya bicara, temperamen, tingkat pemahaman produk, atau kepribadian khas lainnya..."
                          />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                          <button
                            type="button"
                            onClick={handleCancelConsumer}
                            className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveConsumer}
                            disabled={!newConsumerName || !newConsumerDesc}
                            className="px-6 py-3 bg-violet-600 hover:bg-violet-600/95 text-white disabled:opacity-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/25 flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            <span>Simpan Karakter</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "identity" && (
                <div className="space-y-8 pb-10">
                  <div className="bg-violet-600/5 rounded-3xl p-6 border border-violet-600/10 flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600/10 flex items-center justify-center shrink-0 border border-violet-600/20">
                      <User className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-lg tracking-tight">Identitas Aktif</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed font-medium">
                        Atur profil data pribadi konsumen yang akan digunakan dalam panggilan. Kosongkan isian di bawah ini jika Anda ingin menggunakan identitas acak yang dicocokkan otomatis.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        value={localSettings.identitySettings?.displayName || ""}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            identitySettings: {
                              ...prev.identitySettings,
                              displayName: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                        placeholder="Kosongkan untuk acak"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                        Gender
                      </label>
                      <select
                        value={localSettings.identitySettings?.gender || "random"}
                        onChange={(e) => {
                          const val = e.target.value as "male" | "female" | "random";
                          setLocalSettings((prev) => {
                            let nextVoice = prev.identitySettings?.voiceName;
                            if (val === "male") {
                              nextVoice = MALE_VOICES[0];
                            } else if (val === "female") {
                              nextVoice = FEMALE_VOICES[0];
                            }
                            return {
                              ...prev,
                              voiceName: nextVoice,
                              identitySettings: {
                                ...prev.identitySettings,
                                gender: val,
                                voiceName: nextVoice,
                              },
                            };
                          });
                        }}
                        className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none appearance-none transition-all font-medium"
                      >
                        <option value="random">Acak / Random</option>
                        <option value="male">Laki-laki</option>
                        <option value="female">Perempuan</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                        Nomor Telepon
                      </label>
                      <input
                        type="text"
                        value={localSettings.identitySettings?.phoneNumber || ""}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            identitySettings: {
                              ...prev.identitySettings,
                              phoneNumber: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                        placeholder="Kosongkan untuk acak"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                        Kota Domisili
                      </label>
                      <input
                        type="text"
                        value={localSettings.identitySettings?.city || ""}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            identitySettings: {
                              ...prev.identitySettings,
                              city: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                        placeholder="Kosongkan untuk acak"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">
                        Nama Tanda Tangan
                      </label>
                      <input
                        type="text"
                        value={localSettings.identitySettings?.signatureName || ""}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            identitySettings: {
                              ...prev.identitySettings,
                              signatureName: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-violet-500 outline-none transition-all font-medium"
                        placeholder="Tanda tangan surat / berkas"
                      />
                    </div>

                    {/* AI Voice Selection */}
                    <div className="md:col-span-2 space-y-4">
                      <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                        Tipe Suara AI
                      </label>

                      {localSettings.identitySettings?.gender === "random" && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
                          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div className="text-xs font-semibold leading-relaxed">
                            <p className="font-bold">Pemilihan Suara Manual Dinonaktifkan</p>
                            <p className="mt-0.5 opacity-90">
                              Ganti Gender ke Laki-laki atau Perempuan untuk memilih tipe suara AI secara manual. Saat diatur ke Acak, suara akan dicocokkan otomatis berdasarkan gender yang terpilih acak di setiap sesi panggilan.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {VOICE_OPTIONS.map((v) => {
                          const isMale = MALE_VOICES.includes(v.id as any);
                          const isFemale = FEMALE_VOICES.includes(v.id as any);
                          const gender = localSettings.identitySettings?.gender;

                          const isMatchingGender =
                            gender === "random" ||
                            (gender === "male" && isMale) ||
                            (gender === "female" && isFemale);

                          if (!isMatchingGender) return null;

                          const isSelected = localSettings.identitySettings?.voiceName === v.id;

                          return (
                            <button
                              key={v.id}
                              type="button"
                              disabled={gender === "random"}
                              onClick={() => {
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  voiceName: v.id,
                                  identitySettings: {
                                    ...prev.identitySettings,
                                    voiceName: v.id,
                                  },
                                }));
                              }}
                              className={`px-4 py-3 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all relative ${
                                isSelected
                                  ? "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-600/25 animate-in scale-100"
                                  : gender === "random"
                                    ? "border-border/40 bg-foreground/[0.01] text-muted-foreground/45 cursor-not-allowed opacity-50"
                                    : "border-border/50 bg-card text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                              }`}
                            >
                              {v.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "system" && (
                <div className="space-y-8 pb-10">
                  {/* AI Model List */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-violet-600" />
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Model AI Suara
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {VOICE_MODELS.map((m) => {
                        const isSelected = localSettings.telefunModelId === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setLocalSettings((prev) => ({
                                ...prev,
                                telefunModelId: m.id,
                                selectedModel: m.id,
                              }))
                            }
                            className={`text-left p-6 rounded-[2rem] border-2 transition-all flex flex-col gap-1.5 relative ${
                              isSelected
                                ? "border-violet-600 bg-violet-600/5 shadow-md shadow-violet-600/5"
                                : "border-border/50 bg-card hover:bg-foreground/5"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-black text-sm text-foreground">{m.name}</span>
                              {isSelected && <Check className="w-4 h-4 text-violet-600" />}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                              {m.id.includes("3.1") ? "Next Generation (Recommended)" : "Standard Live"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Simulation Duration */}
                  <section className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                        <Clock className="w-6 h-6 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-sm uppercase tracking-wider mt-1">
                          Durasi Simulasi
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
                          Tentukan batas durasi panggilan maksimal untuk sesi simulasi voice.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {PRESET_DURATIONS.map((d) => {
                        const isSelected = durationMode === "preset" && localSettings.maxCallDuration === d;
                        return (
                          <div
                            key={d}
                            onClick={() => handlePresetClick(d)}
                            className={`cursor-pointer p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-2 text-center relative ${
                              isSelected
                                ? "border-violet-600 bg-violet-600/5 shadow-lg shadow-violet-600/5"
                                : "border-border/50 bg-card hover:bg-foreground/5"
                            }`}
                          >
                            <span
                              className={`text-3xl font-black tracking-tighter ${
                                isSelected ? "text-violet-600" : "text-foreground/30"
                              }`}
                            >
                              {d}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                              Menit
                            </span>
                            {isSelected && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-600/20 z-10 text-white">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div
                        onClick={handleCustomClick}
                        className={`cursor-pointer p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-2 text-center relative ${
                          durationMode === "custom"
                            ? "border-violet-600 bg-violet-600/5 shadow-lg shadow-violet-600/5"
                            : "border-border/50 bg-card hover:bg-foreground/5"
                        }`}
                      >
                        <span
                          className={`text-2xl font-black ${
                            durationMode === "custom" ? "text-violet-600" : "text-foreground/30"
                          }`}
                        >
                          ⚙️
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          Kustom
                        </span>
                        {durationMode === "custom" && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-600/20 z-10 text-white">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {durationMode === "custom" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, y: -10 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -10 }}
                          className="overflow-hidden"
                        >
                          <div className="p-6 rounded-2xl border border-border/50 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                            <div>
                              <label className="block text-xs font-black text-foreground uppercase tracking-wider mb-1">
                                Masukkan Durasi Kustom
                              </label>
                              <p className="text-[11px] text-muted-foreground font-medium">
                                Tentukan batas waktu simulasi antara {MIN_DURATION} hingga {MAX_DURATION} menit.
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={customInputValue}
                                  onChange={handleDurationInputChange}
                                  onBlur={handleDurationBlur}
                                  className="w-20 rounded-xl border border-border bg-background p-3 text-center text-sm font-black text-foreground focus:ring-2 focus:ring-violet-600 outline-none"
                                />
                                <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                                  Menit
                                </span>
                              </div>
                              {durationValidationError && (
                                <span className="text-[10px] text-red-500 font-bold">
                                  {durationValidationError}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  {/* Tempo Respons (Pacing) */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-violet-600" />
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Tempo Respons AI
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        {
                          id: "realistic",
                          label: "Natural",
                          desc: "Tempo percakapan natural dengan jeda normal layaknya telepon manusia.",
                        },
                        {
                          id: "training_fast",
                          label: "Cepat / Fast",
                          desc: "Respons super cepat minim jeda percakapan untuk latihan simulasi intensif.",
                        },
                      ].map((pacing) => {
                        const isSelected = localSettings.responsePacingMode === pacing.id;
                        return (
                          <button
                            key={pacing.id}
                            type="button"
                            onClick={() =>
                              setLocalSettings((prev) => ({
                                ...prev,
                                responsePacingMode: pacing.id as any,
                              }))
                            }
                            className={`text-left p-6 rounded-[2rem] border-2 transition-all flex flex-col gap-1.5 ${
                              isSelected
                                ? "border-violet-600 bg-violet-600/5 shadow-md shadow-violet-600/5"
                                : "border-border/50 bg-card hover:bg-foreground/5"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-black text-sm text-foreground">{pacing.label}</span>
                              {isSelected && <Check className="w-4 h-4 text-violet-600" />}
                            </div>
                            <span className="text-xs text-muted-foreground leading-relaxed font-medium">
                              {pacing.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Realistic Mode & Disruption Scenario */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Mode Simulasi Realistis
                      </h3>
                    </div>

                    <div className="bg-card rounded-[2rem] border border-border/50 p-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black text-foreground">Aktifkan Fitur Realistis</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
                            Gunakan VAD sensitif, backchanneling dinamis, interupsi aktif, dan skenario gangguan audio.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              realisticModeEnabled: !prev.realisticModeEnabled,
                            }))
                          }
                          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            localSettings.realisticModeEnabled ? "bg-violet-600" : "bg-foreground/10"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                              localSettings.realisticModeEnabled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {localSettings.realisticModeEnabled && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="pt-6 border-t border-border/50 space-y-4"
                        >
                          <div>
                            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                              Tipe Gangguan Panggilan (Pilih Maks 3)
                            </p>
                            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                              Skenario gangguan acak yang akan muncul di sepanjang durasi telepon untuk menguji kesiapan Anda.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {DISRUPTION_TYPES.map((type) => {
                              const isSelected = (
                                localSettings.realisticModeDisruptionTypes || []
                              ).includes(type.id);
                              const disabled = isDisruptionDisabled(type.id);
                              return (
                                <div
                                  key={type.id}
                                  onClick={() => {
                                    if (disabled) return;
                                    setLocalSettings((prev) => {
                                      const current = prev.realisticModeDisruptionTypes || [];
                                      const next = isSelected
                                        ? current.filter((id) => id !== type.id)
                                        : [...current, type.id];
                                      return {
                                        ...prev,
                                        realisticModeDisruptionTypes: next,
                                      };
                                    });
                                  }}
                                  className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                                    isSelected
                                      ? "border-violet-600 bg-violet-600/5 text-foreground"
                                      : disabled
                                        ? "border-border/20 bg-foreground/[0.01] text-muted-foreground/30 opacity-40 cursor-not-allowed"
                                        : "border-border/50 bg-card hover:bg-foreground/5 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  <div
                                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                      isSelected
                                        ? "bg-violet-600 border-violet-600 text-white"
                                        : "border-foreground/10 bg-foreground/5 text-transparent"
                                    }`}
                                  >
                                    <Check className="w-4.5 h-4.5" />
                                  </div>
                                  <div>
                                    <span className="text-sm font-bold block">{type.name}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <footer className="px-5 py-4 sm:px-6 sm:py-5 border-t border-border/50 flex justify-between items-center bg-foreground/[0.01] shrink-0">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Reset Default
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-600/95 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-600/20 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
