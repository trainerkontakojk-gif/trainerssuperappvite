import { useState, useEffect, useMemo, useRef } from "react";
import type { PdktScenario, PdktConsumerType } from "@trainers/types";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { getSettingsSaveErrorMessage } from "../../../../lib/settings-contract";
import { DEFAULT_PDKT_MODEL_ID, coercePdktModelId } from "../../pdktSettings";
import {
  normalizePdktConsumerDraft,
  normalizePdktScenarioDraft,
} from "./pdktDraftNormalizers";

export interface UsePdktSettingsDraftProps {
  settings: AppSettings;
  isOpen: boolean;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onClose: () => void;
  defaultScenarios: PdktScenario[];
  defaultConsumerTypes: PdktConsumerType[];
}

interface PdktSystemDraft {
  enableImageGeneration: boolean;
  globalConsumerTypeId: string;
  selectedModel: string;
  consumerNameMentionPattern: AppSettings["consumerNameMentionPattern"];
  writingStyleMode: AppSettings["writingStyleMode"];
  customIdentity: NonNullable<AppSettings["customIdentity"]>;
}

function normalizePdktScenarioForSave(scenario: PdktScenario): PdktScenario {
  const compatibilityScenario = { ...(scenario as Record<string, unknown>) };
  delete compatibilityScenario.isLicensed;

  return {
    ...compatibilityScenario,
    ...normalizePdktScenarioDraft(scenario),
  } as PdktScenario;
}

export function buildPdktSettingsForSave(params: {
  localSettings: AppSettings;
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  system: PdktSystemDraft;
}): AppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarios.map(normalizePdktScenarioForSave),
    consumerTypes: params.consumerTypes,
    enableImageGeneration: params.system.enableImageGeneration,
    globalConsumerTypeId: params.system.globalConsumerTypeId,
    selectedModel: coercePdktModelId(params.system.selectedModel),
    consumerNameMentionPattern: params.system.consumerNameMentionPattern,
    writingStyleMode: params.system.writingStyleMode,
    customIdentity: params.system.customIdentity,
  };
}

