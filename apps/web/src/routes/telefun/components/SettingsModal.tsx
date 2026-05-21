import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Save, Microscope, Zap, User, Plus, Trash2, Edit2, Check } from 'lucide-react';
import type { TelefunAppSettings, TelefunScenario, TelefunConsumerType } from '../telefunSettings';
import { VOICE_MODELS, VOICE_OPTIONS, CONSUMER_GENDERS, SCENARIO_PRESETS, DEFAULT_TELEFUN_SETTINGS, DEFAULT_CONSUMER_TYPES } from '../telefunSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TelefunAppSettings;
  onSave: (newSettings: TelefunAppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<TelefunAppSettings>(() => ({
    ...DEFAULT_TELEFUN_SETTINGS,
    ...settings,
    scenarios: settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
    consumerTypes: settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
  }));
  const [activeTab, setActiveTab] = useState<'model' | 'scenario' | 'consumer'>('model');
  const [editingScenario, setEditingScenario] = useState<{ id?: string; title: string; instruction: string } | null>(null);
  const [editingConsumer, setEditingConsumer] = useState<{ id?: string; name: string; gender: string; description: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const applyPreset = (preset: typeof SCENARIO_PRESETS[0]) => {
    setLocalSettings(prev => ({
      ...prev,
      systemInstruction: preset.instruction,
      scenarioTitle: preset.title,
    }));
  };

  const handleEditScenario = (s?: TelefunScenario) => {
    setEditingScenario(s ? { id: s.id, title: s.title, instruction: s.instruction } : { title: '', instruction: '' });
  };

  const handleSaveScenario = () => {
    if (!editingScenario || !editingScenario.title.trim()) return;
    setLocalSettings(prev => {
      const scenarios = editingScenario.id
        ? prev.scenarios.map(s => s.id === editingScenario.id ? { ...s, title: editingScenario.title, instruction: editingScenario.instruction } : s)
        : [...prev.scenarios, { id: `s-${Date.now()}`, title: editingScenario.title, instruction: editingScenario.instruction, isActive: true }];
      return { ...prev, scenarios };
    });
    setEditingScenario(null);
  };

  const handleDeleteScenario = (id: string) => {
    if (!window.confirm('Hapus skenario ini?')) return;
    setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.filter(s => s.id !== id) }));
  };

  const handleEditConsumer = (c?: TelefunConsumerType) => {
    setEditingConsumer(c ? { id: c.id, name: c.name, gender: c.gender, description: c.description } : { name: '', gender: 'male', description: '' });
  };

  const handleSaveConsumer = () => {
    if (!editingConsumer || !editingConsumer.name.trim()) return;
    setLocalSettings(prev => {
      const consumerTypes = editingConsumer.id
        ? prev.consumerTypes.map(c => c.id === editingConsumer.id ? { ...c, name: editingConsumer.name, gender: editingConsumer.gender, description: editingConsumer.description } : c)
        : [...prev.consumerTypes, { id: `c-${Date.now()}`, name: editingConsumer.name, gender: editingConsumer.gender, description: editingConsumer.description }];
      return { ...prev, consumerTypes };
    });
    setEditingConsumer(null);
  };

  const handleDeleteConsumer = (id: string) => {
    if (!window.confirm('Hapus tipe konsumen ini?')) return;
    setLocalSettings(prev => ({ ...prev, consumerTypes: prev.consumerTypes.filter(c => c.id !== id) }));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg rounded-[2rem] overflow-hidden flex flex-col max-h-[86vh] shadow-2xl shadow-black/10 bg-card border border-border/50">
        <header className="px-5 py-4 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">Pengaturan Telefun</h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Konfigurasi simulasi panggilan voice.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-foreground/5 rounded-xl transition-all border border-transparent hover:border-foreground/10">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <div className="flex border-b">
          {([
            { id: 'model', label: 'Model & Voice', icon: Zap },
            { id: 'scenario', label: 'Skema', icon: Microscope },
            { id: 'consumer', label: 'Konsumen', icon: User },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === tab.id ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {activeTab === 'model' && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Model AI</span>
                <select value={localSettings.selectedModel} onChange={e => setLocalSettings(prev => ({ ...prev, selectedModel: e.target.value }))}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors">
                  {VOICE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Suara AI</span>
                <select value={localSettings.voiceName} onChange={e => setLocalSettings(prev => ({ ...prev, voiceName: e.target.value }))}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors">
                  {VOICE_OPTIONS.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {activeTab === 'scenario' && (
            <>
              {editingScenario ? (
                <div className="space-y-4 bg-indigo-50/50 rounded-xl p-4 border border-indigo-200">
                  <h4 className="text-sm font-bold text-indigo-800">{editingScenario.id ? 'Edit Skenario' : 'Skenario Baru'}</h4>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">Judul Skenario</span>
                    <input type="text" value={editingScenario.title} onChange={e => setEditingScenario(prev => prev ? { ...prev, title: e.target.value } : null)}
                      className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Nama skenario..." />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">Instruksi Sistem</span>
                    <textarea value={editingScenario.instruction} onChange={e => setEditingScenario(prev => prev ? { ...prev, instruction: e.target.value } : null)}
                      rows={3} className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors resize-none"
                      placeholder="Deskripsi skenario dan instruksi untuk AI..." />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingScenario(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Batal</button>
                    <button onClick={handleSaveScenario} disabled={!editingScenario.title.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50">
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Preset</p>
                    <div className="grid gap-2">
                      {SCENARIO_PRESETS.map(preset => (
                        <button key={preset.title} onClick={() => applyPreset(preset)}
                          className={`text-left w-full rounded-xl border px-4 py-3 text-sm transition-all ${
                            localSettings.scenarioTitle === preset.title
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-border/50 bg-background hover:border-indigo-300 text-foreground'
                          }`}>
                          <span className="font-bold block">{preset.title}</span>
                          <span className="text-xs text-muted-foreground mt-1 block line-clamp-2">{preset.instruction}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">Skenario Kustom</p>
                      <button onClick={() => handleEditScenario()} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                        <Plus className="w-3 h-3" /> Tambah
                      </button>
                    </div>
                    {localSettings.scenarios.filter(s => !s.id.startsWith('preset-')).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">Belum ada skenario kustom.</p>
                    ) : (
                      <div className="space-y-1">
                        {localSettings.scenarios.filter(s => !s.id.startsWith('preset-')).map(s => (
                          <div key={s.id} className="flex items-start justify-between rounded-xl border border-border/50 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-foreground">{s.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.instruction}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <button onClick={() => { setLocalSettings(prev => ({ ...prev, systemInstruction: s.instruction, scenarioTitle: s.title })); }}
                                className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${localSettings.scenarioTitle === s.title ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                                Pakai
                              </button>
                              <button onClick={() => handleEditScenario(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteScenario(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Instruksi Sistem (Custom)</span>
                <textarea value={localSettings.systemInstruction} onChange={e => setLocalSettings(prev => ({ ...prev, systemInstruction: e.target.value, scenarioTitle: prev.scenarioTitle || 'Custom' }))}
                  rows={4}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors resize-none" />
              </label>
            </>
          )}

          {activeTab === 'consumer' && (
            <>
              {editingConsumer ? (
                <div className="space-y-4 bg-indigo-50/50 rounded-xl p-4 border border-indigo-200">
                  <h4 className="text-sm font-bold text-indigo-800">{editingConsumer.id ? 'Edit Konsumen' : 'Tipe Konsumen Baru'}</h4>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nama</span>
                    <input type="text" value={editingConsumer.name} onChange={e => setEditingConsumer(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">Gender</span>
                    <select value={editingConsumer.gender} onChange={e => setEditingConsumer(prev => prev ? { ...prev, gender: e.target.value } : null)}
                      className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors">
                      {CONSUMER_GENDERS.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">Deskripsi / Karakteristik</span>
                    <textarea value={editingConsumer.description} onChange={e => setEditingConsumer(prev => prev ? { ...prev, description: e.target.value } : null)}
                      rows={2} className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors resize-none" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingConsumer(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Batal</button>
                    <button onClick={handleSaveConsumer} disabled={!editingConsumer.name.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50">
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Tipe Konsumen</p>
                    <button onClick={() => handleEditConsumer()} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                      <Plus className="w-3 h-3" /> Tambah
                    </button>
                  </div>
                  <div className="space-y-1">
                    {localSettings.consumerTypes.map(c => (
                      <div key={c.id} className="flex items-start justify-between rounded-xl border border-border/50 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground">{c.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold">{c.gender === 'male' ? 'Laki-laki' : 'Perempuan'}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{c.description}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <button onClick={() => { setLocalSettings(prev => ({ ...prev, consumerName: c.name, consumerGender: c.gender })); }}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${localSettings.consumerName === c.name ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                            Pakai
                          </button>
                          <button onClick={() => handleEditConsumer(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteConsumer(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Konsumen Aktif</p>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nama</span>
                      <input type="text" value={localSettings.consumerName} onChange={e => setLocalSettings(prev => ({ ...prev, consumerName: e.target.value }))}
                        className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-muted-foreground">Gender</span>
                      <select value={localSettings.consumerGender} onChange={e => setLocalSettings(prev => ({ ...prev, consumerGender: e.target.value }))}
                        className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors">
                        {CONSUMER_GENDERS.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <footer className="px-5 sm:px-6 py-4 border-t flex items-center justify-between shrink-0">
          <button onClick={() => { setLocalSettings({ ...DEFAULT_TELEFUN_SETTINGS }); }} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Reset Default
          </button>
          <button onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">
            <Save className="w-4 h-4" />
            Simpan
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
