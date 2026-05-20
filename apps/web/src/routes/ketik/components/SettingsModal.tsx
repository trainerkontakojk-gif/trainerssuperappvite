import { useState, useEffect } from 'react';
import type { KetikAppSettings, KetikScenario, KetikConsumerType, KetikQuickTemplate } from '@trainers/types';
import { DEFAULT_KETIK_SETTINGS } from '@trainers/types';
import { Clock, Trash2, X, Plus, Check, Edit2, RotateCcw, Save, Image as ImageIcon, Settings, FileText, Users, Fingerprint, Zap, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  const TEXT_MODELS = [
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Cepat dan efisien untuk simulasi chat ringan.', provider: 'gemini' },
    { id: 'gemini-3.1-flat-002', name: 'Gemini 3.1 Flash', description: 'Keseimbangan antara kecepatan dan kualitas.', provider: 'gemini' },
    { id: 'openrouter/anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: 'Respons cepat dengan kualitas baik.', provider: 'openrouter' },
    { id: 'openrouter/openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Model ringan OpenAI dengan performa solid.', provider: 'openrouter' },
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
        if (file.size > 500 * 1024) { alert(`File ${file.name} terlalu besar (>500KB).`); return; }
        const reader = new FileReader();
        reader.onloadend = () => setNewScenarioImages(prev => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    }
  };

  const resetConsumerForm = () => { setEditingConsumerId(null); setNewConsumerName(''); setNewConsumerDesc(''); setNewConsumerDifficulty('Sedang'); };
  const handleEditConsumer = (consumer: KetikConsumerType) => { setEditingConsumerId(consumer.id); setNewConsumerName(consumer.name); setNewConsumerDesc(consumer.description); setNewConsumerDifficulty(consumer.difficulty); setIsConsumerFormOpen(true); };
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

  const handleSave = () => {
    let finalSettings = localSettings;
    if (isScenarioFormOpen && newScenarioTitle && newScenarioDesc) {
      const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || 'Umum';
      if (editingScenarioId) {
        finalSettings = { ...finalSettings, scenarios: finalSettings.scenarios.map(s => s.id === editingScenarioId ? { ...s, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', images: newScenarioImages } : s) };
      } else {
        finalSettings = { ...finalSettings, scenarios: [...finalSettings.scenarios, { id: `s-${Date.now()}`, category, title: newScenarioTitle, description: newScenarioDesc, script: isScenarioScriptEnabled ? newScenarioScript : '', isActive: true, images: newScenarioImages }] };
      }
    }
    if (isConsumerFormOpen && newConsumerName && newConsumerDesc) {
      if (editingConsumerId) {
        finalSettings = { ...finalSettings, consumerTypes: finalSettings.consumerTypes.map(c => c.id === editingConsumerId ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty } : c) };
      } else {
        finalSettings = { ...finalSettings, consumerTypes: [...finalSettings.consumerTypes, { id: `c-${Date.now()}`, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty, isCustom: true }] };
      }
    }
    onSave(finalSettings);
    onClose();
  };

  const handleResetDefaults = () => {
    if (window.confirm('Apakah Anda yakin ingin mereset semua pengaturan ke awal?')) setLocalSettings(DEFAULT_KETIK_SETTINGS);
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-4xl max-h-[86vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-black/10 bg-card border border-border/50">
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Pengaturan Simulasi</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Module KETIK</span>
                </div>
              </div>
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0">
              <div className="flex p-2 rounded-2xl bg-foreground/[0.02] border border-border/50">
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative group ${activeTab === tab.id ? 'text-primary bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
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
                    <div className="bg-card border border-border/50 rounded-[2rem] overflow-hidden relative">
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingScenarioId ? 'Edit Skenario' : 'Tambah Skenario Baru'}</h3>
                      </div>
                      <div className="p-8 grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Kategori</label>
                          {!isNewCategoryInput ? (
                            <select className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none appearance-none transition-all" value={newScenarioCategory} onChange={(e) => { if (e.target.value === 'NEW') { setIsNewCategoryInput(true); setNewScenarioCategory(''); } else setNewScenarioCategory(e.target.value); }}>
                              <option value="">Pilih Kategori</option>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="NEW">+ Tambah Kategori Lainnya</option>
                            </select>
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
                          <textarea className={`w-full rounded-2xl border p-4 text-sm outline-none resize-none transition-all ${isScenarioScriptEnabled ? 'border-border/50 bg-foreground/5 text-foreground focus:ring-2 focus:ring-primary' : 'border-border/30 bg-foreground/[0.03] text-muted-foreground cursor-not-allowed'}`} rows={8} value={newScenarioScript} onChange={(e) => setNewScenarioScript(e.target.value)} disabled={!isScenarioScriptEnabled} placeholder="Contoh: Agent: ...&#10;Konsumen: ..." />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Lampiran Gambar</label>
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/50 rounded-[2rem] cursor-pointer bg-foreground/5 hover:bg-foreground/10 hover:border-primary/30 transition-all group">
                            <ImageIcon className="w-6 h-6 text-muted-foreground mb-2" />
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">PNG, JPG (MAX. 500KB)</p>
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                          </label>
                          {newScenarioImages.length > 0 && (
                            <div className="flex gap-4 mt-4 overflow-x-auto pb-2">
                              {newScenarioImages.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                  <img src={img} alt={`Preview ${idx}`} className="object-cover w-full h-full rounded-2xl border border-border/50" />
                                  <button onClick={() => setNewScenarioImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
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
                    <div className="flex items-start gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                        <Users className="w-7 h-7 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-xl tracking-tighter">Pilih Karakter Pelanggan</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Pilih satu kepribadian pelanggan yang akan Anda hadapi.</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div onClick={() => handleSelectConsumerType('random')} className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all ${localSettings.activeConsumerTypeId === 'random' ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                      <div className="flex justify-between items-start">
                        <h4 className="font-black text-foreground tracking-tight flex items-center gap-2 text-lg">Acak</h4>
                        {localSettings.activeConsumerTypeId === 'random' && <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 font-medium leading-relaxed">Sistem akan memilih salah satu karakter secara acak.</p>
                    </div>
                    {localSettings.consumerTypes.map(c => (
                      <div key={c.id} onClick={() => handleSelectConsumerType(c.id)} className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all relative group ${localSettings.activeConsumerTypeId === c.id ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-black text-foreground tracking-tight text-lg">{c.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-widest border ${c.difficulty === 'Mudah' ? 'bg-green-500/10 text-green-500 border-green-500/20' : c.difficulty === 'Sedang' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>{c.difficulty}</span>
                            {localSettings.activeConsumerTypeId === c.id && <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed font-medium">{c.description}</p>
                        <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); handleEditConsumer(c); }} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-border/50"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteConsumer(c.id); }} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-border/50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!isConsumerFormOpen && (
                    <button onClick={() => { resetConsumerForm(); setIsConsumerFormOpen(true); }} className="w-full py-6 flex flex-col items-center justify-center gap-3 bg-card/40 border border-dashed border-border/50 rounded-[2.5rem] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all font-black text-xs uppercase tracking-widest group">
                      <Plus className="w-6 h-6" />
                      <span>Buat Karakteristik Baru</span>
                    </button>
                  )}
                  {isConsumerFormOpen && (
                    <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden">
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingConsumerId ? 'Edit Karakter' : 'Tambah Karakter Baru'}</h3>
                      </div>
                      <div className="p-8 space-y-6">
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
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Deskripsi</label>
                          <textarea className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all" rows={3} value={newConsumerDesc} onChange={e => setNewConsumerDesc(e.target.value)} placeholder="Deskripsikan karakter ini..." />
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
                  <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
                    <div className="flex items-start gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                        <Fingerprint className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-xl tracking-tighter">Identitas &amp; Greeting</h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Konfigurasi profil konsumen dan identitas agen untuk salam pembuka yang lebih personal.</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-10 rounded-[2.5rem] border border-border/50 bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                    <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden">
                      <div className="px-8 py-6 border-b border-border/50 bg-foreground/5">
                        <h3 className="font-black text-foreground text-lg tracking-tighter">{editingTemplateId ? 'Edit Template' : 'Tambah Template Baru'}</h3>
                      </div>
                      <div className="p-8 space-y-6">
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Shortcut Keyword</label>
                          <input className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all" value={newTemplateKeyword} onChange={e => setNewTemplateKeyword(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="contoh: salam" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 ml-1">Isi Template</label>
                          <textarea className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-4 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none resize-none transition-all" rows={5} value={newTemplateContent} onChange={e => setNewTemplateContent(e.target.value)} placeholder="Masukkan isi pesan..." />
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
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
                      <div className="flex items-start gap-6">
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
                          <div key={model.id} onClick={() => setLocalSettings(prev => ({ ...prev, selectedModel: model.id }))} className={`cursor-pointer p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between gap-6 ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-foreground tracking-tight text-lg">{model.name}</h4>
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${model.provider === 'openrouter' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>{model.provider}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 font-medium">{model.description}</p>
                            </div>
                            {isSelected && <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shrink-0"><Check className="w-4 h-4 text-white" /></div>}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
                      <div className="flex items-start gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                          <Clock className="w-7 h-7 text-orange-500" />
                        </div>
                        <div>
                          <h3 className="font-black text-foreground text-xl tracking-tighter">Durasi Simulasi</h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">Tentukan batas waktu maksimal untuk setiap sesi simulasi.</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-8 bg-card rounded-[2rem] border border-border/50">
                      {[3, 5, 10, 15, 20, 30].map(d => (
                        <button key={d} onClick={() => setLocalSettings(prev => ({ ...prev, simulationDuration: d }))} className={`px-6 py-4 rounded-2xl text-sm font-black tracking-tight transition-all border-2 ${localSettings.simulationDuration === d ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-foreground/5 text-muted-foreground hover:border-primary/30'}`}>{d} menit</button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm">
                      <div className="flex items-start gap-6">
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

            <div className="px-10 py-8 border-t border-border/50 flex justify-between items-center bg-card/50 shrink-0">
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
