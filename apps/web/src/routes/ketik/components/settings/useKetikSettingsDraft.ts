import { useState, useEffect } from "react";
import type {
  KetikAppSettings,
  KetikScenario,
  KetikConsumerType,
  KetikQuickTemplate,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";

export interface UseKetikSettingsDraftProps {
  settings: KetikAppSettings;
  isOpen: boolean;
  onSave: (newSettings: KetikAppSettings) => void;
  onClose: () => void;
}

export function buildKetikSettingsForSave(params: {
  localSettings: KetikAppSettings;
  scenarios: KetikScenario[];
  consumerTypes: KetikConsumerType[];
  quickTemplates: KetikQuickTemplate[];
}): KetikAppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    quickTemplates: params.quickTemplates,
  };
}

export function useKetikSettingsDraft({
  settings,
  isOpen,
  onSave,
  onClose,
}: UseKetikSettingsDraftProps) {
  const [activeTab, setActiveTab] = useState<
    "scenarios" | "consumers" | "identity" | "system" | "template"
  >("scenarios");
  const [localSettings, setLocalSettings] = useState<KetikAppSettings>(() => ({
    ...settings,
    quickTemplates:
      settings.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates || [],
  }));

  const [customInputValue, setCustomInputValue] = useState("");
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
    createItem: (id, draft) => ({ id, ...draft }),
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
    createItem: (id, draft) => ({ id, ...draft }),
  });

  const templateForm = useCrudForm<KetikQuickTemplate>({
    generateId: () => `qt-${Date.now()}`,
    defaultValues: {
      keyword: "",
      content: "",
    },
    validate: (draft) => !!(draft.keyword && draft.content),
    createItem: (id, draft) => ({ id, ...draft }),
  });

  const PRESET_DURATIONS = [5, 10, 15];
  const MIN_DURATION = 1;
  const MAX_DURATION = 60;

  const classifyDurationMode = (
    val: number | undefined,
  ): "preset" | "custom" => {
    const d = Number(val);
    if (isNaN(d)) return "custom";
    return (PRESET_DURATIONS as number[]).includes(d) ? "preset" : "custom";
  };

  const durationMode = classifyDurationMode(localSettings.simulationDuration);

  const handlePresetClick = (d: number) => {
    setCustomInputValue("");
    setDurationValidationError(null);
    setLocalSettings((prev) => ({ ...prev, simulationDuration: d }));
  };

  const handleCustomClick = () => {
    const current = localSettings.simulationDuration;
    setCustomInputValue(current ? String(current) : "");
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
      setLocalSettings({
        ...settings,
        quickTemplates:
          settings.quickTemplates ||
          DEFAULT_KETIK_SETTINGS.quickTemplates ||
          [],
      });
      scenarioForm.close();
      consumerForm.close();
      templateForm.close();
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    const scenarioDirty = scenarioForm.isDirty(localSettings.scenarios);
    const consumerDirty = consumerForm.isDirty(localSettings.consumerTypes);
    const templateDirty = templateForm.isDirty(localSettings.quickTemplates || []);

    if (scenarioDirty && !scenarioForm.isValid()) {
      setActiveTab("scenarios");
      setTimeout(() => {
        document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      notify.warning(
        "Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.",
      );
      return;
    }
    if (consumerDirty && !consumerForm.isValid()) {
      setActiveTab("consumers");
      setTimeout(() => {
        document.getElementById("consumer-form")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      notify.warning(
        "Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.",
      );
      return;
    }
    if (templateDirty && !templateForm.isValid()) {
      setActiveTab("template");
      setTimeout(() => {
        document.getElementById("template-form")?.scrollIntoView({ behavior: "smooth" });
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
    const nextQuickTemplates = templateDirty
      ? templateForm.save(localSettings.quickTemplates || [])
      : (localSettings.quickTemplates || []);

    const settingsToSave = buildKetikSettingsForSave({
      localSettings,
      scenarios: nextScenarios,
      consumerTypes: nextConsumerTypes,
      quickTemplates: nextQuickTemplates,
    });

    if (scenarioDirty) {
      scenarioForm.close();
    }
    if (consumerDirty) {
      consumerForm.close();
    }
    if (templateDirty) {
      templateForm.close();
    }

    onSave(settingsToSave);
    onClose();
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
      )
    ) {
      setLocalSettings(DEFAULT_KETIK_SETTINGS);
      scenarioForm.close();
      consumerForm.close();
      templateForm.close();
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
  };
}
