import { useState, useEffect, useRef } from "react";
import type {
  KetikAppSettings,
  KetikScenario,
  KetikConsumerType,
  KetikQuickTemplate,
} from "@trainers/types";
import {
  DEFAULT_KETIK_SETTINGS,
  mergeKetikQuickTemplates,
} from "@trainers/types";
import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../../../lib/aiModels";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { getSettingsSaveErrorMessage } from "../../../../lib/settings-contract";
import {
  normalizeKetikScenarioDraft,
  normalizeKetikConsumerDraft,
  normalizeKetikQuickTemplateDraft,
} from "./ketikDraftNormalizers";

export interface UseKetikSettingsDraftProps {
  settings: KetikAppSettings;
  isOpen: boolean;
  onSave: (newSettings: KetikAppSettings) => Promise<void>;
  canManageTemplates?: boolean;
  onSaveTemplates?: (templates: KetikQuickTemplate[]) => Promise<void>;
  onClose: () => void;
}

const LEGACY_MODEL_IDS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

export function coerceKetikModelId(modelId?: string | null): string {
  if (TEXT_MODELS.some((model) => model.id === modelId)) {
    return modelId as string;
  }

  if (typeof modelId === "string") {
    if (LEGACY_MODEL_IDS.has(modelId) || modelId.includes("/")) {
      return "gpt-5.4-mini";
    }
  }

  return DEFAULT_KETIK_SETTINGS.selectedModel;
}

export function buildKetikSettingsForSave(params: {
  localSettings: KetikAppSettings;
  scenarios: KetikScenario[];
  consumerTypes: KetikConsumerType[];
  quickTemplates: KetikQuickTemplate[];
  globalQuickTemplates?: KetikQuickTemplate[];
  personalQuickTemplates?: KetikQuickTemplate[];
}): KetikAppSettings {
  const nextSettings: KetikAppSettings = {
    ...params.localSettings,
    selectedModel: coerceKetikModelId(params.localSettings.selectedModel),
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    quickTemplates: params.quickTemplates,
  };
  if (params.globalQuickTemplates !== undefined) {
    nextSettings.globalQuickTemplates = params.globalQuickTemplates;
  }
  if (params.personalQuickTemplates !== undefined) {
    nextSettings.personalQuickTemplates = params.personalQuickTemplates;
  }
  return nextSettings;
}

type DurationMode = "preset" | "custom";

const PRESET_DURATIONS = [5, 10, 15] as const;
const MIN_DURATION = 1;
const MAX_DURATION = 60;

function areQuickTemplatesEqual(
  left: KetikQuickTemplate[],
  right: KetikQuickTemplate[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (template, index) =>
        template.id === right[index]?.id &&
        template.keyword === right[index]?.keyword &&
        template.content === right[index]?.content,
    )
  );
}

export function getKetikTemplateLayers(settings: KetikAppSettings): {
  global: KetikQuickTemplate[];
  personal: KetikQuickTemplate[];
} {
  const storedPersonal = settings.personalQuickTemplates || [];
  const storedPersonalIds = new Set(
    storedPersonal.map((template) => template.id),
  );
  const global =
    settings.globalQuickTemplates ||
    (settings.quickTemplates || []).filter(
      (template) => !storedPersonalIds.has(template.id),
    );
  const globalIds = new Set(global.map((template) => template.id));
  const globalKeywords = new Set(
    global.map((template) => template.keyword.trim().toLowerCase()),
  );
  const personal = storedPersonal.filter(
    (template) =>
      !globalIds.has(template.id) &&
      !globalKeywords.has(template.keyword.trim().toLowerCase()),
  );
  return {
    global,
    personal,
  };
}

export function getKetikHiddenPersonalTemplates(
  settings: KetikAppSettings,
): KetikQuickTemplate[] {
  const storedPersonal = settings.personalQuickTemplates || [];
  const visiblePersonalIds = new Set(
    getKetikTemplateLayers(settings).personal.map((template) => template.id),
  );
  return storedPersonal.filter(
    (template) => !visiblePersonalIds.has(template.id),
  );
}

const classifyDurationMode = (val: number | undefined): DurationMode => {
  const duration = Number(val);
  if (!Number.isFinite(duration)) return "custom";
  return (PRESET_DURATIONS as readonly number[]).includes(duration)
    ? "preset"
    : "custom";
};

const durationToInputValue = (val: number | undefined): string => {
  const duration = Number(val);
  return Number.isFinite(duration) ? String(duration) : "";
};