export function usePdktSettingsDraft({
  settings,
  isOpen,
  onSave,
  onClose,
  defaultScenarios,
  defaultConsumerTypes,
}: UsePdktSettingsDraftProps) {
  const [activeTab, setActiveTab] = useState<
    "scenarios" | "consumers" | "identity" | "system"
  >("scenarios");
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(() => ({
    ...settings,
    selectedModel: coercePdktModelId(settings.selectedModel),
  }));

  // Identity Form State
  const [customSenderName, setCustomSenderName] = useState(
    localSettings.customIdentity?.senderName || "",
  );
  const [customBodyName, setCustomBodyName] = useState(
    localSettings.customIdentity?.bodyName || "",
  );
  const [customEmail, setCustomEmail] = useState(
    localSettings.customIdentity?.email || "",
  );
  const [customCity, setCustomCity] = useState(
    localSettings.customIdentity?.city || "",
  );

  // Global Settings
  const [enableImageGeneration, setEnableImageGeneration] = useState(
    localSettings.enableImageGeneration ?? true,
  );
  const [globalConsumerTypeId, setGlobalConsumerTypeId] = useState(
    localSettings.globalConsumerTypeId || "random",
  );
  const [selectedModel, setSelectedModel] = useState(
    coercePdktModelId(localSettings.selectedModel || DEFAULT_PDKT_MODEL_ID),
  );

  const [consumerNameMentionPattern, setConsumerNameMentionPattern] = useState(
    localSettings.consumerNameMentionPattern || "random",
  );
  const [writingStyleMode, setWritingStyleMode] = useState<
    "realistic" | "training"
  >(localSettings.writingStyleMode || "training");

  const scenarioDefaultValues = useMemo(
    () => ({
      category: "",
      title: "",
      description: "",
      recipientMode: "single" as const,
      recipientEmails: [] as string[],
      sampleEmailTemplate: {
        subject: "",
        body: "",
      },
      alwaysUseSampleEmail: false,
      isActive: true,
      attachmentImages: [],
    }),
    [],
  );

  const consumerDefaultValues = useMemo(
    () => ({
      name: "",
      description: "",
      difficulty: "Medium" as const,
      tone: "",
      isCustom: true,
    }),
    [],
  );

  const scenarioForm = useCrudForm<PdktScenario>({
    generateId: () => `s-${Date.now()}`,
    defaultValues: scenarioDefaultValues,
    validate: (draft) => !!(draft.title && draft.description && draft.category),
    createItem: (id, draft) => ({
      id,
      ...normalizePdktScenarioDraft(draft),
    }),
  });

  const consumerForm = useCrudForm<PdktConsumerType>({
    generateId: () => `c-${Date.now()}`,
    defaultValues: consumerDefaultValues,
    validate: (draft) => !!(draft.name && draft.description),
    createItem: (id, draft) => ({
      id,
      ...normalizePdktConsumerDraft(draft),
    }),
  });
  const closeScenarioForm = scenarioForm.close;
  const closeConsumerForm = consumerForm.close;

  // Sync state when modal opens to ensure fresh data
  useEffect(() => {
    if (isOpen) {
      const nextSelectedModel = coercePdktModelId(settings.selectedModel);
      setLocalSettings({ ...settings, selectedModel: nextSelectedModel });
      setCustomSenderName(settings.customIdentity?.senderName || "");
      setCustomBodyName(settings.customIdentity?.bodyName || "");
      setCustomEmail(settings.customIdentity?.email || "");
      setCustomCity(settings.customIdentity?.city || "");
      setEnableImageGeneration(settings.enableImageGeneration ?? true);
      setGlobalConsumerTypeId(settings.globalConsumerTypeId || "random");
      setSelectedModel(nextSelectedModel);
      setConsumerNameMentionPattern(
        settings.consumerNameMentionPattern || "random",
      );
      setWritingStyleMode(settings.writingStyleMode || "training");

      closeScenarioForm();
      closeConsumerForm();
    }
  }, [isOpen, settings, closeScenarioForm, closeConsumerForm]);

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    const scenarioDirty = scenarioForm.isDirty(localSettings.scenarios);
    const consumerDirty = consumerForm.isDirty(localSettings.consumerTypes);

    if (scenarioDirty && !scenarioForm.isValid()) {
      setActiveTab("scenarios");
      setTimeout(() => {
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      notify.warning(
        "Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.",
      );
      return;
    }

    if (
      scenarioForm.draft.alwaysUseSampleEmail &&
      !scenarioForm.draft.sampleEmailTemplate?.body?.trim()
    ) {
      setActiveTab("scenarios");
      setTimeout(() => {
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      notify.warning(
        "Isi body template email jika opsi template selalu digunakan aktif.",
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
      notify.warning(
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

    try {
      const settingsToSave = buildPdktSettingsForSave({
        localSettings,
        scenarios: nextScenarios,
        consumerTypes: nextConsumerTypes,
        system: {
          enableImageGeneration,
          globalConsumerTypeId,
          selectedModel,
          consumerNameMentionPattern,
          writingStyleMode,
          customIdentity: {
            senderName: customSenderName,
            bodyName: customBodyName,
            email: customEmail,
            city: customCity,
          },
        },
      });

      saveInFlightRef.current = true;
      setIsSaving(true);
      try {
        await onSave(settingsToSave);
        if (scenarioDirty) scenarioForm.close();
        if (consumerDirty) consumerForm.close();
        onClose();
      } catch (e) {
        console.error(e);
        notify.error(
          getSettingsSaveErrorMessage(e, "Gagal menyimpan pengaturan."),
        );
      } finally {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    } catch (e) {
      notify.error(
        "Gagal menyimpan! Ukuran data (gambar) terlalu besar untuk penyimpanan browser. Silakan hapus beberapa gambar.",
      );
      console.error(e);
    }
  };

  const hasUnsavedChanges = () => {
    const baselineModel = coercePdktModelId(settings.selectedModel);
    return (
      JSON.stringify(localSettings) !==
        JSON.stringify({ ...settings, selectedModel: baselineModel }) ||
      customSenderName !== (settings.customIdentity?.senderName || "") ||
      customBodyName !== (settings.customIdentity?.bodyName || "") ||
      customEmail !== (settings.customIdentity?.email || "") ||
      customCity !== (settings.customIdentity?.city || "") ||
      enableImageGeneration !== (settings.enableImageGeneration ?? true) ||
      globalConsumerTypeId !== (settings.globalConsumerTypeId || "random") ||
      selectedModel !== baselineModel ||
      consumerNameMentionPattern !==
        (settings.consumerNameMentionPattern || "random") ||
      writingStyleMode !== (settings.writingStyleMode || "training") ||
      scenarioForm.isDirty(localSettings.scenarios) ||
      consumerForm.isDirty(localSettings.consumerTypes)
    );
  };

  const discardUnsavedChanges = () => {
    const normalizedModel = coercePdktModelId(settings.selectedModel);
    setLocalSettings({ ...settings, selectedModel: normalizedModel });
    setCustomSenderName(settings.customIdentity?.senderName || "");
    setCustomBodyName(settings.customIdentity?.bodyName || "");
    setCustomEmail(settings.customIdentity?.email || "");
    setCustomCity(settings.customIdentity?.city || "");
    setEnableImageGeneration(settings.enableImageGeneration ?? true);
    setGlobalConsumerTypeId(settings.globalConsumerTypeId || "random");
    setSelectedModel(normalizedModel);
    setConsumerNameMentionPattern(
      settings.consumerNameMentionPattern || "random",
    );
    setWritingStyleMode(settings.writingStyleMode || "training");
    scenarioForm.close();
    consumerForm.close();
  };

  const handleResetDefaults = async () => {
    if (saveInFlightRef.current) return;
    if (
      window.confirm(
        "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
      )
    ) {
      const defaultSettings: AppSettings = {
        scenarios: defaultScenarios,
        consumerTypes: defaultConsumerTypes,
        enableImageGeneration: true,
        globalConsumerTypeId: "random",
        selectedModel: DEFAULT_PDKT_MODEL_ID,
        consumerNameMentionPattern: "random",
        writingStyleMode: "training",
        customIdentity: {
          senderName: "",
          email: "",
          city: "",
          bodyName: "",
        },
      };

      saveInFlightRef.current = true;
      setIsSaving(true);
      try {
        await onSave(defaultSettings);
        setLocalSettings(defaultSettings);
        setEnableImageGeneration(true);
        setGlobalConsumerTypeId("random");
        setSelectedModel(DEFAULT_PDKT_MODEL_ID);
        setConsumerNameMentionPattern("random");
        setWritingStyleMode("training");
        setCustomSenderName("");
        setCustomBodyName("");
        setCustomEmail("");
        setCustomCity("");
        scenarioForm.close();
        consumerForm.close();
        onClose();
      } catch (e) {
        console.error(e);
        notify.error(
          getSettingsSaveErrorMessage(e, "Gagal menyimpan pengaturan."),
        );
      } finally {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    }
  };

  return {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    scenarioForm,
    consumerForm,
    customSenderName,
    setCustomSenderName,
    customBodyName,
    setCustomBodyName,
    customEmail,
    setCustomEmail,
    customCity,
    setCustomCity,
    enableImageGeneration,
    setEnableImageGeneration,
    globalConsumerTypeId,
    setGlobalConsumerTypeId,
    selectedModel,
    setSelectedModel,
    consumerNameMentionPattern,
    setConsumerNameMentionPattern,
    writingStyleMode,
    setWritingStyleMode,
    handleSave,
    handleResetDefaults,
    isSaving,
    hasUnsavedChanges,
    discardUnsavedChanges,
  };
}
