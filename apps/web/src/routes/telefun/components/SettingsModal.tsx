
import React, { useState, useEffect } from 'react';


import { Clock, Trash2, X, Plus, Check, Edit2, User, Settings, FileText, Users, Save, Zap, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DurationSelector } from './DurationSelector';
import { 
  TelefunAppSettings as AppSettings, 
  TelefunIdentitySettings as ConsumerIdentitySettings, 
  TelefunScenario as Scenario, 
  TelefunConsumerType as ConsumerType, 
  ConsumerDifficulty,
  MALE_VOICES, 
  FEMALE_VOICES,
  VOICE_MODELS as TELEFUN_AUDIO_MODELS
} from '../telefunSettings';


const generateScenarioId = () => `s-${Date.now()}`;
const generateConsumerId = () => `c-${Date.now()}`;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'consumers' | 'identity' | 'system'>('scenarios');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  
  // UI States for Forms
  const [isScenarioFormOpen, setIsScenarioFormOpen] = useState(false);
  const [isConsumerFormOpen, setIsConsumerFormOpen] = useState(false);

  // Scenario Form State
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [newScenarioCategory, setNewScenarioCategory] = useState('');
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [newScenarioInstruction, setNewScenarioInstruction] = useState('');
  const [newScenarioScript, setNewScenarioScript] = useState('');
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);
  
  // Consumer Form State
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(null);
  const [newConsumerName, setNewConsumerName] = useState('');
  const [newConsumerDesc, setNewConsumerDesc] = useState('');
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<ConsumerDifficulty>(ConsumerDifficulty.Medium);

  // Telefun Model Selection State
  const [selectedTelefunModel, setSelectedTelefunModel] = useState<string>(
    settings.telefunModelId || TELEFUN_AUDIO_MODELS[0]?.id || 'gemini-3.1-flash-live-preview'
  );
  const selectedTelefunTransport = TELEFUN_AUDIO_MODELS.find(m => m.id === selectedTelefunModel)?.telefunTransport || 'gemini-live';

  // Identity Form State
  const handleIdentityChange = (field: keyof ConsumerIdentitySettings, value: string) => {
    setLocalSettings(prev => {
      const updatedSettings = {
        ...prev.identitySettings,
        [field]: value
      };
      if (field === 'gender') {
        updatedSettings.voiceName = '';
      }
      return {
        ...prev,
        identitySettings: updatedSettings
      };
    });
  };

  // Reset local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setIsScenarioFormOpen(false);
      setIsConsumerFormOpen(false);
      setEditingScenarioId(null);
      setEditingConsumerId(null);
      setSelectedTelefunModel(settings.telefunModelId || TELEFUN_AUDIO_MODELS[0]?.id || 'gemini-3.1-flash-live-preview');
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(localSettings.scenarios.map(s => s.category)));

  // SELECT ALL LOGIC
  const activeCount = localSettings.scenarios.filter(s => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleSelectAll = () => {
    setLocalSettings(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => ({ ...s, isActive: true }))
    }));
  };

  const handleUnselectAll = () => {
    setLocalSettings(prev => ({
        ...prev,
        scenarios: prev.scenarios.map(s => ({ ...s, isActive: false }))
    }));
  };

  const handleToggleScenario = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s)
    }));
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm('Hapus skenario ini?')) {
      setLocalSettings(prev => ({
        ...prev,
        scenarios: prev.scenarios.filter(s => s.id !== id)
      }));
    }
  };

  // Consumer Selection Logic (Global)
  const handleSelectConsumerType = (id: string) => {
      setLocalSettings(prev => ({ ...prev, preferredConsumerTypeId: id }));
  }

  const resetScenarioForm = () => {
    setEditingScenarioId(null);
    setNewScenarioTitle('');
    setNewScenarioInstruction('');
    setNewScenarioScript('');
    setIsScenarioScriptEnabled(false);
    setNewScenarioCategory('');
        setIsNewCategoryInput(false);
  };

  const handleAddScenarioClick = () => {
      resetScenarioForm();
      setIsScenarioFormOpen(true);
      setTimeout(() => {
          document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
  };

  const handleEditScenario = (scenario: Scenario) => {
    setEditingScenarioId(scenario.id);
    setNewScenarioCategory(scenario.category || '');
    setNewScenarioTitle(scenario.title);
    setNewScenarioInstruction(scenario.instruction);
    setNewScenarioScript(scenario.script || '');
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
        setIsNewCategoryInput(!categories.includes(scenario.category));
    
    setIsScenarioFormOpen(true);
    setTimeout(() => {
      document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSaveScenario = () => {
    if (!isScenarioDraftValid()) return;
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    
    if (editingScenarioId) {
      setLocalSettings(prev => ({
        ...prev,
        scenarios: prev.scenarios.map(s => 
          s.id === editingScenarioId 
            ? { 
                ...s, 
                category, 
                title: newScenarioTitle, 
                instruction: newScenarioInstruction, 
                script: isScenarioScriptEnabled ? newScenarioScript : ''
              }
            : s
        )
      }));
    } else {
      const newScenario: Scenario = {
        id: generateScenarioId(),
        category,
        title: newScenarioTitle,
        instruction: newScenarioInstruction,
        script: isScenarioScriptEnabled ? newScenarioScript : '',
        isActive: true
      };
      setLocalSettings(prev => ({
        ...prev,
        scenarios: [...prev.scenarios, newScenario]
      }));
    }
    resetScenarioForm();
    setIsScenarioFormOpen(false);
  };

  const resetConsumerForm = () => {
    setEditingConsumerId(null);
    setNewConsumerName('');
    setNewConsumerDesc('');
    setNewConsumerDifficulty(ConsumerDifficulty.Medium);
  };

  const handleAddConsumerClick = () => {
    resetConsumerForm();
    setIsConsumerFormOpen(true);
    setTimeout(() => {
        document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleEditConsumer = (consumer: ConsumerType) => {
    setEditingConsumerId(consumer.id);
    setNewConsumerName(consumer.name);
    setNewConsumerDesc(consumer.description);
    setNewConsumerDifficulty(consumer.difficulty || ConsumerDifficulty.Medium);
    
    setIsConsumerFormOpen(true);
    setTimeout(() => {
        document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSaveConsumer = () => {
    if (!isConsumerDraftValid()) return;

    if (editingConsumerId) {
      setLocalSettings(prev => ({
        ...prev,
        consumerTypes: prev.consumerTypes.map(c => 
          c.id === editingConsumerId 
            ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty,
        gender: 'random' }
            : c
        )
      }));
    } else {
      const newConsumer: ConsumerType = {
        id: generateConsumerId(),
        name: newConsumerName,
        description: newConsumerDesc,
        difficulty: newConsumerDifficulty,
        gender: 'random',
        
      };
      setLocalSettings(prev => ({
        ...prev,
        consumerTypes: [...prev.consumerTypes, newConsumer]
      }));
    }
    resetConsumerForm();
    setIsConsumerFormOpen(false);
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm('Hapus karakteristik ini?')) {
      setLocalSettings(prev => {
        const newTypes = prev.consumerTypes.filter(c => c.id !== id);
        return {
          ...prev,
          consumerTypes: newTypes,
          preferredConsumerTypeId: prev.preferredConsumerTypeId === id ? 'random' : prev.preferredConsumerTypeId
        };
      });
    }
  };

  const hasScenarioDraftContent = () => {
    if (!isScenarioFormOpen) return false;
    if (editingScenarioId) {
      const original = localSettings.scenarios.find(s => s.id === editingScenarioId);
      if (!original) return true;
      const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
      const originalScriptEnabled = Boolean(original.script?.trim());
      return (
        category !== original.category ||
        newScenarioTitle !== original.title ||
        newScenarioInstruction !== original.instruction ||
        isScenarioScriptEnabled !== originalScriptEnabled ||
        newScenarioScript !== (original.script || '') 
      );
    }
    return !!(
      newScenarioTitle ||
      newScenarioInstruction ||
      isScenarioScriptEnabled ||
      newScenarioScript ||
      
      newScenarioCategory
    );
  };

  const hasConsumerDraftContent = () => {
    if (!isConsumerFormOpen) return false;
    if (editingConsumerId) {
      const original = localSettings.consumerTypes.find(c => c.id === editingConsumerId);
      if (!original) return true;
      return (
        newConsumerName !== original.name ||
        newConsumerDesc !== original.description ||
        newConsumerDifficulty !== original.difficulty
      );
    }
    return !!(
      newConsumerName ||
      newConsumerDesc ||
      newConsumerDifficulty !== ConsumerDifficulty.Medium
    );
  };

  const isScenarioDraftDirty = () => hasScenarioDraftContent();

  const isScenarioDraftValid = () => {
    if (!newScenarioTitle) return false;
    if (!newScenarioInstruction) return false;
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
    if (!category) return false;
    return true;
  };

  const applyScenarioDraft = (base: AppSettings): AppSettings | null => {
    if (!isScenarioDraftDirty() || !isScenarioDraftValid()) return null;
    const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";

    if (editingScenarioId) {
      return {
        ...base,
        scenarios: base.scenarios.map(s =>
          s.id === editingScenarioId
            ? {
                ...s,
                category,
                title: newScenarioTitle,
                instruction: newScenarioInstruction,
                script: isScenarioScriptEnabled ? newScenarioScript : ''
              }
            : s
        )
      };
    } else {
      const newScenario: Scenario = {
        id: generateScenarioId(),
        category,
        title: newScenarioTitle,
        instruction: newScenarioInstruction,
        script: isScenarioScriptEnabled ? newScenarioScript : '',
        isActive: true
      };
      return {
        ...base,
        scenarios: [...base.scenarios, newScenario]
      };
    }
  };

  const isConsumerDraftDirty = () => hasConsumerDraftContent();

  const isConsumerDraftValid = () => {
    if (!newConsumerName) return false;
    if (!newConsumerDesc) return false;
    return true;
  };

  const applyConsumerDraft = (base: AppSettings): AppSettings | null => {
    if (!isConsumerDraftDirty() || !isConsumerDraftValid()) return null;

    if (editingConsumerId) {
      return {
        ...base,
        consumerTypes: base.consumerTypes.map(c =>
          c.id === editingConsumerId
            ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty,
        gender: 'random' }
            : c
        )
      };
    } else {
      const newConsumer: ConsumerType = {
        id: generateConsumerId(),
        name: newConsumerName,
        description: newConsumerDesc,
        difficulty: newConsumerDifficulty,
        gender: 'random',
        
      };
      return {
        ...base,
        consumerTypes: [...base.consumerTypes, newConsumer]
      };
    }
  };

  const hasUnsavedChanges = () => {
    if (hasScenarioDraftContent() || hasConsumerDraftContent()) return true;

    const original = JSON.stringify(settings);
    const current = JSON.stringify(localSettings);
    return original !== current;
  };

  const handleSave = () => {
    const scenarioDirty = isScenarioDraftDirty();
    const consumerDirty = isConsumerDraftDirty();

    if (scenarioDirty && !isScenarioDraftValid()) {
      setActiveTab('scenarios');
      setTimeout(() => {
        document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      alert('Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.');
      return;
    }

    if (consumerDirty && !isConsumerDraftValid()) {
      setActiveTab('consumers');
      setTimeout(() => {
        document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      alert('Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.');
      return;
    }

    let finalSettings: AppSettings = {
      ...localSettings,
      telefunTransport: selectedTelefunTransport as any,
      telefunModelId: selectedTelefunModel,
    };
    if (scenarioDirty) {
      const applied = applyScenarioDraft(finalSettings);
      if (applied) finalSettings = applied;
    }
    if (consumerDirty) {
      const applied = applyConsumerDraft(finalSettings);
      if (applied) finalSettings = applied;
    }

    if (scenarioDirty || consumerDirty) {
      setLocalSettings(finalSettings);
      if (scenarioDirty) resetScenarioForm();
      if (consumerDirty) resetConsumerForm();
    }

    onSave(finalSettings);
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      if (!window.confirm('Perubahan belum disimpan. Yakin ingin keluar?')) return;
    }
    onClose();
  };

  const handleCancelScenarioForm = () => {
    if (hasScenarioDraftContent()) {
      if (!window.confirm('Skenario belum disimpan. Buang perubahan?')) return;
    }
    setIsScenarioFormOpen(false);
    resetScenarioForm();
  };

  const handleCancelConsumerForm = () => {
    if (hasConsumerDraftContent()) {
      if (!window.confirm('Karakter belum disimpan. Buang perubahan?')) return;
    }
    setIsConsumerFormOpen(false);
    resetConsumerForm();
  };

  const tabs = [
    { id: 'scenarios', label: 'Masalah', icon: FileText },
    { id: 'consumers', label: 'Karakter', icon: Users },
    { id: 'identity', label: 'Identitas', icon: User },
    { id: 'system', label: 'Sistem', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[150] flex items-center justify-center p-4" onClick={handleClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-border"
      >
        
        {/* Modal Header */}
        <div className="px-8 py-6 border-b border-border flex justify-between items-center bg-card/50 backdrop-blur-xl shrink-0">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Pengaturan Simulasi</h2>
          <div className="flex items-center gap-3">
            <button 
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
            >
                <Save className="w-4 h-4" />
                Simpan Perubahan
            </button>
            <button 
                onClick={handleClose} 
                className="w-9 h-9 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-full text-muted-foreground transition-all"
            >
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Control Tabs */}
        <div className="px-8 pt-6 pb-2 shrink-0 bg-card">
          <div className="flex p-1 bg-foreground/5 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all relative ${
                  activeTab === tab.id 
                    ? 'text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-muted-foreground'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabTele"
                    className="absolute inset-0 bg-card rounded-lg shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-background">
          
          {/* TAB 1: SCENARIOS */}
          {activeTab === 'scenarios' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                 <div>
                     <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                        Daftar Skenario
                     </h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                       {activeCount} dari {totalScenarios} skenario dipilih
                     </p>
                 </div>
                 
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={handleSelectAll}
                        disabled={allSelected}
                        className="px-4 py-2 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                     >
                        Pilih Semua
                     </button>
                     <button 
                        onClick={handleUnselectAll}
                        disabled={noneSelected}
                        className="px-4 py-2 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                     >
                        Hapus Semua
                     </button>
                 </div>
              </div>
                
              {/* Scenario List */}
              <div className="grid grid-cols-1 gap-3">
                  {localSettings.scenarios.map(scenario => (
                  <motion.div 
                    layout
                    key={scenario.id} 
                    className={`flex items-start p-5 rounded-2xl border transition-all ${
                      scenario.isActive 
                        ? 'bg-white dark:bg-[#1C1C1E] border-blue-500/30 shadow-md' 
                        : 'bg-gray-50 dark:bg-[#1C1C1E]/50 border-gray-200 dark:border-white/5 opacity-70'
                    }`}
                  >
                      {/* Checkbox */}
                      <div className="pt-1 mr-4">
                          <button
                              onClick={() => handleToggleScenario(scenario.id)}
                              className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                scenario.isActive 
                                  ? 'bg-blue-500 border-blue-500 text-white' 
                                  : 'border-gray-300 dark:border-gray-600 bg-transparent'
                              }`}
                          >
                            {scenario.isActive && <Check className="w-4 h-4" />}
                          </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-100 dark:bg-[#2C2C2E] text-gray-600 dark:text-gray-300">
                                {scenario.category}
                              </span>
                              <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {scenario.title}
                              </h4>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                              {scenario.instruction}
                          </p>
                           {/* Scenario images hidden for Telefun */}
                      </div>

                      {/* Action */}
                      <div className="flex items-center gap-2 ml-4">
                          <button 
                              onClick={() => handleEditScenario(scenario)}
                              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all"
                          >
                              <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                              onClick={() => handleDeleteScenario(scenario.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                          >
                              <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  </motion.div>
                  ))}
              </div>

              {/* Add Button */}
              {!isScenarioFormOpen ? (
                <button
                    onClick={handleAddScenarioClick}
                    className="w-full py-4 flex items-center justify-center gap-2 bg-white dark:bg-[#1C1C1E] border border-dashed border-gray-300 dark:border-white/10 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/30 dark:hover:border-blue-400/30 transition-all font-bold text-sm shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    <span>Tambah Skenario Baru</span>
                </button>
              ) : (
                /* Edit Form */
                <div id="scenario-form" className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#2C2C2E]/50">
                         <h3 className="font-bold text-gray-900 dark:text-white text-base">
                            {editingScenarioId ? 'Edit Skenario' : 'Tambah Skenario Baru'}
                        </h3>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-5">
                        <div className="col-span-2">
                             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Kategori</label>
                             {!isNewCategoryInput ? (
                                <div className="relative">
                                  <select 
                                    className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none" 
                                    value={newScenarioCategory} 
                                    onChange={(e) => {if (e.target.value === 'NEW') {setIsNewCategoryInput(true); setNewScenarioCategory('');} else {setNewScenarioCategory(e.target.value);}}}
                                  >
                                      <option value="">Pilih Kategori</option>
                                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                      <option value="NEW">+ Tambah Kategori Lainnya</option>
                                  </select>
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </div>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input type="text" className="flex-1 rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Kategori Baru" value={newScenarioCategory} onChange={(e) => setNewScenarioCategory(e.target.value)} />
                                    <button onClick={() => setIsNewCategoryInput(false)} className="px-4 text-xs text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all">Batal</button>
                                </div>
                            )}
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Judul Masalah</label>
                            <input type="text" className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Contoh: Gagal Transfer" value={newScenarioTitle} onChange={(e) => setNewScenarioTitle(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Deskripsi Masalah</label>
                            <textarea className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={3} value={newScenarioInstruction} onChange={(e) => setNewScenarioInstruction(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                             <div className="flex items-center justify-between gap-4 mb-2">
                               <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Skrip Percakapan</label>
                               <button
                                 type="button"
                                 onClick={() => setIsScenarioScriptEnabled((prev) => !prev)}
                                 className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${
                                   isScenarioScriptEnabled
                                     ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                                     : 'bg-gray-50 dark:bg-[#2C2C2E] text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/10'
                                 }`}
                               >
                                 <span
                                   className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                     isScenarioScriptEnabled
                                       ? 'bg-blue-500 border-blue-500 text-white'
                                       : 'border-gray-300 dark:border-gray-600 bg-transparent text-transparent'
                                   }`}
                                 >
                                   <Check className="w-3 h-3" />
                                 </span>
                                 {isScenarioScriptEnabled ? 'Ikuti Skrip' : 'Sangat Kreatif'}
                               </button>
                             </div>
                             <textarea
                               className={`w-full rounded-xl border p-3 text-sm outline-none resize-none transition-all ${
                                 isScenarioScriptEnabled
                                   ? 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                                   : 'border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                               }`}
                               rows={12}
                               value={newScenarioScript}
                               onChange={(e) => setNewScenarioScript(e.target.value)}
                               disabled={!isScenarioScriptEnabled}
                               placeholder={`Contoh format 1 - Dialog:
Agent: Selamat pagi, ada yang bisa saya bantu?
Konsumen: Mas saya ada masalah transaksi.
Agent: Baik, transaksi seperti apa ya?
Konsumen: Tadi pagi ada transaksi kartu kredit yang saya tidak kenal.

Contoh format 2 - Alur:
Awal:
- Konsumen membuka telepon dengan nada panik dan singkat.
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
                             <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                               Checklist <span className="font-bold text-gray-900 dark:text-white">Ikuti Skrip</span> untuk mengaktifkan kolom ini. Saat tidak dicentang, konsumen akan dibiarkan lebih bebas dan kreatif mengikuti konteks skenario. Saat dicentang, AI akan berusaha mengikuti skrip sebagai panduan alur.
                             </p>
                             <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                               Anda bisa menulis skrip dalam format dialog seperti <span className="font-bold text-gray-900 dark:text-white">Agent:</span> /
                               <span className="font-bold text-gray-900 dark:text-white"> Konsumen:</span> atau dalam format poin alur seperti
                               <span className="font-bold text-gray-900 dark:text-white"> Awal</span>, <span className="font-bold text-gray-900 dark:text-white">Jika agen bertanya</span>,
                               dan <span className="font-bold text-gray-900 dark:text-white">Akhir</span>. AI akan tetap menjawab secara natural sesuai pertanyaan agen dan situasi percakapan.
                             </p>
                        </div>
                        {/* Scenario Images HIDDEN for Telefun Voice-only */}
                        <div className="col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                             <button onClick={handleCancelScenarioForm} className="px-6 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-all">Batal</button>
                               <button onClick={handleSaveScenario} disabled={!isScenarioDraftValid()} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Simpan</button>
                        </div>
                    </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONSUMERS (Global Selection) */}
          {activeTab === 'consumers' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                     <h3 className="font-bold text-gray-900 dark:text-white text-lg">Pilih Karakter Pelanggan</h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                         Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini akan digunakan untuk <strong>semua skenario</strong> masalah yang telah Anda pilih.
                     </p>
                  </div>
                </div>
              </div>

              {/* Selection Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Random Option */}
                  <div 
                    onClick={() => handleSelectConsumerType('random')}
                    className={`cursor-pointer p-6 rounded-2xl border-2 transition-all relative ${
                        localSettings.preferredConsumerTypeId === 'random'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' 
                        : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                    }`}
                  >
                      <div className="flex justify-between items-start">
                          <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                              🎲 Karakteristik Random
                          </h4>
                          {localSettings.preferredConsumerTypeId === 'random' && <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          Sistem akan memilih salah satu karakter secara acak setiap kali sesi simulasi dimulai.
                      </p>
                  </div>

                  {/* Defined Types */}
                  {localSettings.consumerTypes.map(c => (
                     <div 
                        key={c.id} 
                        onClick={() => handleSelectConsumerType(c.id)}
                        className={`cursor-pointer p-6 rounded-2xl border-2 transition-all relative group ${
                            localSettings.preferredConsumerTypeId === c.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' 
                            : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                        }`}
                     >
                        <div className="flex justify-between items-start mb-2">
                           <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {c.name}
                           </h4>
                           <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                                    c.difficulty === ConsumerDifficulty.Easy ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                                    c.difficulty === ConsumerDifficulty.Medium ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                                    'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                }`}>
                                    {c.difficulty}
                                </span>
                                {localSettings.preferredConsumerTypeId === c.id ? (
                                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>
                                ) : (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleEditConsumer(c); }}
                                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteConsumer(c.id); }}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                           </div>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                            {c.description}
                        </p>
                     </div>
                  ))}
              </div>

              {/* Add New Type Button */}
              {!isConsumerFormOpen && (
                 <button
                    onClick={handleAddConsumerClick}
                    className="w-full py-4 flex items-center justify-center gap-2 bg-white dark:bg-[#1C1C1E] border border-dashed border-gray-300 dark:border-white/10 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/30 dark:hover:border-blue-400/30 transition-all font-bold text-sm shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    <span>Buat Karakteristik Baru</span>
                </button>
              )}
              
              {/* Form for Add/Edit Consumer */}
              {isConsumerFormOpen && (
                  <div id="consumer-form" className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#2C2C2E]/50">
                          <h3 className="font-bold text-gray-900 dark:text-white text-base">{editingConsumerId ? 'Edit Karakter' : 'Tambah Karakter'}</h3>
                      </div>
                      <div className="p-6 space-y-5">
                          <div>
                              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Nama</label>
                              <input className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" value={newConsumerName} onChange={e => setNewConsumerName(e.target.value)} placeholder="Contoh: Pelanggan Marah" />
                          </div>
                          <div>
                              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Kesulitan</label>
                              <div className="relative">
                                <select className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none" value={newConsumerDifficulty} onChange={e => setNewConsumerDifficulty(e.target.value as any)}>
                                    <option value={ConsumerDifficulty.Easy}>Mudah</option>
                                    <option value={ConsumerDifficulty.Medium}>Sedang</option>
                                    <option value={ConsumerDifficulty.Hard}>Sulit</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-bold uppercase mb-2 text-gray-500 dark:text-gray-400">Deskripsi/Prompt</label>
                              <textarea className="w-full rounded-xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={3} value={newConsumerDesc} onChange={e => setNewConsumerDesc(e.target.value)} placeholder="Deskripsikan bagaimana karakter ini berperilaku..." />
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                              <button onClick={handleCancelConsumerForm} className="px-6 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-all">Batal</button>
                               <button onClick={handleSaveConsumer} disabled={!isConsumerDraftValid()} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Simpan</button>
                          </div>
                      </div>
                  </div>
              )}
            </div>
          )}

          {/* TAB 3: IDENTITY */}
          {activeTab === 'identity' && (
             <div className="space-y-6">
                <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                       <h3 className="font-bold text-gray-900 dark:text-white text-lg">Atur Identitas Simulasi</h3>
                       <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                           Konfigurasi nama konsumen dan data lainnya.
                       </p>
                    </div>
                  </div>
                </div>

                <div className="p-8 rounded-[2.5rem] border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Nama Konsumen (Lengkap)</label>
                            <input type="text" className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Contoh: Agus Setiawan" value={localSettings.identitySettings?.displayName || ''} onChange={(e) => handleIdentityChange('displayName', e.target.value)} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Jenis Kelamin</label>
                            <div className="relative">
                                <select 
                                    className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                    value={localSettings.identitySettings?.gender || 'random'}
                                    onChange={(e) => handleIdentityChange('gender', e.target.value as 'male' | 'female' | 'random')}
                                >
                                    <option value="random">Acak</option>
                                    <option value="male">Laki-laki</option>
                                    <option value="female">Perempuan</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                    <svg width="12" height="8" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Pilihan Suara</label>
                            <div className="relative">
                                <select 
                                    className={`w-full rounded-2xl border-gray-200 dark:border-white/10 p-4 text-base outline-none appearance-none transition-all ${
                                        (!localSettings.identitySettings?.gender || localSettings.identitySettings?.gender === 'random')
                                        ? 'bg-gray-100 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                        : 'bg-gray-50 dark:bg-[#2C2C2E] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                                    }`}
                                    value={localSettings.identitySettings?.voiceName || ''}
                                    onChange={(e) => handleIdentityChange('voiceName', e.target.value)}
                                    disabled={!localSettings.identitySettings?.gender || localSettings.identitySettings?.gender === 'random'}
                                >
                                    <option value="">Acak (Sesuai Gender)</option>
                                    {(localSettings.identitySettings?.gender === 'male' ? MALE_VOICES : localSettings.identitySettings?.gender === 'female' ? FEMALE_VOICES : []).map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                    <svg width="12" height="8" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>
                            {(!localSettings.identitySettings?.gender || localSettings.identitySettings?.gender === 'random') && (
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 ml-1">
                                    Suara akan diacak otomatis sesuai hasil penentuan gender saat simulasi.
                                </p>
                            )}
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Nomor Telepon Konsumen</label>
                            <input type="text" className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Contoh: 0812..." value={localSettings.identitySettings?.phoneNumber || ''} onChange={(e) => handleIdentityChange('phoneNumber', e.target.value)} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">Kota Konsumen</label>
                            <input type="text" className="w-full rounded-2xl border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] p-4 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Contoh: Jakarta" value={localSettings.identitySettings?.city || ''} onChange={(e) => handleIdentityChange('city', e.target.value)} />
                        </div>
                    </div>
                </div>
             </div>
          )}

          {/* TAB 4: SYSTEM */}
          {activeTab === 'system' && (
              <div className="space-y-8">
                 {/* AI Model Selection for Telefun */}
                 <section className="space-y-4">
                    <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0">
                          <Zap className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                           <h3 className="font-bold text-gray-900 dark:text-white text-lg">Model AI untuk Telefun</h3>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                               Pilih model AI yang akan digunakan untuk simulasi voice call.
                           </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {TELEFUN_AUDIO_MODELS.map(model => {
                            const isSelected = selectedTelefunModel === model.id;
                            const isDisabled = model.disabled;
                            return (
                                <div
                                    key={model.id}
                                    onClick={() => !isDisabled && setSelectedTelefunModel(model.id)}
                                    className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex items-center justify-between gap-6 group relative ${
                                        isSelected
                                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                                        : isDisabled
                                        ? 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1C1C1E]/50 opacity-50 cursor-not-allowed'
                                        : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                                    }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-bold text-gray-900 dark:text-white text-lg">{model.name}</h4>
                                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border ${
                                            model.telefunTransport === 'openai-audio'
                                            ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                            : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                          }`}>
                                            {model.telefunTransport}
                                          </span>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{model.description}</p>
                                        {isDisabled && (
                                          <div className="flex items-center gap-1 mt-2 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                            <AlertCircle className="w-3 h-3" />
                                            <span>Belum tersedia</span>
                                          </div>
                                        )}
                                    </div>
                                    {isSelected && !isDisabled && (
                                      <div className="w-8 h-8 bg-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                                        <Check className="w-4 h-4 text-white" />
                                      </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                 </section>

                 {/* Simulation Duration Selection */}
                 <section className="space-y-4">
                    <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
                          <Clock className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                           <h3 className="font-bold text-gray-900 dark:text-white text-lg">Durasi Simulasi</h3>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                               Tentukan batas waktu maksimal untuk setiap sesi simulasi.
                           </p>
                        </div>
                      </div>
                    </div>

                    <DurationSelector
                      value={localSettings.maxCallDuration || 5}
                      onChange={(val) => setLocalSettings(prev => ({ ...prev, maxCallDuration: val }))}
                    />
                  </section>

                  {/* Tempo Respons Konsumen */}
                  <section className="space-y-6">
                     <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                       <div className="flex items-start gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center shrink-0">
                           <Zap className="w-6 h-6 text-teal-500" />
                         </div>
                         <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Tempo Respons Konsumen</h3>
                             <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                 Atur kecepatan bicara konsumen: Natural (tempo normal) atau Cepat (respons lebih cepat). Tidak memengaruhi fitur simulasi realistis di bawah.
                             </p>
                         </div>
                       </div>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div
                             onClick={() => setLocalSettings(prev => ({ ...prev, responsePacingMode: 'realistic' }))}
                             className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative group ${
                                 (localSettings.responsePacingMode || 'realistic') === 'realistic'
                                 ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                 : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                             }`}
                         >
                             <Zap className={`w-8 h-8 ${(localSettings.responsePacingMode || 'realistic') === 'realistic' ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
                          <span className={`text-base font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'realistic' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                Natural
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center leading-relaxed">
                                Kecepatan bicara normal dengan jeda natural. Tidak mengaktifkan fitur simulasi tambahan.
                              </span>
                             {(localSettings.responsePacingMode || 'realistic') === 'realistic' && (
                               <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 z-10">
                                 <Check className="w-3.5 h-3.5 text-white" />
                               </div>
                             )}
                         </div>

                         <div
                             onClick={() => setLocalSettings(prev => ({ ...prev, responsePacingMode: 'training_fast' }))}
                             className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative group ${
                                 (localSettings.responsePacingMode || 'realistic') === 'training_fast'
                                 ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                 : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                             }`}
                         >
                             <Zap className={`w-8 h-8 ${(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
                              <span className={`text-base font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                Cepat
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center leading-relaxed">
                                Respons lebih cepat tanpa jeda panjang. Cocok untuk latihan berulang secara efisien.
                              </span>
                             {(localSettings.responsePacingMode || 'realistic') === 'training_fast' && (
                               <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 z-10">
                                 <Check className="w-3.5 h-3.5 text-white" />
                               </div>
                             )}
                         </div>
                     </div>
                  </section>

                  {/* Realistic Mode */}
                  <section className="space-y-4">
                     <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                       <div className="flex items-start gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center shrink-0">
                           <Zap className="w-6 h-6 text-violet-500" />
                         </div>
                         <div className="flex-1">
                             <h3 className="font-bold text-gray-900 dark:text-white text-lg">Mode Simulasi Realistis</h3>
                             <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                 Aktifkan simulasi percakapan tingkat lanjut: turn-taking kontekstual, backchannel alami, kepribadian konsisten, skenario gangguan, dan fitur hold. Atur tempo bicara secara terpisah di panel atas.
                             </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLocalSettings(prev => ({ ...prev, realisticModeEnabled: !prev.realisticModeEnabled }))}
                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                              localSettings.realisticModeEnabled ? 'bg-violet-500' : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                            role="switch"
                            aria-checked={localSettings.realisticModeEnabled || false}
                            aria-label="Toggle mode simulasi realistis"
                          >
                           <span
                             className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                               localSettings.realisticModeEnabled ? 'translate-x-5' : 'translate-x-0'
                             }`}
                           />
                         </button>
                       </div>
                     </div>

                     {/* Disruption Type Configuration - only shown when realistic mode is enabled */}
                     {localSettings.realisticModeEnabled && (
                       <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                         <h4 className="font-bold text-gray-900 dark:text-white text-base mb-2">Skenario Gangguan</h4>
                         <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                           Pilih 1-3 tipe gangguan yang akan muncul selama simulasi.
                         </p>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                           {[
                             { id: 'technical_term_confusion', label: 'Bingung Istilah Teknis' },
                             { id: 'repeated_question', label: 'Pertanyaan Berulang' },
                             { id: 'misunderstanding', label: 'Salah Paham' },
                             { id: 'interruption', label: 'Interupsi' },
                             { id: 'incomplete_data', label: 'Data Tidak Lengkap' },
                             { id: 'unclear_voice', label: 'Suara Tidak Jelas' },
                             { id: 'emotional_escalation', label: 'Eskalasi Emosional' },
                           ].map(disruption => {
                             const currentTypes = localSettings.realisticModeDisruptionTypes || [];
                             const isSelected = currentTypes.includes(disruption.id);
                             const isDisabled = !isSelected && currentTypes.length >= 3;
                             return (
                               <button
                                 key={disruption.id}
                                 type="button"
                                 disabled={isDisabled}
                                 onClick={() => {
                                   setLocalSettings(prev => {
                                     const current = prev.realisticModeDisruptionTypes || [];
                                     const updated = isSelected
                                       ? current.filter(t => t !== disruption.id)
                                       : [...current, disruption.id];
                                     return { ...prev, realisticModeDisruptionTypes: updated };
                                   });
                                 }}
                                 className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                                   isSelected
                                     ? 'border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                                     : isDisabled
                                     ? 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                                     : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-500/30'
                                 }`}
                               >
                                 <span
                                   className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                     isSelected
                                       ? 'bg-violet-500 border-violet-500 text-white'
                                       : 'border-gray-300 dark:border-gray-600 bg-transparent'
                                   }`}
                                 >
                                   {isSelected && <Check className="w-3 h-3" />}
                                 </span>
                                 {disruption.label}
                               </button>
                             );
                           })}
                         </div>
                         <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                           {(localSettings.realisticModeDisruptionTypes || []).length}/3 tipe dipilih
                         </p>
                       </div>
                     )}
                  </section>
               </div>
           )}

         </div>
      </motion.div>
    </div>
  );
};
