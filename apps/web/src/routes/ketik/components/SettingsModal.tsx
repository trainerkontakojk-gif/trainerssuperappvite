import { useState, useEffect, useRef } from 'react';
import type { KetikAppSettings, KetikScenario, KetikConsumerType, KetikQuickTemplate } from '@trainers/types';
import { DEFAULT_KETIK_SETTINGS } from '@trainers/types';
import { Clock, Trash2, X, Plus, Check, Edit2, RotateCcw, Save, Image as ImageIcon, Settings, FileText, Users, Fingerprint, Zap, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { notify } from '../../../lib/toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: KetikAppSettings;
  onSave: (newSettings: KetikAppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'consumers' | 'identity' | 'system' | 'template'>('scenarios');
  const [localSettings, setLocalSettings] = useState<KetikAppSettings>(() => ({
    ...settings,
    quickTemplates: settings.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates,
  }));
  const [isScenarioFormOpen, setIsScenarioFormOpen] = useState(false);
  const [isConsumerFormOpen, setIsConsumerFormOpen] = useState(false);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [newScenarioCategory, setNewScenarioCategory] = useState('');
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [newScenarioScript, setNewScenarioScript] = useState('');
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);
  const [newScenarioImages, setNewScenarioImages] = useState<string[]>([]);
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(null);
  const [newConsumerName, setNewConsumerName] = useState('');
  const [newConsumerDesc, setNewConsumerDesc] = useState('');
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<'Mudah' | 'Sedang' | 'Sulit'>('Sedang');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [newTemplateKeyword, setNewTemplateKeyword] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [customInputValue, setCustomInputValue] = useState('');
  const [durationValidationError, setDurationValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const PRESET_DURATIONS = [5, 10, 15];
  const MIN_DURATION = 1;
  const MAX_DURATION = 60;

  const classifyDurationMode = (val: number | undefined): 'preset' | 'custom' => {
    const d = Number(val);
    if (isNaN(d)) return 'custom';
    return (PRESET_DURATIONS as number[]).includes(d) ? 'preset' : 'custom';
  };

  const durationMode = classifyDurationMode(localSettings.simulationDuration);

  const handlePresetClick = (d: number) => {
    setCustomInputValue('');
    setDurationValidationError(null);
    setLocalSettings(prev => ({ ...prev, simulationDuration: d }));
  };

  const handleCustomClick = () => {
    const current = localSettings.simulationDuration;
    setCustomInputValue(current ? String(current) : '');
    setDurationValidationError(null);
  };

  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const filtered = raw.replace(/[^0-9]/g, '');
    setCustomInputValue(filtered);
    setDurationValidationError(null);
    const num = parseInt(filtered, 10);
    if (filtered.length > 0 && !isNaN(num) && num >= MIN_DURATION && num <= MAX_DURATION) {
      setLocalSettings(prev => ({ ...prev, simulationDuration: num }));
    }
  };

  const handleDurationBlur = () => {
    const num = parseInt(customInputValue, 10);
    if (isNaN(num) || num < MIN_DURATION || num > MAX_DURATION) {
      setDurationValidationError(`Masukkan angka ${MIN_DURATION}-${MAX_DURATION}.`);
      setLocalSettings(prev => ({ ...prev, simulationDuration: clampDuration(prev.simulationDuration) }));
      return;
    }
    setCustomInputValue(String(num));
    setDurationValidationError(null);
    setLocalSettings(prev => ({ ...prev, simulationDuration: num }));
  };

  const clampDuration = (val: number | undefined): number => {
    const d = Number(val);
    if (isNaN(d) || d < MIN_DURATION) return MIN_DURATION;
    if (d > MAX_DURATION) return MAX_DURATION;
    return d;
  };

  const TEXT_MODELS = [
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Cepat dan efisien untuk simulasi chat ringan.', provider: 'gemini' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Model Gemini terbaru dengan performa tinggi.', provider: 'gemini' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', description: 'Model terbesar dengan kemampuan analisis mendalam.', provider: 'gemini' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Model ringan dengan kecepatan respons tinggi.', provider: 'gemini' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', description: 'Model open-source 120B parameter gratis.', provider: 'openrouter' },
    { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (OpenRouter)', description: 'Gemini Flash Lite via OpenRouter.', provider: 'openrouter' },
    { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (OpenRouter)', description: 'Gemini Flash Lite 2.0 via OpenRouter.', provider: 'openrouter' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Model ringan OpenAI dengan performa solid.', provider: 'openrouter' },
    { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen 3.5 Flash', description: 'Model Qwen cepat dengan kualitas baik.', provider: 'openrouter' },
  ];

  const handleIdentityChange = (field: string, value: string) => {
    setLocalSettings(prev => ({ ...prev, identitySettings: { ...prev.identitySettings, [field]: value } }));
  };

  useEffect(() => {
    if (isOpen) {
      setLocalSettings({ ...settings, quickTemplates: settings.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates || [] });
      setIsScenarioFormOpen(false);
      setIsConsumerFormOpen(false);
      setIsTemplateFormOpen(false);
      setEditingScenarioId(null);
      setEditingConsumerId(null);
      setEditingTemplateId(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(localSettings.scenarios.map(s => s.category)));
  const activeCount = localSettings.scenarios.filter(s => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleSelectAll = () => setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.map(s => ({ ...s, isActive: true })) }));
  const handleUnselectAll = () => setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.map(s => ({ ...s, isActive: false })) }));
  const handleToggleScenario = (id: string) => setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s) }));
  const handleDeleteScenario = (id: string) => { if (window.confirm('Hapus skenario ini?')) setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.filter(s => s.id !== id) })); };
  const handleSelectConsumerType = (id: string) => setLocalSettings(prev => ({ ...prev, activeConsumerTypeId: id }));

  const resetScenarioForm = () => { setEditingScenarioId(null); setNewScenarioTitle(''); setNewScenarioDesc(''); setNewScenarioScript(''); setIsScenarioScriptEnabled(false); setNewScenarioCategory(''); setNewScenarioImages([]); setIsNewCategoryInput(false); };
  const handleEditScenario = (scenario: KetikScenario) => {
    setEditingScenarioId(scenario.id); setNewScenarioCategory(scenario.category); setNewScenarioTitle(scenario.title);
    setNewScenarioDesc(scenario.description); setNewScenarioScript(scenario.script || ''); setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
    setNewScenarioImages(scenario.images || []); setIsNewCategoryInput(!categories.includes(scenario.category)); setIsScenarioFormOpen(true);
    setTimeout(() => document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const handleSaveScenario = () => {
    if (!newScenarioTitle || !newScenarioDesc) return;
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || 'Umum';
    if (editingScenarioId) {
      setLocalSettings(prev => ({ ...prev, scenarios: prev.scenarios.map(s => s.id === editingScenarioId ? { ...s, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', images: newScenarioImages } : s) }));
    } else {
      setLocalSettings(prev => ({ ...prev, scenarios: [...prev.scenarios, { id: `s-${Date.now()}`, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', isActive: true, images: newScenarioImages }] }));
    }
    resetScenarioForm(); setIsScenarioFormOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        if (file.size > 500 * 1024) { notify.error(`File ${file.name} terlalu besar (>500KB). Mohon kompres gambar terlebih dahulu.`); return; }
        const reader = new FileReader();
        reader.onloadend = () => setNewScenarioImages(prev => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    }
  };

  const resetConsumerForm = () => { setEditingConsumerId(null); setNewConsumerName(''); setNewConsumerDesc(''); setNewConsumerDifficulty('Sedang'); };
  const handleEditConsumer = (consumer: KetikConsumerType) => { setEditingConsumerId(consumer.id); setNewConsumerName(consumer.name); setNewConsumerDesc(consumer.description); setNewConsumerDifficulty(consumer.difficulty); setIsConsumerFormOpen(true); setTimeout(() => document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' }), 100); };
  const handleSaveConsumer = () => {
    if (!newConsumerName || !newConsumerDesc) return;
    if (editingConsumerId) {
      setLocalSettings(prev => ({ ...prev, consumerTypes: prev.consumerTypes.map(c => c.id === editingConsumerId ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty } : c) }));
    } else {
      setLocalSettings(prev => ({ ...prev, consumerTypes: [...prev.consumerTypes, { id: `c-${Date.now()}`, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty, isCustom: true }] }));
    }
    resetConsumerForm(); setIsConsumerFormOpen(false);
  };
  const handleDeleteConsumer = (id: string) => {
    if (window.confirm('Hapus karakteristik ini?')) {
      setLocalSettings(prev => ({ ...prev, consumerTypes: prev.consumerTypes.filter(c => c.id !== id), activeConsumerTypeId: prev.activeConsumerTypeId === id ? 'random' : prev.activeConsumerTypeId }));
    }
  };

  const handleSaveTemplate = () => {
    if (!newTemplateKeyword || !newTemplateContent) return;
    const sanitizedKeyword = newTemplateKeyword.trim().toLowerCase().replace(/\s+/g, '-');
    const tmpl: KetikQuickTemplate = { id: editingTemplateId || `qt-${Date.now()}`, keyword: sanitizedKeyword, content: newTemplateContent.trim() };
    setLocalSettings(prev => ({ ...prev, quickTemplates: editingTemplateId ? (prev.quickTemplates || []).map(t => t.id === editingTemplateId ? tmpl : t) : [...(prev.quickTemplates || []), tmpl] }));
    setEditingTemplateId(null); setNewTemplateKeyword(''); setNewTemplateContent(''); setIsTemplateFormOpen(false);
  };
  const handleDeleteTemplate = (id: string) => { if (window.confirm('Hapus template ini?')) setLocalSettings(prev => ({ ...prev, quickTemplates: (prev.quickTemplates || []).filter(t => t.id !== id) })); };

  const isScenarioDraftDirty = () => isScenarioFormOpen;
  const isScenarioDraftValid = () => !!(newScenarioTitle && newScenarioDesc);
  const isConsumerDraftDirty = () => isConsumerFormOpen;
  const isConsumerDraftValid = () => !!(newConsumerName && newConsumerDesc);
  const isTemplateDirty = () => isTemplateFormOpen;

  const handleSave = () => {
    if (isScenarioDraftDirty() && !isScenarioDraftValid()) {
      setActiveTab('scenarios');
      setTimeout(() => document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      notify.warning('Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.');
      return;
    }
    if (isConsumerDraftDirty() && !isConsumerDraftValid()) {
      setActiveTab('consumers');
      setTimeout(() => document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
      notify.warning('Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.');
      return;
    }
    if (isTemplateDirty() && (!newTemplateKeyword || !newTemplateContent)) {
      setActiveTab('template');
      setTimeout(() => document.getElementById('template-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
      notify.warning('Template yang sedang Anda buat belum lengkap. Isi keyword dan konten terlebih dahulu, atau klik Batal untuk membatalkan template.');
      return;
    }

    let finalSettings = localSettings;
    if (isScenarioDraftDirty() && isScenarioDraftValid()) {
      const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || 'Umum';
      if (editingScenarioId) {
        finalSettings = { ...finalSettings, scenarios: finalSettings.scenarios.map(s => s.id === editingScenarioId ? { ...s, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', images: newScenarioImages } : s) };
      } else {
        finalSettings = { ...finalSettings, scenarios: [...finalSettings.scenarios, { id: `s-${Date.now()}`, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', isActive: true, images: newScenarioImages }] };
      }
    }
    if (isConsumerDraftDirty() && isConsumerDraftValid()) {
      if (editingConsumerId) {
        finalSettings = { ...finalSettings, consumerTypes: finalSettings.consumerTypes.map(c => c.id === editingConsumerId ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty } : c) };
      } else {
        finalSettings = { ...finalSettings, consumerTypes: [...finalSettings.consumerTypes, { id: `c-${Date.now()}`, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty, isCustom: true }] };
      }
    }
    if (isScenarioDraftDirty()) { resetScenarioForm(); setIsScenarioFormOpen(false); }
    if (isConsumerDraftDirty()) { resetConsumerForm(); setIsConsumerFormOpen(false); }
    if (isTemplateDirty()) { setEditingTemplateId(null); setNewTemplateKeyword(''); setNewTemplateContent(''); setIsTemplateFormOpen(false); }

    onSave(finalSettings);
    onClose();
  };

  const handleResetDefaults = () => {
    if (window.confirm('Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.')) setLocalSettings(DEFAULT_KETIK_SETTINGS);
  };

  const tabs = [
    { id: 'scenarios', label: 'Masalah', icon: FileText },
    { id: 'consumers', label: 'Karakter', icon: Users },
    { id: 'identity', label: 'Identitas', icon: Fingerprint },
    { id: 'template', label: 'Template', icon: MessageSquare },
    { id: 'system', label: 'Sistem', icon: Settings },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div data-module="ketik" className="module-clean-app fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-4xl max-h-[86vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-black/10 bg-card border border-border/50">
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Pengaturan Simulasi</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Module KETIK</span>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0">
              <div className="flex p-2 rounded-2xl bg-foreground/[0.02] border border-border/50">
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative group ${activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                    {activeTab === tab.id && (
                      <motion.div layoutId="activeTabKetik" className="absolute inset-0 bg-background shadow-sm rounded-xl" transition={{ type: 'spring', bounce: 0.15, duration: 0.6 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 sm:pb-8">
              {activeTab === 'scenarios' && (
                <div className="space-y-8 pb-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-card/50 p-6 rounded-[2rem] border border-border/50">
                    <div>
                      <h3 className="font-black text-foreground text-xl tracking-tighter">Daftar Skenario</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1 opacity-80">{activeCount} / {totalScenarios} AKTIF</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={handleSelectAll} disabled={allSelected} className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all disabled:opacity-30 shadow-sm">Pilih Semua</button>
                      <button onClick={handleUnselectAll} disabled={noneSelected} className="px-5 py-2.5 bg-foreground/5 border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-all disabled:opacity-30 shadow-sm">Hapus Semua</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {localSettings.scenarios.map(scenario => (
                      <div key={scenario.id} className={`flex items-start p-6 rounded-[2rem] border transition-all ${scenario.isActive ? 'bg-card border-primary/30' : 'bg-card/40 border-border/50 opacity-40 grayscale hover:grayscale-0 hover:opacity-100'}`}>
                        <div className="pt-1 mr-5">
                          <button onClick={() => handleToggleScenario(scenario.id)} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${scenario.isActive ? 'bg-primary border-primary text-white' : 'border-foreground/10 bg-foreground/5 text-transparent'}`}>
                            <Check className={`w-4 h-4 ${scenario.isActive ? 'scale-100 opacity-100' : 'scale-50 opacity-0'} transition-all`} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">{scenario.category}</span>
                            <h4 className="text-base font-black text-foreground tracking-tight truncate">{scenario.title}</h4>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium">{scenario.description}</p>
                          {scenario.images && scenario.images.length > 0 && (
                            <div className="mt-3">
                              <span className="text-[10px] bg-foreground/5 text-muted-foreground px-3 py-1.5 rounded-xl inline-flex items-center gap-2 font-black uppercase tracking-widest border border-border/50">
                                <ImageIcon className="w-3.5 h-3.5" /> {scenario.images.length} Lampiran
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button onClick={() => handleEditScenario(scenario)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteScenario(scenario.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!isScenarioFormOpen ? (
                    <button onClick={() => { resetScenarioForm(); setIsScenarioFormOpen(true); }} className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 backdrop-blur-md border border-dashed border-border/50 rounded-[2rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest shadow-sm group">
                      <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors"><Plus className="w-6 h-6" /></div>
                      <span>Tambah Skenario Baru</span>
                    </button>
                  ) : (
                    <div id="scenario-form" className="bg-card border border-border/50 rounded-[2rem] shadow-3xl overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingScenarioId ? 'Edit Skenario' : 'Tambah Skenario Baru'}</h3>
                      </div>
                      <div className="p-8 grid grid-cols-2 gap-6 relative z-10">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Kategori</label>
                          {!isNewCategoryInput ? (
                            <div className="relative">
                              <select className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none appearance-none transition-all" value={newScenarioCategory} onChange={(e) => { if (e.target.value === 'NEW') { setIsNewCategoryInput(true); setNewScenarioCategory(''); } else setNewScenarioCategory(e.target.value); }}>
                              <option value="">Pilih Kategori</option>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                  <option value="NEW">+ Tambah Kategori Lainnya</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"><svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                              </div>
                          ) : (
                            <div className="flex gap-3">
                              <input type="text" className="flex-1 rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="Kategori Baru" value={newScenarioCategory} onChange={(e) => setNewScenarioCategory(e.target.value)} />
                              <button onClick={() => setIsNewCategoryInput(false)} className="px-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-all">Batal</button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Judul Masalah</label>
                          <input type="text" className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-foreground/20" placeholder="Contoh: Gagal Transfer" value={newScenarioTitle} onChange={(e) => setNewScenarioTitle(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Deskripsi Masalah</label>
                          <textarea className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all" rows={3} value={newScenarioDesc} onChange={(e) => setNewScenarioDesc(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center justify-between gap-4 mb-3">
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Skrip Percakapan</label>
                            <button type="button" onClick={() => setIsScenarioScriptEnabled(prev => !prev)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isScenarioScriptEnabled ? 'bg-primary/10 text-primary border-primary/20' : 'bg-foreground/5 text-muted-foreground border-border/50'}`}>
                              <span className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isScenarioScriptEnabled ? 'bg-primary border-primary text-white' : 'border-foreground/20 bg-transparent text-transparent'}`}><Check className="w-3 h-3" /></span>
                              {isScenarioScriptEnabled ? 'Ikuti Skrip' : 'Sangat Kreatif'}
                            </button>
                          </div>
                          <textarea className={`w-full rounded-2xl border p-4 text-sm outline-none resize-none transition-all ${isScenarioScriptEnabled ? 'border-border/50 bg-foreground/5 text-foreground focus:ring-2 focus:ring-primary' : 'border-border/30 bg-foreground/[0.03] text-muted-foreground cursor-not-allowed'}`} rows={12} value={newScenarioScript} onChange={(e) => setNewScenarioScript(e.target.value)} disabled={!isScenarioScriptEnabled} placeholder={`Contoh format 1 - Dialog:
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
                            Checklist <span className="font-black text-foreground">Ikuti Skrip</span> untuk mengaktifkan kolom ini. Saat tidak dicentang, konsumen akan dibiarkan lebih bebas dan kreatif mengikuti konteks skenario. Saat dicentang, AI akan berusaha mengikuti skrip sebagai panduan alur.
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed font-medium">
                            Anda bisa menulis skrip dalam format dialog seperti <span className="font-black text-foreground">Agent:</span> /
                            <span className="font-black text-foreground"> Konsumen:</span> atau dalam format poin alur seperti
                            <span className="font-black text-foreground"> Awal</span>, <span className="font-black text-foreground">Jika agen bertanya</span>,
                            dan <span className="font-black text-foreground">Akhir</span>. AI akan tetap menjawab secara natural sesuai pertanyaan agen dan situasi percakapan.
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Lampiran Gambar</label>
                          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border/50 rounded-[2rem] cursor-pointer bg-foreground/5 hover:bg-foreground/10 hover:border-primary/30 transition-all group">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>
                              <p className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground">Drop File atau Klik</p>
                              <p className="text-[10px] font-medium text-muted-foreground italic">PNG, JPG (MAX. 500KB)</p>
                            </div>
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                          </label>
                          {newScenarioImages.length > 0 && (
                            <div className="flex gap-4 mt-6 overflow-x-auto pb-4">
                              {newScenarioImages.map((img, idx) => (
                                <div key={idx} className="relative w-24 h-24 shrink-0 group">
                                  <img src={img} alt={`Preview ${idx}`} className="object-cover w-full h-full rounded-2xl border border-border/50 shadow-md" />
                                  <button onClick={() => setNewScenarioImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10"><X className="w-4 h-4" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 pt-6 border-t border-border/50">
                          <button onClick={() => { resetScenarioForm(); setIsScenarioFormOpen(false); }} className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all">Batal</button>
                          <button onClick={handleSaveScenario} disabled={!newScenarioTitle} className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30">Simpan</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'consumers' && (
                <div className="space-y-8 pb-10">
                  <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="flex items-start gap-6 relative z-10">
                      <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                        <Users className="w-7 h-7 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-xl tracking-tighter">Pilih Karakter Pelanggan</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini akan digunakan untuk <span className="text-foreground font-black">semua skenario</span> yang aktif.</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div onClick={() => handleSelectConsumerType('random')} className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all ${localSettings.activeConsumerTypeId === 'random' ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                      <div className="flex justify-between items-start">
                        <h4 className="font-black text-foreground tracking-tight flex items-center gap-2 text-lg">Acak</h4>
                        {localSettings.activeConsumerTypeId === 'random' && <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 font-medium leading-relaxed">Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.</p>
                    </div>
                    {localSettings.consumerTypes.map(c => (
                      <div key={c.id} onClick={() => handleSelectConsumerType(c.id)} className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all relative group ${localSettings.activeConsumerTypeId === c.id ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-black text-foreground tracking-tight text-lg">{c.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-widest border ${c.difficulty === 'Mudah' ? 'bg-green-500/10 text-green-500 border-green-500/20' : c.difficulty === 'Sedang' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{c.difficulty}</span>
                            {localSettings.activeConsumerTypeId === c.id ? (
                              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>
                            ) : (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); handleEditConsumer(c); }} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-border/50"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteConsumer(c.id); }} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-border/50"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed font-medium">{c.description}</p>
                      </div>
                    ))}
                  </div>
                  {!isConsumerFormOpen && (
                    <button onClick={() => { resetConsumerForm(); setIsConsumerFormOpen(true); }} className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 border border-dashed border-border/50 rounded-[2.5rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest group">
                      <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors"><Plus className="w-6 h-6" /></div>
                      <span>Buat Karakteristik Baru</span>
                    </button>
                  )}
                  {isConsumerFormOpen && (
                    <div id="consumer-form" className="bg-card border border-border/50 rounded-[2.5rem] shadow-3xl overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingConsumerId ? 'Edit Karakter' : 'Tambah Karakter Baru'}</h3>
                      </div>
                      <div className="p-8 space-y-6 relative z-10">
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Nama Karakter</label>
                          <input className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" value={newConsumerName} onChange={e => setNewConsumerName(e.target.value)} placeholder="Contoh: Pelanggan Marah" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Tingkat Kesulitan</label>
                          <select className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none appearance-none transition-all" value={newConsumerDifficulty} onChange={e => setNewConsumerDifficulty(e.target.value as any)}>
                            <option value="Mudah">Mudah</option>
                            <option value="Sedang">Sedang</option>
                            <option value="Sulit">Sulit</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Deskripsi / AI Prompt</label>
                          <textarea className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all" rows={3} value={newConsumerDesc} onChange={e => setNewConsumerDesc(e.target.value)} placeholder="Deskripsikan bagaimana karakter ini berperilaku..." />
                        </div>
                        <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                          <button onClick={() => { resetConsumerForm(); setIsConsumerFormOpen(false); }} className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all">Batal</button>
                          <button onClick={handleSaveConsumer} className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Simpan</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'identity' && (
                <div className="space-y-8 pb-10">
                  <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="flex items-start gap-6 relative z-10">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                        <Fingerprint className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-xl tracking-tighter">Identitas &amp; Greeting</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Konfigurasi profil konsumen dan identitas agen untuk salam pembuka yang lebih personal.</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-10 rounded-[2.5rem] border border-border/50 bg-card shadow-sm relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                      <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Nama Konsumen</label>
                        <input type="text" className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="Contoh: Agus Setiawan" value={localSettings.identitySettings.displayName} onChange={(e) => handleIdentityChange('displayName', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Nama Agen (Greeting)</label>
                        <input type="text" className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="Contoh: Fajar" value={localSettings.identitySettings.signatureName} onChange={(e) => handleIdentityChange('signatureName', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Nomor Telepon</label>
                        <input type="text" className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="Contoh: 0812..." value={localSettings.identitySettings.phoneNumber} onChange={(e) => handleIdentityChange('phoneNumber', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Kota Asal</label>
                        <input type="text" className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-base text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="Contoh: Jakarta" value={localSettings.identitySettings.city} onChange={(e) => handleIdentityChange('city', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'template' && (
                <div className="space-y-8 pb-10">
                  <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
                    <div className="flex items-start gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                        <MessageSquare className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-xl tracking-tighter">Template Cepat</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Kelola pesan template yang dapat Anda panggil dengan shortcut &quot;/&quot; di area chat.</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {(localSettings.quickTemplates || []).map(t => (
                      <div key={t.id} className="p-6 rounded-[2rem] border border-border/50 bg-card hover:bg-foreground/5 transition-all group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-wider border border-primary/20">/{t.keyword}</div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingTemplateId(t.id); setNewTemplateKeyword(t.keyword); setNewTemplateContent(t.content); setIsTemplateFormOpen(true); }} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-border/50"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-border/50"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed font-medium line-clamp-2">{t.content}</p>
                      </div>
                    ))}
                  </div>
                  {!isTemplateFormOpen && (
                    <button onClick={() => { setEditingTemplateId(null); setNewTemplateKeyword(''); setNewTemplateContent(''); setIsTemplateFormOpen(true); }} className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 border border-dashed border-border/50 rounded-[2.5rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest group">
                      <Plus className="w-6 h-6" />
                      <span>Tambah Template Baru</span>
                    </button>
                  )}
                  {isTemplateFormOpen && (
                    <div id="template-form" className="bg-card border border-border/50 rounded-[2.5rem] shadow-3xl overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5 relative z-10">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingTemplateId ? 'Edit Template' : 'Tambah Template Baru'}</h3>
                      </div>
                      <div className="p-8 space-y-6 relative z-10">
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Shortcut Keyword (Tanpa Spasi)</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-black">/</span>
                            <input className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-foreground/20 pl-8" value={newTemplateKeyword} onChange={e => setNewTemplateKeyword(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="contoh: salam" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Isi Template</label>
                          <textarea className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all font-medium leading-relaxed" rows={5} value={newTemplateContent} onChange={e => setNewTemplateContent(e.target.value)} placeholder="Masukkan isi pesan yang akan muncul saat shortcut dipanggil..." />
                        </div>
                        <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                          <button onClick={() => { setEditingTemplateId(null); setNewTemplateKeyword(''); setNewTemplateContent(''); setIsTemplateFormOpen(false); }} className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all">Batal</button>
                          <button onClick={handleSaveTemplate} className="px-8 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Simpan</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'system' && (
                <div className="space-y-10 pb-10">
                  <section className="space-y-6">
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="flex items-start gap-6 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
                          <span className="text-3xl">&#x1F916;</span>
                        </div>
                        <div>
                          <h3 className="font-black text-foreground text-xl tracking-tighter">Pilih Model Simulasi</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Pilih model AI yang akan menggerakkan karakter pelanggan.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4">
                      {TEXT_MODELS.map(model => {
                        const isSelected = localSettings.selectedModel === model.id;
                        return (
                          <div key={model.id} onClick={() => setLocalSettings(prev => ({ ...prev, selectedModel: model.id }))} className={`cursor-pointer p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between gap-6 group ${isSelected ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-foreground tracking-tight text-lg">{model.name}</h4>
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${model.provider === 'openrouter' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>{model.provider}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 font-medium">{model.description}</p>
                            </div>
                            {isSelected && <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0"><Check className="w-4 h-4 text-white" /></div>}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="flex items-start gap-6 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                          <Clock className="w-7 h-7 text-orange-500" />
                        </div>
                        <div>
                          <h3 className="font-black text-foreground text-xl tracking-tighter">Durasi Simulasi</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Tentukan batas waktu maksimal untuk setiap sesi simulasi.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                      {PRESET_DURATIONS.map(d => {
                        const isSelected = durationMode === 'preset' && localSettings.simulationDuration === d;
                        return (
                          <div key={d} onClick={() => handlePresetClick(d)} className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${isSelected ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                            <span className={`text-3xl sm:text-4xl font-black tracking-tighter ${isSelected ? 'text-primary' : 'text-foreground/20'}`}>{d}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Menit</span>
                            {isSelected && (
                              <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 z-10">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div onClick={handleCustomClick} className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${durationMode === 'custom' ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                        <span className={`text-3xl sm:text-4xl font-black tracking-tighter ${durationMode === 'custom' ? 'text-primary' : 'text-foreground/20'}`}>&#x2699;&#xFE0F;</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Kustom</span>
                        {durationMode === 'custom' && (
                          <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 z-10">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {durationMode === 'custom' && (
                        <motion.div initial={{ opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0, y: -10 }} className="overflow-hidden">
                          <div className="p-6 rounded-[2rem] border border-border/50 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                            <div>
                              <label className="block text-xs font-black text-foreground uppercase tracking-wider mb-1">Masukkan Durasi Kustom</label>
                              <p className="text-[11px] text-muted-foreground font-medium">Tentukan durasi simulasi antara {MIN_DURATION} hingga {MAX_DURATION} menit.</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="relative w-36">
                                <input
                                  ref={inputRef}
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="5"
                                  value={customInputValue}
                                  onChange={handleDurationInputChange}
                                  onBlur={handleDurationBlur}
                                  className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-3.5 pr-12 text-base font-black text-foreground focus:ring-2 focus:ring-primary outline-none transition-all text-right"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest text-muted-foreground pointer-events-none">Min</span>
                              </div>
                              {durationValidationError && (
                                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] font-black text-red-500 uppercase tracking-wider mt-1">{durationValidationError}</motion.span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  <section className="space-y-6">
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                      <div className="flex items-start gap-6 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center shrink-0 border border-teal-500/20">
                          <Zap className="w-7 h-7 text-teal-500" />
                        </div>
                        <div>
                          <h3 className="font-black text-foreground text-xl tracking-tighter">Tempo Balasan Konsumen</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Pengaturan ini memengaruhi kecepatan balasan konsumen ditampilkan.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {(['realistic', 'training_fast'] as const).map(mode => (
                        <div key={mode} onClick={() => setLocalSettings(prev => ({ ...prev, responsePacingMode: mode }))} className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative ${localSettings.responsePacingMode === mode ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                          <Zap className={`w-8 h-8 ${localSettings.responsePacingMode === mode ? 'text-primary' : 'text-foreground/20'}`} />
                          <span className={`text-lg font-black tracking-tight ${localSettings.responsePacingMode === mode ? 'text-primary' : 'text-foreground'}`}>{mode === 'realistic' ? 'Realistis' : 'Cepat Latihan'}</span>
                          <span className="text-xs text-muted-foreground font-medium text-center">{mode === 'realistic' ? 'Variasi tempo seperti manusia asli.' : 'Balasan lebih cepat, cocok untuk latihan.'}</span>
                          {localSettings.responsePacingMode === mode && <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            <div className="px-10 py-8 border-t border-border/50 flex justify-between items-center bg-card/50 backdrop-blur-2xl shrink-0">
              <button onClick={handleResetDefaults} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-all px-6 py-3 rounded-2xl hover:bg-red-500/5 border border-transparent hover:border-red-500/20">
                <RotateCcw className="w-4 h-4" />
                Reset Default
              </button>
              <div className="flex gap-4">
                <button onClick={onClose} className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all">Batal</button>
                <button onClick={handleSave} className="px-10 py-4 bg-foreground text-background rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-foreground/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
