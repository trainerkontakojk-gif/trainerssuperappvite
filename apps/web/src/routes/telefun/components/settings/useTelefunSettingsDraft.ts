import { useState, useEffect, useRef } from "react";
import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  normalizeTelefunLiveModelSelection,
} from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import {
  TelefunAppSettings as AppSettings,
  TelefunScenario as Scenario,
  TelefunConsumerType as ConsumerType,
  ConsumerDifficulty,
  coerceIdentityVoiceForModel,
  normalizeTelefunConsumerDifficulty,
} from "../../telefunSettings";
import {
  normalizeTelefunConsumerDraft,
  normalizeTelefunScenarioDraft,
} from "./telefunDraftNormalizers";
import { normalizeSimulationChallengeTypes } from "../../services/simulationChallenges";
import type { TelefunProviderReadinessState } from "../../hooks/useTelefunProviderReadiness";
import {
  isAllowedTelefunWebRtc,
  type TelefunWebRtcCapability,
} from "../../services/telefunWebRtcCapability";

interface UseTelefunSettingsDraftProps {
  settings: AppSettings;
  isOpen: boolean;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onClose: () => void;
  providerReadiness?: TelefunProviderReadinessState;
  webRtcCapability?: TelefunWebRtcCapability | null;
}

const UNAVAILABLE_PROVIDER_READINESS: TelefunProviderReadinessState = {
  status: "unavailable",
  openai: null,
};

function isOpenAIReady(
  providerReadiness: TelefunProviderReadinessState,
): boolean {
  return (
    providerReadiness.status === "ready" &&
    providerReadiness.openai.enabled &&
    providerReadiness.openai.configured &&
    providerReadiness.openai.ready
  );
}

