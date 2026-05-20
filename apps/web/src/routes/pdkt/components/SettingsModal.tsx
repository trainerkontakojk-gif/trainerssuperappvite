import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, Edit2, Trash2, Image as ImageIcon, User, Settings, FileText, Users, Save, Sparkles, Loader2 } from 'lucide-react';
import type { PdktScenario, PdktConsumerType, PdktIdentity } from '@trainers/types';
import ScenarioImage from './ScenarioImage';
import { postApi } from '../../../hooks/useApi';

export interface AppSettings {
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  enableImageGeneration: boolean;
  globalConsumerTypeId: string;
  selectedModel: string;
  consumerNameMentionPattern: 'random' | 'upfront' | 'middle' | 'late' | 'none';
  writingStyleMode: 'realistic' | 'training';
  customIdentity?: {
    senderName: string;
    email: string;
    city: string;
    bodyName: string;
  };
}

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
  defaultConsumerTypes
}) => {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'consumers' | 'identity' | 'system'>('scenarios');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  const TEXT_MODELS = [
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Cepat dan efisien untuk percakapan.' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Model Gemini 3 paling cepat.' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', description: 'Model Gemini 3.1 powerful.' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Model ringan Gemini 2.0.' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (OpenRouter)', description: 'Model open-weight yang kuat.' },
    { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (OR)', description: 'Gemini 3.1 via OpenRouter.' },
    { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (OR)', description: 'Gemini 2.0 via OpenRouter.' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenRouter)', description: 'Model OpenAI compact.' },
    { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen 3.5 Flash (OpenRouter)', description: 'Model Qwen cepat.' },
  ];

  // Scenario Form State
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [isAddingScenario, setIsAddingScenario] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState('');
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [newScenarioTemplateSubject, setNewScenarioTemplateSubject] = useState('');
  const [newScenarioTemplateBody, setNewScenarioTemplateBody] = useState('');
  const [newScenarioAlwaysUseTemplate, setNewScenarioAlwaysUseTemplate] = useState(false);
  const [newScenarioIsLicensed, setNewScenarioIsLicensed] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const templateGenerationTokenRef = useRef<string | null>(null);
  
  const [newScenarioImages, setNewScenarioImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consumer Form State
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(null);
  const [isAddingConsumer, setIsAddingConsumer] = useState(false);
  const [newConsumerName, setNewConsumerName] = useState('');
  const [newConsumerDesc, setNewConsumerDesc] = useState('');
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [newConsumerTone, setNewConsumerTone] = useState('');

  // Identity Form State
  const [customSenderName, setCustomSenderName] = useState(localSettings.customIdentity?.senderName || '');
  const [customBodyName, setCustomBodyName] = useState(localSettings.customIdentity?.bodyName || '');
  const [customEmail, setCustomEmail] = useState(localSettings.customIdentity?.email || '');
  const [customCity, setCustomCity] = useState(localSettings.customIdentity?.city || '');

  // Global Settings
  const [enableImageGeneration, setEnableImageGeneration] = useState(localSettings.enableImageGeneration ?? true);
  const [globalConsumerTypeId, setGlobalConsumerTypeId] = useState(localSettings.globalConsumerTypeId || 'random');
  const [selectedModel, setSelectedModel] = useState(localSettings.selectedModel || 'gemini-3.1-flash-lite');

  const [consumerNameMentionPattern, setConsumerNameMentionPattern] = useState(
    localSettings.consumerNameMentionPattern || 'random'
  );
  const [writingStyleMode, setWritingStyleMode] = useState<'realistic' | 'training'>(
    localSettings.writingStyleMode || 'training'
  );

  // Sync state when modal opens to ensure fresh data
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setCustomSenderName(settings.customIdentity?.senderName || '');
      setCustomBodyName(settings.customIdentity?.bodyName || '');
      setCustomEmail(settings.customIdentity?.email || '');
      setCustomCity(settings.customIdentity?.city || '');
      setEnableImageGeneration(settings.enableImageGeneration ?? true);
      setGlobalConsumerTypeId(settings.globalConsumerTypeId || 'random');
      setSelectedModel(settings.selectedModel || 'gemini-3.1-flash-lite');
      setConsumerNameMentionPattern(settings.consumerNameMentionPattern || 'random');
      setWritingStyleMode(settings.writingStyleMode || 'training');

      // Reset forms
      setEditingScenarioId(null);
      setIsAddingScenario(false);
      setNewScenarioImages([]);
      setEditingConsumerId(null);
      setIsAddingConsumer(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(localSettings.scenarios.map(s => s.category)));

  const handleToggleScenario = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s)
    }));
  };

  const handleToggleAllScenarios = (checked: boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => ({ ...s, isActive: checked }))
    }));
  };

  const handleAddScenario = () => {
    setEditingScenarioId(null);
    setIsAddingScenario(true);
    setNewScenarioCategory('');
    setNewScenarioTitle('');
    setNewScenarioDesc('');
    setNewScenarioTemplateSubject('');
    setNewScenarioTemplateBody('');
    setNewScenarioAlwaysUseTemplate(false);
    setNewScenarioIsLicensed(false);
    setNewScenarioImages([]);
    setIsNewCategoryInput(false);
    
    setTimeout(() => {
      document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleEditScenario = (scenario: PdktScenario) => {
    setEditingScenarioId(scenario.id);
    setIsAddingScenario(true);
    setNewScenarioCategory(scenario.category);
    setNewScenarioTitle(scenario.title);
    setNewScenarioDesc(scenario.description);
    setNewScenarioTemplateSubject(scenario.sampleEmailTemplate?.subject || '');
    setNewScenarioTemplateBody(scenario.sampleEmailTemplate?.body || '');
    setNewScenarioAlwaysUseTemplate(scenario.alwaysUseSampleEmail || false);
    setNewScenarioIsLicensed(scenario.isLicensed || false);
    setNewScenarioImages(scenario.attachmentImages || []);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    
    setTimeout(() => {
      document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRemoveScenario = (id: string) => {
    if (confirm('Hapus skenario kustom ini?')) {
      setLocalSettings(prev => ({
        ...prev,
        scenarios: prev.scenarios.filter(s => s.id !== id)
      }));
    }
  };

  const resetScenarioForm = () => {
    templateGenerationTokenRef.current = null;
    setEditingScenarioId(null);
    setIsAddingScenario(false);
    setNewScenarioTitle('');
    setNewScenarioDesc('');
    setNewScenarioTemplateSubject('');
    setNewScenarioTemplateBody('');
    setNewScenarioAlwaysUseTemplate(false);
    setNewScenarioIsLicensed(false);
    setNewScenarioCategory('');
    setNewScenarioImages([]);
    setIsNewCategoryInput(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      if (file.size > 500 * 1024) {
        alert("Ukuran gambar terlalu besar! Maksimal 500KB per gambar agar pengaturan dapat disimpan.");
        return;
      }
      
      if (newScenarioImages.length >= 5) {
        alert("Maksimal 5 gambar per skenario.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setNewScenarioImages(prev => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setNewScenarioImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleGenerateTemplate = async () => {
    if (!newScenarioTitle || !newScenarioDesc) {
      alert('Isi judul dan deskripsi masalah terlebih dahulu untuk generate template.');
      return;
    }

    const draftIdentity = `${editingScenarioId || 'new'}|${newScenarioTitle}|${newScenarioDesc}|${newScenarioCategory}`;
    templateGenerationTokenRef.current = draftIdentity;
    setIsGeneratingTemplate(true);
    try {
      const category = isNewCategoryInput ? newScenarioCategory : newScenarioCategory || "Umum";
      const draft: PdktScenario = {
        id: editingScenarioId || 'draft',
        category,
        title: newScenarioTitle,
        description: newScenarioDesc,
        isActive: true,
        isLicensed: newScenarioIsLicensed,
        sampleEmailTemplate: {
          subject: newScenarioTemplateSubject,
          body: newScenarioTemplateBody
        },
        attachmentImages: newScenarioImages
      };

      const identity: PdktIdentity = {
        name: customSenderName || 'Budi Santoso',
        email: customEmail || 'budi.santoso88@gmail.com',
        city: customCity || 'Jakarta',
        bodyName: customBodyName || 'Budi'
      };

      const result = await postApi<{ subject: string; body: string }>('/pdkt/generate-template', {
        scenarioDraft: draft,
        consumerTypeId: globalConsumerTypeId === 'random' ? 'ramah' : globalConsumerTypeId,
        identity
      });

      if (templateGenerationTokenRef.current !== draftIdentity) {
        return;
      }
      setNewScenarioTemplateSubject(result.subject);
      setNewScenarioTemplateBody(result.body);
    } catch (e: any) {
      alert(e.message || 'Gagal generate template.');
    } finally {
      if (templateGenerationTokenRef.current === draftIdentity) {
        setIsGeneratingTemplate(false);
        templateGenerationTokenRef.current = null;
      }
    }
  };

  const handleAddConsumer = () => {
    setEditingConsumerId(null);
    setIsAddingConsumer(true);
    setNewConsumerName('');
    setNewConsumerDesc('');
    setNewConsumerDifficulty('Medium');
    setNewConsumerTone('');
    
    setTimeout(() => {
      document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleEditConsumer = (consumer: PdktConsumerType) => {
    setEditingConsumerId(consumer.id);
    setIsAddingConsumer(true);
    setNewConsumerName(consumer.name);
    setNewConsumerDesc(consumer.description);
    setNewConsumerDifficulty(consumer.difficulty || 'Medium');
    setNewConsumerTone(consumer.tone || '');
    
    setTimeout(() => {
      document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRemoveConsumer = (id: string) => {
    if (confirm('Hapus karakteristik konsumen kustom ini?')) {
      setLocalSettings(prev => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter(c => c.id !== id)
      }));
    }
  };

  const resetConsumerForm = () => {
    setEditingConsumerId(null);
    setIsAddingConsumer(false);
    setNewConsumerName('');
    setNewConsumerDesc('');
    setNewConsumerDifficulty('Medium');
    setNewConsumerTone('');
  };

  const isScenarioDraftDirty = () => isAddingScenario || editingScenarioId !== null;
  const isScenarioDraftValid = () => {
    if (!newScenarioTitle) return false;
    if (!newScenarioDesc) return false;
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
                description: newScenarioDesc,
                sampleEmailTemplate: {
                  subject: newScenarioTemplateSubject,
                  body: newScenarioTemplateBody
                },
                alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
                isLicensed: newScenarioIsLicensed,
                attachmentImages: newScenarioImages
              }
            : s
        )
      };
    } else {
      const newScenario: PdktScenario = {
        id: `s-${Date.now()}`,
        category,
        title: newScenarioTitle,
        description: newScenarioDesc,
        sampleEmailTemplate: {
          subject: newScenarioTemplateSubject,
          body: newScenarioTemplateBody
        },
        alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
        isLicensed: newScenarioIsLicensed,
        isActive: true,
        attachmentImages: newScenarioImages
      };
      return {
        ...base,
        scenarios: [...base.scenarios, newScenario]
      };
    }
  };

  const isConsumerDraftDirty = () => isAddingConsumer || editingConsumerId !== null;
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
            ? { ...c, name: newConsumerName, description: newConsumerDesc, difficulty: newConsumerDifficulty, tone: newConsumerTone }
            : c
        )
      };
    } else {
      const newConsumer: PdktConsumerType = {
        id: `c-${Date.now()}`,
        name: newConsumerName,
        description: newConsumerDesc,
        difficulty: newConsumerDifficulty,
        tone: newConsumerTone,
        isCustom: true
      };
      return {
        ...base,
        consumerTypes: [...base.consumerTypes, newConsumer]
      };
    }
  };

  const handleSaveScenario = () => {
    const applied = applyScenarioDraft(localSettings);
    if (applied) {
      setLocalSettings(applied);
      resetScenarioForm();
    }
  };

  const handleSaveConsumer = () => {
    const applied = applyConsumerDraft(localSettings);
    if (applied) {
      setLocalSettings(applied);
      resetConsumerForm();
    }
  };

  const handleSave = () => {
    const scenarioDirty = isScenarioDraftDirty();
    const consumerDirty = isConsumerDraftDirty();

    if (scenarioDirty && !isScenarioDraftValid()) {
      setActiveTab('scenarios');
      setTimeout(() => {
        document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      alert('Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.');
      return;
    }

    if (newScenarioAlwaysUseTemplate && !newScenarioTemplateBody.trim()) {
      setActiveTab('scenarios');
      setTimeout(() => {
        document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      alert('Isi body template email jika Anda memilih "Always use this email".');
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

    let finalSettings = localSettings;
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

    try {
      const settingsToSave: AppSettings = {
        ...finalSettings,
        enableImageGeneration,
        globalConsumerTypeId,
        selectedModel,
        consumerNameMentionPattern,
        writingStyleMode,
        customIdentity: {
          senderName: customSenderName,
          bodyName: customBodyName,
          email: customEmail,
          city: customCity
        }
      };

      onSave(settingsToSave);
      onClose();
    } catch (e) {
      alert("Gagal menyimpan! Ukuran data terlalu besar.");
      console.error(e);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm("Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.")) {
      const defaultSettings: AppSettings = {
        scenarios: defaultScenarios,
        consumerTypes: defaultConsumerTypes,
        enableImageGeneration: true,
        globalConsumerTypeId: 'random',
        selectedModel: 'gemini-3.1-flash-lite',
        consumerNameMentionPattern: 'random',
        writingStyleMode: 'training',
        customIdentity: {
          senderName: '',
          email: '',
          city: '',
          bodyName: ''
        }
      };

      setLocalSettings(defaultSettings);
      setEnableImageGeneration(true);
      setGlobalConsumerTypeId('random');
      setSelectedModel('gemini-3.1-flash-lite');
      setConsumerNameMentionPattern('random');
      setWritingStyleMode('training');
      setCustomSenderName('');
      setCustomBodyName('');
      setCustomEmail('');
      setCustomCity('');

      resetScenarioForm();
      resetConsumerForm();
      
      onSave(defaultSettings);
      onClose();
    }
  };

  const tabs = [
    { id: 'scenarios' as const, label: 'Masalah', icon: FileText },
    { id: 'consumers' as const, label: 'Karakter', icon: Users },
    { id: 'identity' as const, label: 'Identitas', icon: User },
    { id: 'system' as const, label: 'Sistem', icon: Settings },
  ];

  const activeCount = localSettings.scenarios.filter(s => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;

  const handleSelectAll = () => {
    setLocalSettings(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => ({ ...s, isActive: !allSelected }))
    }));
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Dialog content */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col h-[85vh] transition-all transform scale-100">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Pengaturan Simulasi PDKT</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Konfigurasi skenario, karakteristik konsumen, identitas, dan parameter model</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Tabs Sidebar */}
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-4 shrink-0 flex flex-col justify-between">
            <div className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                      isActive 
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/10' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleResetDefaults}
              className="w-full text-center py-2 text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0"
            >
              Reset ke Default
            </button>
          </div>

          {/* Main Area */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {activeTab === 'scenarios' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSelectAll}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {allSelected ? 'Kosongkan Semua' : 'Pilih Semua'}
                    </button>
                    <span className="text-[10px] text-gray-500">
                      {activeCount} dari {totalScenarios} skenario terpilih
                    </span>
                  </div>
                  <button
                    onClick={handleAddScenario}
                    className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-[10px] font-bold hover:bg-sky-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Masalah
                  </button>
                </div>

                <div className="space-y-2">
                  {localSettings.scenarios.map((scenario) => {
                    const isDefault = defaultScenarios.some(ds => ds.id === scenario.id);
                    return (
                      <div 
                        key={scenario.id} 
                        className={`flex items-start justify-between p-4 rounded-xl border transition-all ${
                          scenario.isActive 
                            ? 'bg-sky-50/20 border-sky-100' 
                            : 'bg-white border-gray-200 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-4 flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={scenario.isActive}
                            onChange={() => handleToggleScenario(scenario.id)}
                            className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-gray-900">{scenario.title}</span>
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[8px] font-semibold">
                                {scenario.category}
                              </span>
                              {scenario.isLicensed && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[8px] font-semibold border border-emerald-100">
                                  Licensed
                                </span>
                              )}
                              {!isDefault && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[8px] font-semibold border border-amber-100">
                                  Kustom
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{scenario.description}</p>
                            {scenario.attachmentImages && scenario.attachmentImages.length > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[8px] font-bold text-gray-400 uppercase">Lampiran:</span>
                                <div className="flex gap-1">
                                  {scenario.attachmentImages.map((img, idx) => (
                                    <ScenarioImage key={idx} base64={img} variant="thumbnail" className="w-6 h-6 min-w-[24px] min-h-[24px] rounded" />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditScenario(scenario)}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isDefault && (
                            <button
                              onClick={() => handleRemoveScenario(scenario.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isAddingScenario && (
                  <div id="scenario-form" className="p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-xs font-bold text-gray-900">
                      {editingScenarioId ? 'Edit Skenario Masalah' : 'Skenario Masalah Baru'}
                    </h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Kategori
                        </label>
                        {isNewCategoryInput ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newScenarioCategory}
                              onChange={(e) => setNewScenarioCategory(e.target.value)}
                              placeholder="Kategori Baru"
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                            />
                            <button
                              onClick={() => setIsNewCategoryInput(false)}
                              className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-800"
                            >
                              Pilih
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <select
                              value={newScenarioCategory}
                              onChange={(e) => setNewScenarioCategory(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-sky-500"
                            >
                              <option value="">Pilih Kategori</option>
                              {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setIsNewCategoryInput(true)}
                              className="px-2 py-1 text-[10px] text-sky-600 font-semibold"
                            >
                              Baru
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Nama Masalah / Judul
                        </label>
                        <input
                          type="text"
                          value={newScenarioTitle}
                          onChange={(e) => setNewScenarioTitle(e.target.value)}
                          placeholder="e.g. Pembobolan Rekening"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Deskripsi Masalah (Kondisi/Keluhan)
                      </label>
                      <textarea
                        value={newScenarioDesc}
                        onChange={(e) => setNewScenarioDesc(e.target.value)}
                        placeholder="Deskripsikan kondisi masalah konsumen secara rinci..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newScenarioIsLicensed}
                          onChange={(e) => setNewScenarioIsLicensed(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-xs font-semibold text-gray-700">Perusahaan Berizin OJK</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newScenarioAlwaysUseTemplate}
                          onChange={(e) => setNewScenarioAlwaysUseTemplate(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-xs font-semibold text-gray-700">Paksa Gunakan Template Email</span>
                      </label>
                    </div>

                    <div className="space-y-3 p-4 bg-white rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800">Template Email Masuk</span>
                        <button
                          type="button"
                          onClick={handleGenerateTemplate}
                          disabled={isGeneratingTemplate}
                          className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
                        >
                          {isGeneratingTemplate ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          Generate dengan AI
                        </button>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newScenarioTemplateSubject}
                          onChange={(e) => setNewScenarioTemplateSubject(e.target.value)}
                          placeholder="Subjek Email"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                        />
                        <textarea
                          value={newScenarioTemplateBody}
                          onChange={(e) => setNewScenarioTemplateBody(e.target.value)}
                          placeholder="Isi Body Email..."
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Gambar Attachment (Maksimal 5 gambar, @500KB)
                      </label>
                      <div className="flex items-start gap-4">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-gray-300 hover:border-sky-500 rounded-xl bg-white text-gray-400 hover:text-sky-600 transition-colors"
                        >
                          <ImageIcon className="w-6 h-6 mb-1" />
                          <span className="text-[9px] font-semibold">Upload</span>
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />

                        {newScenarioImages.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {newScenarioImages.map((img, idx) => (
                              <div key={idx} className="relative group w-24 h-24 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                                <ScenarioImage base64={img} variant="grid" className="w-full h-full object-contain" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImage(idx)}
                                  className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 shrink-0">
                      <button
                        onClick={resetScenarioForm}
                        className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleSaveScenario}
                        disabled={!isScenarioDraftValid()}
                        className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-colors disabled:opacity-50"
                      >
                        Simpan Skenario
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'consumers' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">
                    {localSettings.consumerTypes.length} karakteristik konsumen tersedia
                  </span>
                  <button
                    onClick={handleAddConsumer}
                    className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-[10px] font-bold hover:bg-sky-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Karakter
                  </button>
                </div>

                <div className="space-y-2">
                  {localSettings.consumerTypes.map((c) => {
                    const isDefault = defaultConsumerTypes.some(dc => dc.id === c.id);
                    return (
                      <div 
                        key={c.id} 
                        className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-all"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-gray-900">{c.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                              c.difficulty === 'Easy' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : c.difficulty === 'Hard' 
                                ? 'bg-red-50 text-red-700 border border-red-100' 
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {c.difficulty || 'Medium'}
                            </span>
                            {!isDefault && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[8px] font-semibold border border-amber-100">
                                Kustom
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{c.description}</p>
                          {c.tone && (
                            <p className="text-[9px] text-gray-400 mt-1.5">
                              <span className="font-bold text-gray-500">Tone Keluhan:</span> {c.tone}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditConsumer(c)}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isDefault && (
                            <button
                              onClick={() => handleRemoveConsumer(c.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isAddingConsumer && (
                  <div id="consumer-form" className="p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-xs font-bold text-gray-900">
                      {editingConsumerId ? 'Edit Karakteristik Konsumen' : 'Karakteristik Konsumen Baru'}
                    </h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Nama Karakteristik
                        </label>
                        <input
                          type="text"
                          value={newConsumerName}
                          onChange={(e) => setNewConsumerName(e.target.value)}
                          placeholder="e.g. Sangat Cerewet"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Tingkat Kesulitan
                        </label>
                        <select
                          value={newConsumerDifficulty}
                          onChange={(e) => setNewConsumerDifficulty(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-sky-500"
                        >
                          <option value="Easy">Easy (Mudah)</option>
                          <option value="Medium">Medium (Sedang)</option>
                          <option value="Hard">Hard (Sulit)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Deskripsi Karakteristik
                      </label>
                      <textarea
                        value={newConsumerDesc}
                        onChange={(e) => setNewConsumerDesc(e.target.value)}
                        placeholder="Deskripsikan karakteristik respon konsumen ini..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Tone Keluhan (Instruksi Tambahan untuk Gaya Menulis AI)
                      </label>
                      <input
                        type="text"
                        value={newConsumerTone}
                        onChange={(e) => setNewConsumerTone(e.target.value)}
                        placeholder="e.g. Menggunakan huruf kapital di beberapa kata, tidak sabaran."
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 shrink-0">
                      <button
                        onClick={resetConsumerForm}
                        className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleSaveConsumer}
                        disabled={!isConsumerDraftValid()}
                        className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-colors disabled:opacity-50"
                      >
                        Simpan Karakteristik
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'identity' && (
              <div className="space-y-6">
                <div className="p-4 bg-sky-50/30 border border-sky-100 rounded-xl">
                  <p className="text-[11px] text-sky-800 leading-relaxed font-medium">
                    Kustomisasi identitas Anda di dalam simulasi. Jika dikosongkan, AI akan menghasilkan identitas konsumen secara acak saat email masuk dibuat.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Nama Lengkap Pengirim (Konsumen)
                    </label>
                    <input
                      type="text"
                      value={customSenderName}
                      onChange={(e) => setCustomSenderName(e.target.value)}
                      placeholder="e.g. Budi Santoso"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Nama Panggilan (Body Name)
                    </label>
                    <input
                      type="text"
                      value={customBodyName}
                      onChange={(e) => setCustomBodyName(e.target.value)}
                      placeholder="e.g. Budi"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Email Pengirim
                    </label>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="e.g. budi.santoso@email.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Kota Domisili
                    </label>
                    <input
                      type="text"
                      value={customCity}
                      onChange={(e) => setCustomCity(e.target.value)}
                      placeholder="e.g. Jakarta"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Model AI (Hono Provider)
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-sky-500"
                    >
                      {TEXT_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-400 mt-1">Gunakan model Gemini/OpenRouter terdaftar untuk chat/evaluasi.</p>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Karakteristik Default
                    </label>
                    <select
                      value={globalConsumerTypeId}
                      onChange={(e) => setGlobalConsumerTypeId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="random">Random (Acak)</option>
                      {localSettings.consumerTypes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-400 mt-1">Karakter default konsumen saat email dibuat.</p>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Pola Panggilan Nama
                    </label>
                    <select
                      value={consumerNameMentionPattern}
                      onChange={(e) => setConsumerNameMentionPattern(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="random">Random (Acak)</option>
                      <option value="upfront">Di Awal Kalimat (Upfront)</option>
                      <option value="middle">Di Tengah Kalimat (Middle)</option>
                      <option value="late">Di Akhir Kalimat (Late)</option>
                      <option value="none">Tanpa Menyebut Nama</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Mode Simulasi / Gaya Penulisan
                    </label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="writingStyle"
                          value="training"
                          checked={writingStyleMode === 'training'}
                          onChange={() => setWritingStyleMode('training')}
                          className="h-3.5 w-3.5 border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-xs text-gray-700 font-semibold">Training Mode</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="writingStyle"
                          value="realistic"
                          checked={writingStyleMode === 'realistic'}
                          onChange={() => setWritingStyleMode('realistic')}
                          className="h-3.5 w-3.5 border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-xs text-gray-700 font-semibold">Realistic Mode</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-800">Generate Gambar Attachment (AI)</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">Membuat visualisasi bukti transaksi menggunakan model gambar AI.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableImageGeneration}
                      onChange={(e) => setEnableImageGeneration(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-6 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-all"
          >
            <Save className="w-4 h-4" />
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};
