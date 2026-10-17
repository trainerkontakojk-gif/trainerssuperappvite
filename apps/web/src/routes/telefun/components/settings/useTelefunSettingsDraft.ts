import { useState, useEffect, useRef } from "react";
import { DEFAULT_TELEFUN_LIVE_MODEL_ID } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import {
  DEFAULT_TELEFUN_SETTINGS,
  TelefunAppSettings as AppSettings,
  TelefunScenario as Scenario,
  TelefunConsumerType as ConsumerType,
  ConsumerDifficulty,
  coerceIdentityVoiceForModel,
  normalizeTelefunBrowserSelection,
  normalizeTelefunConsumerDifficulty,
} from "../../telefunSettings";
import {
  normalizeTelefunConsumerDraft,
  normalizeTelefunScenarioDraft,
} from "./telefunDraftNormalizers";
import { normalizeSimulationChallengeTypes } from "../../services/simulationChallenges";
import type { TelefunProviderReadinessState } from "../../hooks/useTelefunProviderReadiness";
import type { TelefunWebRtcCapability } from "../../services/telefunWebRtcCapability";

interface UseTelefunSettingsDraftProps {
  settings: AppSettings;
  isOpen: boolean;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onClose: () => void;
  providerReadiness?: TelefunProviderReadinessState;
  webRtcCapability?: TelefunWebRtcCapability | null;
}


export function buildTelefunSettingsForSave(params: {
  localSettings: AppSettings;
  scenarios: Scenario[];
  consumerTypes: ConsumerType[];
  selectedTelefunModel: string;
  providerReadiness?: TelefunProviderReadinessState;
  selectedTelefunTransport?: AppSettings["telefunTransport"];
  webRtcCapability?: TelefunWebRtcCapability | null;
}): AppSettings {
  const selectedModel = normalizeTelefunBrowserSelection(
    params.selectedTelefunModel,
    params.selectedTelefunTransport ?? params.localSettings.telefunTransport,
  );
  const persistedTransport = "gemini-live" as const;

  const settingsToSave = {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes.map(normalizeTelefunConsumerDifficulty),
    telefunTransport: persistedTransport,
    telefunModelId: selectedModel.model.id,
    voiceName: coerceIdentityVoiceForModel({
      modelId: selectedModel.model.id,
      voiceName: params.localSettings.voiceName,
      gender: params.localSettings.identitySettings.gender,
    }),
    identitySettings: {
      ...params.localSettings.identitySettings,
      voiceName: coerceIdentityVoiceForModel({
        modelId: selectedModel.model.id,
        voiceName: params.localSettings.identitySettings.voiceName,
        gender: params.localSettings.identitySettings.gender,
      }),
    },
  };
  delete settingsToSave.telefunModelWarningReason;
  settingsToSave.simulationChallengeTypes = normalizeSimulationChallengeTypes(
    settingsToSave.simulationChallengeTypes,
  );
  delete (settingsToSave as unknown as Record<string, unknown>)
    .realisticModeEnabled;
  delete (settingsToSave as unknown as Record<string, unknown>)
    .realisticModeDisruptionTypes;
  delete (settingsToSave as unknown as Record<string, unknown>)
    .systemInstruction;
  return settingsToSave;
}

