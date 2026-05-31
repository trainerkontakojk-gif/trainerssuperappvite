import { useState, useEffect } from "react";
import type {
  PdktScenario,
  PdktConsumerType,
} from "@trainers/types";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { DEFAULT_PDKT_MODEL_ID, coercePdktModelId } from "../../pdktSettings";
import { TEXT_MODELS } from "../../pdktSettings";

export interface UsePdktSettingsDraftProps {
  settings: AppSettings;
  isOpen: boolean;
  onSave: (newSettings: AppSettings) => void;
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

export function buildPdktSettingsForSave(params: {
  localSettings: AppSettings;
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  system: PdktSystemDraft;
}): AppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    enableImageGeneration: params.system.enableImageGeneration,
    globalConsumerTypeId: params.system.globalConsumerTypeId,
    selectedModel: params.system.selectedModel,
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
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

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
    localSettings.selectedModel || DEFAULT_PDKT_MODEL_ID,
  );

  const [consumerNameMentionPattern, setConsumerNameMentionPattern] = useState(
    localSettings.consumerNameMentionPattern || "random",
  );
  const [writingStyleMode, setWritingStyleMode] = useState<
    "realistic" | "training"
  >(localSettings.writingStyleMode || "training");

  const scenarioForm = useCrudForm<PdktScenario>({
    generateId: () => `s-${Date.now()}`,
    defaultValues: {
      category: "",
      title: "",
      description: "",
      sampleEmailTemplate: {
        subject: "",
        body: "",
      },
      alwaysUseSampleEmail: false,
      isLicensed: false,
      isActive: true,
      attachmentImages: [],
    },
    validate: (draft) => !!(draft.title && draft.description && draft.category),
    createItem: (id, draft) => ({
      id,
      category: draft.category || "Umum",
      title: draft.title,
      description: draft.description,
      sampleEmailTemplate: draft.sampleEmailTemplate ?? { subject: "", body: "" },
      alwaysUseSampleEmail: draft.alwaysUseSampleEmail ?? false,
      isLicensed: draft.isLicensed ?? false,
      isActive: draft.isActive ?? true,
      script: draft.script,
      attachmentImages: draft.attachmentImages ?? [],
    }),
  });

  const consumerForm = useCrudForm<PdktConsumerType>({
    generateId: () => `c-${Date.now()}`,
    defaultValues: {
      name: "",
      description: "",
      difficulty: "Medium",
      tone: "",
      isCustom: true,
    },
    validate: (draft) => !!(draft.name && draft.description),
    createItem: (id, draft) => ({
      id,
      name: draft.name,
      description: draft.description,
      difficulty: draft.difficulty ?? "Medium",
      tone: draft.tone ?? "",
      isCustom: true,
    }),
  });

  // Sync state when modal opens to ensure fresh data
  useEffect(() => {
    if (isOpen) {
      const normalizedModel = coercePdktModelId(settings.selectedModel);
      const nextSelectedModel = TEXT_MODELS.some(
        (model) => model.id === normalizedModel,
      )
        ? normalizedModel
        : DEFAULT_PDKT_MODEL_ID;
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

      scenarioForm.close();
      consumerForm.close();
    }
  }, [isOpen, settings]);

  const handleSave = () => {
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

    if (scenarioForm.draft.alwaysUseSampleEmail && !scenarioForm.draft.sampleEmailTemplate?.body?.trim()) {
      setActiveTab("scenarios");
      setTimeout(() => {
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      notify.warning(
        'Isi body template email jika Anda memilih "Always use this email".',
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

      if (scenarioDirty) {
        scenarioForm.close();
      }
      if (consumerDirty) {
        consumerForm.close();
      }

      onSave(settingsToSave);
      onClose();
    } catch (e) {
      notify.error(
        "Gagal menyimpan! Ukuran data (gambar) terlalu besar untuk penyimpanan browser. Silakan hapus beberapa gambar.",
      );
      console.error(e);
    }
  };

  const handleResetDefaults = () => {
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

      onSave(defaultSettings);
      onClose();
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
  };
}