function resolveAvailableModel(
  modelId: string,
  providerReadiness: TelefunProviderReadinessState,
  persistedSelection?: {
    modelId?: string;
    transport?: AppSettings["telefunTransport"];
  },
  webRtcCapability?: TelefunWebRtcCapability | null,
) {
  const selectedModel = normalizeTelefunLiveModelSelection(
    modelId,
    persistedSelection?.transport,
  );
  const isAllowedWebRtcPilot =
    selectedModel.model.id === "gpt-realtime-2.1" &&
    selectedModel.transport === "openai-webrtc" &&
    isAllowedTelefunWebRtc(webRtcCapability);
  const isPersistedOpenAISelection =
    persistedSelection?.modelId === selectedModel.model.id &&
    persistedSelection.transport === selectedModel.transport;
  if (
    selectedModel.model.provider === "openai" &&
    !isOpenAIReady(providerReadiness) &&
    !isAllowedWebRtcPilot &&
    !(providerReadiness.status === "loading" && isPersistedOpenAISelection)
  ) {
    return normalizeTelefunLiveModelSelection(DEFAULT_TELEFUN_LIVE_MODEL_ID);
  }
  return selectedModel;
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
  const selectedModel = resolveAvailableModel(
    params.selectedTelefunModel,
    params.providerReadiness ?? UNAVAILABLE_PROVIDER_READINESS,
    {
      modelId: params.localSettings.telefunModelId,
      transport:
        params.selectedTelefunTransport ??
        params.localSettings.telefunTransport,
    },
    params.webRtcCapability,
  );
  const selectedTransport =
    params.selectedTelefunTransport ?? selectedModel.transport;
  const canPersistWebRtc =
    selectedTransport === "openai-webrtc" &&
    selectedModel.model.id === "gpt-realtime-2.1" &&
    isAllowedTelefunWebRtc(params.webRtcCapability);
  const persistedTransport = canPersistWebRtc
    ? "openai-webrtc"
    : selectedModel.transport === "openai-webrtc"
      ? normalizeTelefunLiveModelSelection(selectedModel.model.id).transport
      : selectedModel.transport;

  const settingsToSave = {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes.map(normalizeTelefunConsumerDifficulty),
    telefunTransport: persistedTransport,
    telefunModelId: selectedModel.model.id,
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
  providerReadiness = UNAVAILABLE_PROVIDER_READINESS,
  webRtcCapability = null,
}: UseTelefunSettingsDraftProps) {
  const [activeTab, setActiveTab] = useState<
    "scenarios" | "consumers" | "identity" | "system"
  >("scenarios");
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  const selectedTelefunModel =
    localSettings.telefunModelId || DEFAULT_TELEFUN_LIVE_MODEL_ID;
  const selectedTelefunTransport =
    localSettings.telefunTransport ||
    normalizeTelefunLiveModelSelection(selectedTelefunModel).transport;

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
      const selectedModel = normalizeTelefunLiveModelSelection(
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
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen || providerReadiness.status !== "unavailable") return;
    setLocalSettings((prev) => {
      const currentModel = normalizeTelefunLiveModelSelection(
        prev.telefunModelId,
        prev.telefunTransport,
      );
      if (currentModel.model.provider !== "openai") return prev;
      if (
        currentModel.transport === "openai-webrtc" &&
        (webRtcCapability === null || isAllowedTelefunWebRtc(webRtcCapability))
      ) {
        return prev;
      }

      const fallback = normalizeTelefunLiveModelSelection(
        DEFAULT_TELEFUN_LIVE_MODEL_ID,
      );
      return {
        ...prev,
        telefunModelId: fallback.model.id,
        telefunTransport: fallback.transport,
        telefunModelWarningReason: "provider-unavailable",
        identitySettings: {
          ...prev.identitySettings,
          voiceName: coerceIdentityVoiceForModel({
            modelId: fallback.model.id,
            voiceName: prev.identitySettings.voiceName,
            gender: prev.identitySettings.gender,
          }),
        },
      };
    });
  }, [isOpen, providerReadiness.status, webRtcCapability]);

  const setSelectedTelefunTransport = (
    transport: AppSettings["telefunTransport"],
  ) => {
    if (
      transport === "openai-webrtc" &&
      (selectedTelefunModel !== "gpt-realtime-2.1" ||
        !isAllowedTelefunWebRtc(webRtcCapability))
    ) {
      return;
    }
    setLocalSettings((prev) => ({ ...prev, telefunTransport: transport }));
  };

  const setSelectedTelefunModel = (modelId: string) => {
    const selectedModel = normalizeTelefunLiveModelSelection(modelId);
    const isAllowedWebRtcPilot =
      selectedModel.model.id === "gpt-realtime-2.1" &&
      isAllowedTelefunWebRtc(webRtcCapability);
    if (
      selectedModel.model.provider === "openai" &&
      !isOpenAIReady(providerReadiness) &&
      !isAllowedWebRtcPilot
    ) {
      return;
    }
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

  const handleSelectAll = () => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) => ({
        ...s,
        isActive: true,
      })),
    }));
  };

  const handleUnselectAll = () => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) => ({
        ...s,
        isActive: false,
      })),
    }));
  };

  const handleToggleScenario = (id: string) => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      scenarios: prev.scenarios.map((s: Scenario) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s,
      ),
    }));
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?")) {
      setLocalSettings((prev: AppSettings) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s: Scenario) => s.id !== id),
      }));
    }
  };

  const handleSelectConsumerType = (id: string) => {
    setLocalSettings((prev: AppSettings) => ({
      ...prev,
      preferredConsumerTypeId: id,
    }));
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev: AppSettings) => {
        const newTypes = prev.consumerTypes.filter(
          (c: ConsumerType) => c.id !== id,
        );
        return {
          ...prev,
          consumerTypes: newTypes,
          preferredConsumerTypeId:
            prev.preferredConsumerTypeId === id
              ? "random"
              : prev.preferredConsumerTypeId,
        };
      });
    }
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
    const selectedModel = normalizeTelefunLiveModelSelection(
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
      setTimeout(() => {
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      alert(
        "Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.",
      );
      return;
    }

    if (consumerDirty && !consumerForm.isValid()) {
      setActiveTab("consumers");
      setTimeout(() => {
        document
          .getElementById("consumer-form")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      alert(
        "Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.",
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
      providerReadiness,
      webRtcCapability,
    });

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSave(settingsToSave);
      if (scenarioDirty) scenarioForm.close();
      if (consumerDirty) consumerForm.close();
      onClose();
    } catch {
      // The parent reports the save error. Keep this draft open for retry.
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (saveInFlightRef.current) return;
    if (hasUnsavedChanges()) {
      if (!window.confirm("Perubahan belum disimpan. Yakin ingin keluar?"))
        return;
    }
    onClose();
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
    handleSelectAll,
    handleUnselectAll,
    handleToggleScenario,
    handleDeleteScenario,
    handleSelectConsumerType,
    handleDeleteConsumer,
    isSaving,
    handleSave,
    handleClose,
  };
}