export function useTelefunSettingsDraft({
  settings,
  isOpen,
  onSave,
  onClose,
  providerReadiness: _providerReadiness,
  webRtcCapability: _webRtcCapability,
}: UseTelefunSettingsDraftProps) {
  const [activeTab, setActiveTab] = useState<
    "scenarios" | "consumers" | "identity" | "system"
  >("scenarios");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  const selectedTelefunModel =
    localSettings.telefunModelId || DEFAULT_TELEFUN_LIVE_MODEL_ID;
  const selectedTelefunTransport =
    localSettings.telefunTransport || "gemini-live";

  const scenarioForm = useCrudForm<Scenario>({
    generateId: () => `s-${Date.now()}`,
    defaultValues: {
      category: "",
      title: "",
      instruction: "",
      script: "",
      isActive: true,
    },
    validate: (draft) => !!(draft.title && draft.instruction && draft.category),
    createItem: (id, draft) => ({
      id,
      ...normalizeTelefunScenarioDraft(draft),
    }),
  });

  const consumerForm = useCrudForm<ConsumerType>({
    generateId: () => `c-${Date.now()}`,
    defaultValues: {
      name: "",
      description: "",
      difficulty: ConsumerDifficulty.Medium,
      gender: "random",
    },
    validate: (draft) => !!(draft.name && draft.description),
    createItem: (id, draft) => ({
      id,
      ...normalizeTelefunConsumerDraft(draft),
    }),
  });

  // Sync settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const selectedModel = normalizeTelefunBrowserSelection(
        settings.telefunModelId,
        settings.telefunTransport,
      );
      setLocalSettings({
        ...settings,
        telefunModelId: selectedModel.model.id,
        telefunTransport: selectedModel.transport,
        identitySettings: {
          ...settings.identitySettings,
          voiceName: coerceIdentityVoiceForModel({
            modelId: selectedModel.model.id,
            voiceName: settings.identitySettings.voiceName,
            gender: settings.identitySettings.gender,
          }),
        },
      });
      scenarioForm.close();
      consumerForm.close();
      setSaveError(null);
    }
    // Hanya saat modal dibuka atau pengaturan berganti. `close` dari
    // `useCrudForm` berubah tiap render (`defaultValues` inline); memasukkannya
    // akan mereset draft terus-menerus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settings]);

  const setSelectedTelefunTransport = (
    transport: AppSettings["telefunTransport"],
  ) => {
    if (transport !== "gemini-live") return;
    setLocalSettings((prev) => ({ ...prev, telefunTransport: transport }));
  };

  const setSelectedTelefunModel = (modelId: string) => {
    const selectedModel = normalizeTelefunBrowserSelection(modelId);
    setLocalSettings((prev) => {
      const voiceName = coerceIdentityVoiceForModel({
        modelId: selectedModel.model.id,
        voiceName: prev.identitySettings.voiceName,
        gender: prev.identitySettings.gender,
      });
      return {
        ...prev,
        telefunModelId: selectedModel.model.id,
        telefunTransport: selectedModel.transport,
        telefunModelWarningReason: undefined,
        identitySettings: { ...prev.identitySettings, voiceName },
      };
    });
  };

  const handleSelectConsumerType = (id: string) => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      preferredConsumerTypeId: id,
    }));
  };

  /** Kembalikan draf ke bawaan; baru berlaku setelah Simpan. */
  const resetToDefaults = () => {
    scenarioForm.close();
    consumerForm.close();
    setSaveError(null);
    setLocalSettings(DEFAULT_TELEFUN_SETTINGS);
  };

  const hasUnsavedChanges = () => {
    if (
      scenarioForm.isDirty(localSettings.scenarios) ||
      consumerForm.isDirty(localSettings.consumerTypes)
    ) {
      return true;
    }
    const original = JSON.stringify(settings);

    // Construct hypothetical settings with current selections
    const selectedModel = normalizeTelefunBrowserSelection(
      selectedTelefunModel,
      selectedTelefunTransport,
    );
    const currentSettings = {
      ...localSettings,
      telefunModelId: selectedModel.model.id,
      telefunTransport: selectedModel.transport,
    };
    delete currentSettings.telefunModelWarningReason;

    const current = JSON.stringify(currentSettings);
    return original !== current;
  };

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    const scenarioDirty = scenarioForm.isDirty(localSettings.scenarios);
    const consumerDirty = consumerForm.isDirty(localSettings.consumerTypes);

    if (scenarioDirty && !scenarioForm.isValid()) {
      setActiveTab("scenarios");
      setSaveError(
        "Skenario yang sedang dibuat belum lengkap. Isi kategori, judul, dan deskripsi, atau batalkan dulu.",
      );
      return;
    }

    if (consumerDirty && !consumerForm.isValid()) {
      setActiveTab("consumers");
      setSaveError(
        "Karakter yang sedang dibuat belum lengkap. Isi nama dan deskripsi, atau batalkan dulu.",
      );
      return;
    }

    const nextScenarios = scenarioDirty
      ? scenarioForm.save(localSettings.scenarios)
      : localSettings.scenarios;
    const nextConsumerTypes = consumerDirty
      ? consumerForm.save(localSettings.consumerTypes)
      : localSettings.consumerTypes;

    const settingsToSave = buildTelefunSettingsForSave({
      localSettings,
      scenarios: nextScenarios,
      consumerTypes: nextConsumerTypes,
      selectedTelefunModel,
      selectedTelefunTransport,
    });

    saveInFlightRef.current = true;
    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave(settingsToSave);
      if (scenarioDirty) scenarioForm.close();
      if (consumerDirty) consumerForm.close();
      onClose();
    } catch {
      // Induk sudah melaporkan galatnya; draf tetap terbuka untuk dicoba lagi.
      setSaveError("Pengaturan belum tersimpan. Coba Simpan lagi.");
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    selectedTelefunModel,
    selectedTelefunTransport,
    setSelectedTelefunModel,
    setSelectedTelefunTransport,
    scenarioForm,
    consumerForm,
    handleSelectConsumerType,
    isSaving,
    saveError,
    handleSave,
    hasUnsavedChanges,
    resetToDefaults,
  };
}