export function useKetikSettingsDraft({
  settings,
  isOpen,
  onSave,
  canManageTemplates = false,
  onSaveTemplates,
  onClose,
}: UseKetikSettingsDraftProps) {
  const initialTemplateLayers = getKetikTemplateLayers(settings);
  const initialStoredPersonalTemplates = settings.personalQuickTemplates || [];
  const [activeTab, setActiveTab] = useState<
    "scenarios" | "consumers" | "identity" | "system" | "template"
  >("scenarios");
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [templateScope, setTemplateScope] = useState<"global" | "personal">(
    "global",
  );
  const [localSettings, setLocalSettings] = useState<KetikAppSettings>(() => ({
    ...settings,
    selectedModel: coerceKetikModelId(settings.selectedModel),
    globalQuickTemplates: initialTemplateLayers.global,
    quickTemplates: mergeKetikQuickTemplates(
      initialTemplateLayers.global,
      initialStoredPersonalTemplates,
    ),
    personalQuickTemplates: initialStoredPersonalTemplates,
  }));

  const [customInputValue, setCustomInputValue] = useState("");
  const [durationMode, setDurationMode] = useState<DurationMode>(() =>
    classifyDurationMode(settings.simulationDuration),
  );
  const [durationValidationError, setDurationValidationError] = useState<
    string | null
  >(null);

  const scenarioForm = useCrudForm<KetikScenario>({
    generateId: () => `s-${Date.now()}`,
    defaultValues: {
      category: "",
      title: "",
      description: "",
      script: "",
      isActive: true,
      images: [],
    },
    validate: (draft) => !!(draft.title && draft.description && draft.category),
    createItem: (id, draft) => ({
      id,
      ...normalizeKetikScenarioDraft(draft),
    }),
  });

  const consumerForm = useCrudForm<KetikConsumerType>({
    generateId: () => `c-${Date.now()}`,
    defaultValues: {
      name: "",
      description: "",
      difficulty: "Sedang",
      isCustom: true,
    },
    validate: (draft) => !!(draft.name && draft.description),
    createItem: (id, draft) => ({
      id,
      ...normalizeKetikConsumerDraft(draft),
    }),
  });

  const templateForm = useCrudForm<KetikQuickTemplate>({
    generateId: () => `qt-${Date.now()}`,
    defaultValues: {
      keyword: "",
      content: "",
    },
    validate: (draft) => !!(draft.keyword && draft.content),
    createItem: (id, draft) => ({
      id,
      ...normalizeKetikQuickTemplateDraft(draft),
    }),
  });

  const handlePresetClick = (d: number) => {
    setDurationMode("preset");
    setCustomInputValue("");
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, simulationDuration: d }));
  };

  const handleCustomClick = () => {
    const current = localSettings.simulationDuration;
    setDurationMode("custom");
    setCustomInputValue(durationToInputValue(current));
    setDurationValidationError(null);
  };

  const handleDurationInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value;
    const filtered = raw.replace(/[^0-9]/g, "");
    setCustomInputValue(filtered);
    setDurationValidationError(null);
    const num = parseInt(filtered, 10);
    if (
      filtered.length > 0 &&
      !isNaN(num) &&
      num >= MIN_DURATION &&
      num <= MAX_DURATION
    ) {
      setLocalSettings((prev) => ({ ...prev, simulationDuration: num }));
    }
  };

  const handleDurationBlur = () => {
    const num = parseInt(customInputValue, 10);
    if (isNaN(num) || num < MIN_DURATION || num > MAX_DURATION) {
      setDurationValidationError(
        `Masukkan angka ${MIN_DURATION}-${MAX_DURATION}.`,
      );
      setLocalSettings((prev) => ({
        ...prev,
        simulationDuration: clampDuration(prev.simulationDuration),
      }));
      return;
    }
    setCustomInputValue(String(num));
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, simulationDuration: num }));
  };

  const clampDuration = (val: number | undefined): number => {
    const d = Number(val);
    if (isNaN(d) || d < MIN_DURATION) return MIN_DURATION;
    if (d > MAX_DURATION) return MAX_DURATION;
    return d;
  };

  const handleIdentityChange = (field: string, value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      identitySettings: { ...prev.identitySettings, [field]: value },
    }));
  };

  useEffect(() => {
    if (isOpen) {
      const nextTemplateLayers = getKetikTemplateLayers(settings);
      setLocalSettings({
        ...settings,
        selectedModel: coerceKetikModelId(settings.selectedModel),
        globalQuickTemplates: nextTemplateLayers.global,
        quickTemplates: mergeKetikQuickTemplates(
          nextTemplateLayers.global,
          settings.personalQuickTemplates || [],
        ),
        personalQuickTemplates: settings.personalQuickTemplates || [],
      });
      const nextDurationMode = classifyDurationMode(
        settings.simulationDuration,
      );
      setDurationMode(nextDurationMode);
      setCustomInputValue(
        nextDurationMode === "custom"
          ? durationToInputValue(settings.simulationDuration)
          : "",
      );
      setDurationValidationError(null);
      scenarioForm.close();
      consumerForm.close();
      templateForm.close();
      setTemplateScope("global");
    }
  }, [isOpen, settings]);

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    const scenarioDirty = scenarioForm.isDirty(localSettings.scenarios);
    const consumerDirty = consumerForm.isDirty(localSettings.consumerTypes);
    const localTemplateLayers = getKetikTemplateLayers(localSettings);
    const savedTemplateLayers = getKetikTemplateLayers(settings);
    const savedPersonalTemplates = settings.personalQuickTemplates || [];
    const templateList =
      templateScope === "global"
        ? localTemplateLayers.global
        : localTemplateLayers.personal;
    const templateFormDirty = templateForm.isDirty(templateList);

    if (scenarioDirty && !scenarioForm.isValid()) {
      setActiveTab("scenarios");
      setTimeout(() => {
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      notify.warning(
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
      notify.warning(
        "Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.",
      );
      return;
    }
    if (templateFormDirty && !templateForm.isValid()) {
      setActiveTab("template");
      setTimeout(() => {
        document
          .getElementById("template-form")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      notify.warning(
        "Template yang sedang Anda buat belum lengkap. Isi keyword dan konten terlebih dahulu, atau klik Batal untuk membatalkan template.",
      );
      return;
    }

    const nextScenarios = scenarioDirty
      ? scenarioForm.save(localSettings.scenarios)
      : localSettings.scenarios;
    const nextConsumerTypes = consumerDirty
      ? consumerForm.save(localSettings.consumerTypes)
      : localSettings.consumerTypes;
    const nextGlobalTemplates =
      templateScope === "global" && templateFormDirty
        ? templateForm.save(localTemplateLayers.global)
        : localTemplateLayers.global;
    const currentStoredPersonalTemplates =
      localSettings.personalQuickTemplates || [];
    const nextPersonalEditableTemplates =
      templateScope === "personal" && templateFormDirty
        ? templateForm.save(localTemplateLayers.personal)
        : localTemplateLayers.personal;
    const hiddenPersonalTemplates =
      getKetikHiddenPersonalTemplates(localSettings);
    const nextPersonalTemplates =
      templateScope === "personal"
        ? [...hiddenPersonalTemplates, ...nextPersonalEditableTemplates]
        : currentStoredPersonalTemplates;
    const globalTemplatesChanged =
      canManageTemplates &&
      !areQuickTemplatesEqual(nextGlobalTemplates, savedTemplateLayers.global);
    const personalTemplatesChanged = !areQuickTemplatesEqual(
      nextPersonalTemplates,
      savedPersonalTemplates,
    );
    const nextQuickTemplates = mergeKetikQuickTemplates(
      nextGlobalTemplates,
      nextPersonalTemplates,
    );

    const settingsToSave = buildKetikSettingsForSave({
      localSettings,
      scenarios: nextScenarios,
      consumerTypes: nextConsumerTypes,
      quickTemplates: nextQuickTemplates,
      globalQuickTemplates: nextGlobalTemplates,
      personalQuickTemplates: nextPersonalTemplates,
    });

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      if (globalTemplatesChanged && onSaveTemplates) {
        await onSaveTemplates(nextGlobalTemplates);
      }
      await onSave(settingsToSave);
      if (scenarioDirty) scenarioForm.close();
      if (consumerDirty) consumerForm.close();
      if (
        templateFormDirty ||
        globalTemplatesChanged ||
        personalTemplatesChanged
      ) {
        templateForm.close();
      }
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
  };

  const handleResetDefaults = async () => {
    if (saveInFlightRef.current) return;
    if (
      window.confirm(
        "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
      )
    ) {
      saveInFlightRef.current = true;
      setIsSaving(true);
      try {
        const resetTemplateLayers = getKetikTemplateLayers(localSettings);
        const resetPersonalTemplates =
          localSettings.personalQuickTemplates || [];
        const resetSettings: KetikAppSettings = {
          ...DEFAULT_KETIK_SETTINGS,
          globalQuickTemplates: resetTemplateLayers.global,
          quickTemplates: mergeKetikQuickTemplates(
            resetTemplateLayers.global,
            resetPersonalTemplates,
          ),
          personalQuickTemplates: resetPersonalTemplates,
        };
        await onSave(resetSettings);
        setLocalSettings(resetSettings);
        scenarioForm.close();
        consumerForm.close();
        templateForm.close();
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
    templateForm,
    templateScope,
    setTemplateScope,
    customInputValue,
    setCustomInputValue,
    durationValidationError,
    setDurationValidationError,
    durationMode,
    handlePresetClick,
    handleCustomClick,
    handleDurationInputChange,
    handleDurationBlur,
    handleIdentityChange,
    handleSave,
    handleResetDefaults,
    isSaving,
  };
}
