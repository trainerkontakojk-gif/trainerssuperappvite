import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Settings,
  Save,
  Microscope,
  Zap,
  User,
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  Clock,
  ShieldCheck,
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
  CONSUMER_GENDERS,
  SCENARIO_PRESETS,
  DEFAULT_TELEFUN_SETTINGS,
  DISRUPTION_TYPES,
} from "../telefunSettings";

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
  const [localSettings, setLocalSettings] = useState<TelefunAppSettings>(
    () => ({
      ...DEFAULT_TELEFUN_SETTINGS,
      ...settings,
      scenarios: settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
      consumerTypes:
        settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
    }),
  );
  const [activeTab, setActiveTab] = useState<
    "scenario" | "consumer" | "identity" | "system"
  >("scenario");
  const [editingScenario, setEditingScenario] = useState<{
    id?: string;
    title: string;
    instruction: string;
  } | null>(null);
  const [editingConsumer, setEditingConsumer] = useState<{
    id?: string;
    name: string;
    gender: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings({
        ...DEFAULT_TELEFUN_SETTINGS,
        ...settings,
        scenarios: settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
        consumerTypes:
          settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
      });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const applyPreset = (preset: (typeof SCENARIO_PRESETS)[0]) => {
    setLocalSettings((prev) => ({
      ...prev,
      systemInstruction: preset.instruction,
      scenarioTitle: preset.title,
    }));
  };

  const handleEditScenario = (s?: TelefunScenario) => {
    setEditingScenario(
      s
        ? { id: s.id, title: s.title, instruction: s.instruction }
        : { title: "", instruction: "" },
    );
  };

  const handleSaveScenario = () => {
    if (!editingScenario || !editingScenario.title.trim()) return;
    setLocalSettings((prev) => {
      const scenarios = editingScenario.id
        ? prev.scenarios.map((s) =>
            s.id === editingScenario.id
              ? {
                  ...s,
                  title: editingScenario.title,
                  instruction: editingScenario.instruction,
                }
              : s,
          )
        : [
            ...prev.scenarios,
            {
              id: `s-${Date.now()}`,
              title: editingScenario.title,
              instruction: editingScenario.instruction,
              isActive: true,
            },
          ];
      return { ...prev, scenarios };
    });
    setEditingScenario(null);
  };

  const handleDeleteScenario = (id: string) => {
    if (!window.confirm("Hapus skenario ini?")) return;
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.filter((s) => s.id !== id),
    }));
  };

  const handleEditConsumer = (c?: TelefunConsumerType) => {
    setEditingConsumer(
      c
        ? {
            id: c.id,
            name: c.name,
            gender: c.gender,
            description: c.description,
          }
        : { name: "", gender: "male", description: "" },
    );
  };

  const handleSaveConsumer = () => {
    if (!editingConsumer || !editingConsumer.name.trim()) return;
    setLocalSettings((prev) => {
      const consumerTypes = editingConsumer.id
        ? prev.consumerTypes.map((c) =>
            c.id === editingConsumer.id
              ? {
                  ...c,
                  name: editingConsumer.name,
                  gender: editingConsumer.gender,
                  description: editingConsumer.description,
                }
              : c,
          )
        : [
            ...prev.consumerTypes,
            {
              id: `c-${Date.now()}`,
              name: editingConsumer.name,
              gender: editingConsumer.gender,
              description: editingConsumer.description,
            },
          ];
      return { ...prev, consumerTypes };
    });
    setEditingConsumer(null);
  };

  const handleDeleteConsumer = (id: string) => {
    if (!window.confirm("Hapus tipe konsumen ini?")) return;
    setLocalSettings((prev) => ({
      ...prev,
      consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
    }));
  };

  return (
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
        className="relative w-full max-w-2xl rounded-[2rem] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl bg-white border border-gray-200"
      >
        <header className="px-6 py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <Settings className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                Pengaturan Telefun
              </h2>
              <p className="text-sm text-gray-500 font-medium">
                Konfigurasi simulasi panggilan voice.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-gray-200"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </header>

        <div className="flex border-b overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              { id: "scenario", label: "Skema", icon: Microscope },
              { id: "consumer", label: "Tipe Karakter", icon: Users },
              { id: "identity", label: "Identitas", icon: User },
              { id: "system", label: "Sistem", icon: Zap },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-4 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap min-w-[100px] ${
                activeTab === tab.id
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "scenario" && (
            <>
              {editingScenario ? (
                <div className="space-y-4 bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900">
                    {editingScenario.id ? "Edit Skenario" : "Skenario Baru"}
                  </h4>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                      Judul Skenario
                    </span>
                    <input
                      type="text"
                      value={editingScenario.title}
                      onChange={(e) =>
                        setEditingScenario((prev) =>
                          prev ? { ...prev, title: e.target.value } : null,
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Nama skenario..."
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                      Instruksi Sistem
                    </span>
                    <textarea
                      value={editingScenario.instruction}
                      onChange={(e) =>
                        setEditingScenario((prev) =>
                          prev
                            ? { ...prev, instruction: e.target.value }
                            : null,
                        )
                      }
                      rows={4}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors resize-none"
                      placeholder="Deskripsi skenario dan instruksi untuk AI..."
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingScenario(null)}
                      className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSaveScenario}
                      disabled={!editingScenario.title.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                    >
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Preset Skenario
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SCENARIO_PRESETS.map((preset) => (
                        <button
                          key={preset.title}
                          onClick={() => applyPreset(preset)}
                          className={`text-left rounded-2xl border-2 px-5 py-4 transition-all duration-200 ${
                            localSettings.scenarioTitle === preset.title
                              ? "border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-500/10"
                              : "border-gray-100 bg-gray-50 hover:border-indigo-200 hover:bg-white text-gray-600"
                          }`}
                        >
                          <span className="font-bold block text-sm text-indigo-900">
                            {preset.title}
                          </span>
                          <span className="text-xs text-gray-500 mt-1.5 block line-clamp-2 leading-relaxed">
                            {preset.instruction}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Skenario Kustom
                      </p>
                      <button
                        onClick={() => handleEditScenario()}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Skenario
                      </button>
                    </div>
                    {localSettings.scenarios.filter(
                      (s) => !s.id.startsWith("preset-"),
                    ).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                        <p className="text-sm text-gray-400 font-medium italic">
                          Belum ada skenario kustom.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {localSettings.scenarios
                          .filter((s) => !s.id.startsWith("preset-"))
                          .map((s) => (
                            <div
                              key={s.id}
                              className="flex items-start justify-between rounded-2xl border border-gray-100 bg-white p-5 hover:border-indigo-200 transition-all"
                            >
                              <div className="flex-1 min-w-0 pr-4">
                                <p className="text-sm font-bold text-gray-900">
                                  {s.title}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-1">
                                  {s.instruction}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => {
                                    setLocalSettings((prev) => ({
                                      ...prev,
                                      systemInstruction: s.instruction,
                                      scenarioTitle: s.title,
                                    }));
                                  }}
                                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${localSettings.scenarioTitle === s.title ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"}`}
                                >
                                  Pakai
                                </button>
                                <button
                                  onClick={() => handleEditScenario(s)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteScenario(s.id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "consumer" && (
            <>
              {editingConsumer ? (
                <div className="space-y-4 bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900">
                    {editingConsumer.id
                      ? "Edit Tipe Karakter"
                      : "Tipe Karakter Baru"}
                  </h4>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                      Nama Profil
                    </span>
                    <input
                      type="text"
                      value={editingConsumer.name}
                      onChange={(e) =>
                        setEditingConsumer((prev) =>
                          prev ? { ...prev, name: e.target.value } : null,
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                      Gender Bawaan
                    </span>
                    <select
                      value={editingConsumer.gender}
                      onChange={(e) =>
                        setEditingConsumer((prev) =>
                          prev ? { ...prev, gender: e.target.value } : null,
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    >
                      {CONSUMER_GENDERS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                      Deskripsi / Karakteristik
                    </span>
                    <textarea
                      value={editingConsumer.description}
                      onChange={(e) =>
                        setEditingConsumer((prev) =>
                          prev
                            ? { ...prev, description: e.target.value }
                            : null,
                        )
                      }
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingConsumer(null)}
                      className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSaveConsumer}
                      disabled={!editingConsumer.name.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                    >
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Tipe Karakter Konsumen
                    </p>
                    <button
                      onClick={() => handleEditConsumer()}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Karakter
                    </button>
                  </div>
                  <div className="grid gap-3">
                    {localSettings.consumerTypes.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between rounded-2xl border border-gray-100 bg-white p-5 hover:border-indigo-200 transition-all"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">
                              {c.name}
                            </p>
                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                              {c.gender === "male" ? "Pria" : "Wanita"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
                            {c.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setLocalSettings((prev) => ({
                                ...prev,
                                consumerName: c.name,
                                consumerGender: c.gender,
                                preferredConsumerTypeId: c.id,
                              }));
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${localSettings.preferredConsumerTypeId === c.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"}`}
                          >
                            Pakai
                          </button>
                          <button
                            onClick={() => handleEditConsumer(c)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteConsumer(c.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "identity" && (
            <div className="space-y-6">
              <div className="bg-indigo-50/30 rounded-2xl p-6 border border-indigo-100 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Identitas Aktif</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Konfigurasi identitas konsumen untuk simulasi panggilan.
                    Kosongkan untuk menggunakan identitas acak.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Nama Lengkap
                  </span>
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Kosongkan untuk acak"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Gender
                  </span>
                  <select
                    value={localSettings.identitySettings?.gender || "random"}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        identitySettings: {
                          ...prev.identitySettings,
                          gender: e.target.value as any,
                        },
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="random">Acak</option>
                    {CONSUMER_GENDERS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Nomor Telepon
                  </span>
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Kosongkan untuk acak"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Kota
                  </span>
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Kosongkan untuk acak"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Nama Tanda Tangan
                  </span>
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Nama untuk tanda tangan"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Suara AI
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {VOICE_OPTIONS.filter((v) => {
                      const gender = localSettings.identitySettings?.gender;
                      if (gender === "male")
                        return (MALE_VOICES as readonly string[]).includes(
                          v.id,
                        );
                      if (gender === "female")
                        return (FEMALE_VOICES as readonly string[]).includes(
                          v.id,
                        );
                      return true;
                    }).map((v) => (
                      <button
                        key={v.id}
                        onClick={() =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            identitySettings: {
                              ...prev.identitySettings,
                              voiceName: v.id,
                            },
                          }))
                        }
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          (localSettings.identitySettings?.voiceName || "") ===
                          v.id
                            ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                            : "border-gray-100 bg-gray-50 text-gray-600 hover:border-indigo-200 hover:bg-white"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase">
                    Model Suara (Fallback)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {VOICE_OPTIONS.map((v) => (
                      <button
                        key={v.id}
                        onClick={() =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            voiceName: v.id,
                          }))
                        }
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          localSettings.voiceName === v.id
                            ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                            : "border-gray-100 bg-gray-50 text-gray-600 hover:border-indigo-200 hover:bg-white"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-8">
              {/* AI Model */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                    Model AI
                  </h3>
                </div>
                <div className="grid gap-3">
                  {VOICE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          selectedModel: m.id,
                          telefunModelId: m.id,
                        }))
                      }
                      className={`text-left w-full rounded-2xl border-2 px-5 py-4 transition-all duration-200 ${
                        localSettings.selectedModel === m.id
                          ? "border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-500/10"
                          : "border-gray-100 bg-gray-50 hover:border-indigo-200 hover:bg-white text-gray-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold block text-sm text-indigo-900">
                          {m.name}
                        </span>
                        {localSettings.selectedModel === m.id && (
                          <Check className="w-4 h-4 text-indigo-600" />
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1.5 block font-bold uppercase tracking-widest">
                        {m.id.includes("3.1") ? "Next Gen" : "Standard"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Transport Protocol */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                    Protokol Voice
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      id: "gemini-live",
                      label: "Gemini Live WS",
                      desc: "Direct WebRTC/WS",
                    },
                    {
                      id: "openai-audio",
                      label: "OpenAI Realtime API",
                      desc: "Skenario khusus",
                    },
                  ].map((transport) => (
                    <button
                      key={transport.id}
                      onClick={() =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          telefunTransport: transport.id as any,
                        }))
                      }
                      className={`text-left p-4 rounded-2xl border-2 transition-all ${
                        (localSettings.telefunTransport || "gemini-live") ===
                        transport.id
                          ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10"
                          : "border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-200"
                      }`}
                    >
                      <p
                        className={`text-sm font-bold ${(localSettings.telefunTransport || "gemini-live") === transport.id ? "text-blue-900" : "text-gray-900"}`}
                      >
                        {transport.label}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {transport.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Simulation Duration */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                    Durasi Simulasi
                  </h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[3, 5, 10, 0].map((mins) => (
                    <button
                      key={mins}
                      onClick={() =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          maxCallDuration: mins,
                        }))
                      }
                      className={`px-4 py-3 rounded-2xl border-2 text-sm font-bold transition-all ${
                        localSettings.maxCallDuration === mins
                          ? "border-orange-500 bg-orange-50 text-orange-700 shadow-lg shadow-orange-500/10"
                          : "border-gray-100 bg-gray-50 text-gray-600 hover:border-orange-200"
                      }`}
                    >
                      {mins === 0 ? "Tanpa Batas" : `${mins} Menit`}
                    </button>
                  ))}
                </div>
              </section>

              {/* Tempo & Realistic Mode */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                    Mode Simulasi Realistis
                  </h3>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        Aktifkan Fitur Realistis
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Gunakan VAD sensitif, backchanneling, dan interupsi.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          realisticModeEnabled: !prev.realisticModeEnabled,
                        }))
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        localSettings.realisticModeEnabled
                          ? "bg-indigo-600"
                          : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          localSettings.realisticModeEnabled
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {localSettings.realisticModeEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="pt-4 border-t space-y-4"
                    >
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Tipe Gangguan (Maks 3)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {DISRUPTION_TYPES.map((type) => {
                          const isSelected =
                            localSettings.realisticModeDisruptionTypes.includes(
                              type.id,
                            );
                          const isDisabled =
                            !isSelected &&
                            localSettings.realisticModeDisruptionTypes.length >=
                              3;
                          return (
                            <button
                              key={type.id}
                              disabled={isDisabled}
                              onClick={() => {
                                setLocalSettings((prev) => {
                                  const current =
                                    prev.realisticModeDisruptionTypes;
                                  const next = isSelected
                                    ? current.filter((id) => id !== type.id)
                                    : [...current, type.id];
                                  return {
                                    ...prev,
                                    realisticModeDisruptionTypes: next,
                                  };
                                });
                              }}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                  : isDisabled
                                    ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                                    : "border-gray-100 bg-gray-50 text-gray-600 hover:border-indigo-200"
                              }`}
                            >
                              {isSelected ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <div className="w-3.5 h-3.5" />
                              )}
                              {type.name}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  <div className="pt-4 border-t space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Tempo Respons
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: "realistic",
                          label: "Natural",
                          desc: "Jeda normal",
                        },
                        {
                          id: "training_fast",
                          label: "Cepat",
                          desc: "Minim jeda",
                        },
                      ].map((pacing) => (
                        <button
                          key={pacing.id}
                          onClick={() =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              responsePacingMode: pacing.id as any,
                            }))
                          }
                          className={`text-left p-4 rounded-2xl border-2 transition-all ${
                            localSettings.responsePacingMode === pacing.id
                              ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10"
                              : "border-gray-100 bg-gray-50 text-gray-600"
                          }`}
                        >
                          <p
                            className={`text-sm font-bold ${localSettings.responsePacingMode === pacing.id ? "text-indigo-900" : "text-gray-900"}`}
                          >
                            {pacing.label}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {pacing.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="px-6 py-5 border-t flex items-center justify-between bg-gray-50 shrink-0">
          <button
            onClick={() => {
              if (window.confirm("Reset semua pengaturan ke default?"))
                setLocalSettings({ ...DEFAULT_TELEFUN_SETTINGS });
            }}
            className="text-xs font-bold text-gray-400 hover:text-red-600 transition-colors uppercase tracking-widest"
          >
            Reset Default
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/25"
            >
              <Save className="w-4 h-4" />
              Simpan Perubahan
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
