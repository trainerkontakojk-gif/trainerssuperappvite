import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Save, Microscope, Zap, User } from 'lucide-react';
import type { TelefunAppSettings } from '../telefunSettings';
import { VOICE_MODELS, VOICE_OPTIONS, CONSUMER_GENDERS, SCENARIO_PRESETS, DEFAULT_TELEFUN_SETTINGS } from '../telefunSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TelefunAppSettings;
  onSave: (newSettings: TelefunAppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<TelefunAppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'model' | 'scenario' | 'consumer'>('model');

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
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Pilih Skema Cepat</p>
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
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Nama Konsumen</span>
                <input type="text" value={localSettings.consumerName} onChange={e => setLocalSettings(prev => ({ ...prev, consumerName: e.target.value }))}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Gender Konsumen</span>
                <select value={localSettings.consumerGender} onChange={e => setLocalSettings(prev => ({ ...prev, consumerGender: e.target.value }))}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-indigo-500 transition-colors">
                  {CONSUMER_GENDERS.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
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
