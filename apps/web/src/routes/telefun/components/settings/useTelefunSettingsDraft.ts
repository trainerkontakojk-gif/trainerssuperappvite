import { useState, useEffect } from 'react';
import { useCrudForm } from '../../../../hooks/useCrudForm';
import { 
  TelefunAppSettings as AppSettings, 
  TelefunScenario as Scenario, 
  TelefunConsumerType as ConsumerType, 
  ConsumerDifficulty,
  VOICE_MODELS as TELEFUN_AUDIO_MODELS
} from '../../telefunSettings';

interface UseTelefunSettingsDraftProps {
  settings: AppSettings;
  isOpen: boolean;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
}

export function useTelefunSettingsDraft({
  settings,
  isOpen,
  onSave,
  onClose,
}: UseTelefunSettingsDraftProps) {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'consumers' | 'identity' | 'system'>('scenarios');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  
  const [selectedTelefunModel, setSelectedTelefunModel] = useState<string>(
    settings.telefunModelId || TELEFUN_AUDIO_MODELS[0]?.id || 'gemini-3.1-flash-live-preview'
  );

  const scenarioForm = useCrudForm<Scenario>({
    generateId: () => `s-${Date.now()}`,
    defaultValues: {
      category: '',
      title: '',
      instruction: '',
      script: '',
      isActive: true,
    },
    validate: (draft) => !!(draft.title && draft.instruction && draft.category),
  });

  const consumerForm = useCrudForm<ConsumerType>({
    generateId: () => `c-${Date.now()}`,
    defaultValues: {
      name: '',
      description: '',
      difficulty: ConsumerDifficulty.Medium,
      gender: 'random',
    },
    validate: (draft) => !!(draft.name && draft.description),
  });

  // Sync settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      scenarioForm.close();
      consumerForm.close();
      setSelectedTelefunModel(settings.telefunModelId || TELEFUN_AUDIO_MODELS[0]?.id || 'gemini-3.1-flash-live-preview');
    }
  }, [isOpen, settings]);

  const handleSelectAll = () => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) => ({ ...s, isActive: true }))
    }));
  };

  const handleUnselectAll = () => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) => ({ ...s, isActive: false }))
    }));
  };

  const handleToggleScenario = (id: string) => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) => s.id === id ? { ...s, isActive: !s.isActive } : s)
    }));
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm('Hapus skenario ini?')) {
      setLocalSettings((prev: AppSettings) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s: Scenario) => s.id !== id)
      }));
    }
  };

  const handleSelectConsumerType = (id: string) => {
    setLocalSettings((prev: AppSettings) => ({ ...prev, preferredConsumerTypeId: id }));
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm('Hapus karakteristik ini?')) {
      setLocalSettings((prev: AppSettings) => {
        const newTypes = prev.consumerTypes.filter((c: ConsumerType) => c.id !== id);
        return {
          ...prev,
          consumerTypes: newTypes,
          preferredConsumerTypeId: prev.preferredConsumerTypeId === id ? 'random' : prev.preferredConsumerTypeId
        };
      });
    }
  };

  const hasUnsavedChanges = () => {
    if (scenarioForm.isDirty(localSettings.scenarios) || consumerForm.isDirty(localSettings.consumerTypes)) {
      return true;
    }
    const original = JSON.stringify(settings);
    
    // Construct hypothetical settings with current selections
    const selectedTelefunTransport = TELEFUN_AUDIO_MODELS.find((m: any) => m.id === selectedTelefunModel)?.telefunTransport || 'gemini-live';
    const currentSettings = {
      ...localSettings,
      telefunModelId: selectedTelefunModel,
      telefunTransport: selectedTelefunTransport,
    };
    
    const current = JSON.stringify(currentSettings);
    return original !== current;
  };

  const handleSave = () => {
    const scenarioDirty = scenarioForm.isDirty(localSettings.scenarios);
    const consumerDirty = consumerForm.isDirty(localSettings.consumerTypes);

    if (scenarioDirty && !scenarioForm.isValid()) {
      setActiveTab('scenarios');
      setTimeout(() => {
        document.getElementById('scenario-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      alert('Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.');
      return;
    }

    if (consumerDirty && !consumerForm.isValid()) {
      setActiveTab('consumers');
      setTimeout(() => {
        document.getElementById('consumer-form')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      alert('Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.');
      return;
    }

    const selectedTelefunTransport = TELEFUN_AUDIO_MODELS.find((m: any) => m.id === selectedTelefunModel)?.telefunTransport || 'gemini-live';
    let finalSettings: AppSettings = {
      ...localSettings,
      telefunTransport: selectedTelefunTransport as any,
      telefunModelId: selectedTelefunModel,
    };

    if (scenarioDirty) {
      finalSettings.scenarios = scenarioForm.save(finalSettings.scenarios);
      scenarioForm.close();
    }
    if (consumerDirty) {
      finalSettings.consumerTypes = consumerForm.save(finalSettings.consumerTypes);
      consumerForm.close();
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

  return {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    selectedTelefunModel,
    setSelectedTelefunModel,
    scenarioForm,
    consumerForm,
    handleSelectAll,
    handleUnselectAll,
    handleToggleScenario,
    handleDeleteScenario,
    handleSelectConsumerType,
    handleDeleteConsumer,
    handleSave,
    handleClose,
  };
}
