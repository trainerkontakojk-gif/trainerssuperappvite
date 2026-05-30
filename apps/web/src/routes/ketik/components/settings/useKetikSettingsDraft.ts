import { useState, useEffect } from "react";
import type {
  KetikAppSettings,
  KetikScenario,
  KetikConsumerType,
  KetikQuickTemplate,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { notify } from "../../../../lib/toast";

export interface UseKetikSettingsDraftProps {
  settings: KetikAppSettings;
  isOpen: boolean;
  onSave: (newSettings: KetikAppSettings) => void;
  onClose: () => void;
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
  const [isScenarioFormOpen, setIsScenarioFormOpen] = useState(false);
  const [isConsumerFormOpen, setIsConsumerFormOpen] = useState(false);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(
    null,
  );
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState("");
  const [newScenarioDesc, setNewScenarioDesc] = useState("");
  const [newScenarioScript, setNewScenarioScript] = useState("");
  const [isScenarioScriptEnabled, setIsScenarioScriptEnabled] = useState(false);
  const [newScenarioImages, setNewScenarioImages] = useState<string[]>([]);
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(
    null,
  );
  const [newConsumerName, setNewConsumerName] = useState("");
  const [newConsumerDesc, setNewConsumerDesc] = useState("");
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<
    "Mudah" | "Sedang" | "Sulit"
  >("Sedang");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [newTemplateKeyword, setNewTemplateKeyword] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [customInputValue, setCustomInputValue] = useState("");
  const [durationValidationError, setDurationValidationError] = useState<
    string | null
  >(null);

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
      setIsScenarioFormOpen(false);
      setIsConsumerFormOpen(false);
      setIsTemplateFormOpen(false);
      setEditingScenarioId(null);
      setEditingConsumerId(null);
      setEditingTemplateId(null);
    }
  }, [isOpen, settings]);

  const categories = Array.from(
    new Set(localSettings.scenarios.map((s) => s.category)),
  );
  const activeCount = localSettings.scenarios.filter((s) => s.isActive).length;
  const totalScenarios = localSettings.scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleSelectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: true })),
    }));
  const handleUnselectAll = () =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: false })),
    }));
  const handleToggleScenario = (id: string) =>
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s,
      ),
    }));
  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?"))
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
  };
  const handleSelectConsumerType = (id: string) =>
    setLocalSettings((prev) => ({ ...prev, activeConsumerTypeId: id }));

  const resetScenarioForm = () => {
    setEditingScenarioId(null);
    setNewScenarioTitle("");
    setNewScenarioDesc("");
    setNewScenarioScript("");
    setIsScenarioScriptEnabled(false);
    setNewScenarioCategory("");
    setNewScenarioImages([]);
    setIsNewCategoryInput(false);
  };

  const handleEditScenario = (scenario: KetikScenario) => {
    setEditingScenarioId(scenario.id);
    setNewScenarioCategory(scenario.category);
    setNewScenarioTitle(scenario.title);
    setNewScenarioDesc(scenario.description);
    setNewScenarioScript(scenario.script || "");
    setIsScenarioScriptEnabled(Boolean(scenario.script?.trim()));
    setNewScenarioImages(scenario.images || []);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsScenarioFormOpen(true);
    setTimeout(
      () =>
        document
          .getElementById("scenario-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  };

  const handleSaveScenario = () => {
    if (!newScenarioTitle || !newScenarioDesc) return;
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";
    if (editingScenarioId) {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.map((s) =>
          s.id === editingScenarioId
            ? {
                ...s,
                category,
                title: newScenarioTitle,
                description: newScenarioDesc,
                script: isScenarioScriptEnabled ? newScenarioScript : "",
                images: newScenarioImages,
              }
            : s,
        ),
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: [
          ...prev.scenarios,
          {
            id: `s-${Date.now()}`,
            category,
            title: newScenarioTitle,
            description: newScenarioDesc,
            script: isScenarioScriptEnabled ? newScenarioScript : "",
            isActive: true,
            images: newScenarioImages,
          },
        ],
      }));
    }
    resetScenarioForm();
    setIsScenarioFormOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file) => {
        if (file.size > 500 * 1024) {
          notify.error(
            `File ${file.name} terlalu besar (>500KB). Mohon kompres gambar terlebih dahulu.`,
          );
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () =>
          setNewScenarioImages((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    }
  };

  const resetConsumerForm = () => {
    setEditingConsumerId(null);
    setNewConsumerName("");
    setNewConsumerDesc("");
    setNewConsumerDifficulty("Sedang");
  };

  const handleEditConsumer = (consumer: KetikConsumerType) => {
    setEditingConsumerId(consumer.id);
    setNewConsumerName(consumer.name);
    setNewConsumerDesc(consumer.description);
    setNewConsumerDifficulty(consumer.difficulty);
    setIsConsumerFormOpen(true);
    setTimeout(
      () =>
        document
          .getElementById("consumer-form")
          ?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  };

  const handleSaveConsumer = () => {
    if (!newConsumerName || !newConsumerDesc) return;
    if (editingConsumerId) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.map((c) =>
          c.id === editingConsumerId
            ? {
                ...c,
                name: newConsumerName,
                description: newConsumerDesc,
                difficulty: newConsumerDifficulty,
              }
            : c,
        ),
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: [
          ...prev.consumerTypes,
          {
            id: `c-${Date.now()}`,
            name: newConsumerName,
            description: newConsumerDesc,
            difficulty: newConsumerDifficulty,
            isCustom: true,
          },
        ],
      }));
    }
    resetConsumerForm();
    setIsConsumerFormOpen(false);
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
        activeConsumerTypeId:
          prev.activeConsumerTypeId === id
            ? "random"
            : prev.activeConsumerTypeId,
      }));
    }
  };

  const handleSaveTemplate = () => {
    if (!newTemplateKeyword || !newTemplateContent) return;
    const sanitizedKeyword = newTemplateKeyword
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const tmpl: KetikQuickTemplate = {
      id: editingTemplateId || `qt-${Date.now()}`,
      keyword: sanitizedKeyword,
      content: newTemplateContent.trim(),
    };
    setLocalSettings((prev) => ({
      ...prev,
      quickTemplates: editingTemplateId
        ? (prev.quickTemplates || []).map((t) =>
            t.id === editingTemplateId ? tmpl : t,
          )
        : [...(prev.quickTemplates || []), tmpl],
    }));
    setEditingTemplateId(null);
    setNewTemplateKeyword("");
    setNewTemplateContent("");
    setIsTemplateFormOpen(false);
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm("Hapus template ini?"))
      setLocalSettings((prev) => ({
        ...prev,
        quickTemplates: (prev.quickTemplates || []).filter((t) => t.id !== id),
      }));
  };

  const isScenarioDraftDirty = () => isScenarioFormOpen;
  const isScenarioDraftValid = () => !!(newScenarioTitle && newScenarioDesc);
  const isConsumerDraftDirty = () => isConsumerFormOpen;
  const isConsumerDraftValid = () => !!(newConsumerName && newConsumerDesc);
  const isTemplateDirty = () => isTemplateFormOpen;

  const handleSave = () => {
    if (isScenarioDraftDirty() && !isScenarioDraftValid()) {
      setActiveTab("scenarios");
      setTimeout(
        () =>
          document
            .getElementById("scenario-form")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100,
      );
      notify.warning(
        "Skenario yang sedang Anda buat belum lengkap. Isi judul dan deskripsi masalah terlebih dahulu, atau klik Batal untuk membatalkan skenario.",
      );
      return;
    }
    if (isConsumerDraftDirty() && !isConsumerDraftValid()) {
      setActiveTab("consumers");
      setTimeout(
        () =>
          document
            .getElementById("consumer-form")
            ?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
      notify.warning(
        "Karakter yang sedang Anda buat belum lengkap. Isi nama dan deskripsi karakteristik terlebih dahulu, atau klik Batal untuk membatalkan karakter.",
      );
      return;
    }
    if (isTemplateDirty() && (!newTemplateKeyword || !newTemplateContent)) {
      setActiveTab("template");
      setTimeout(
        () =>
          document
            .getElementById("template-form")
            ?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
      notify.warning(
        "Template yang sedang Anda buat belum lengkap. Isi keyword dan konten terlebih dahulu, atau klik Batal untuk membatalkan template.",
      );
      return;
    }

    let finalSettings = localSettings;
    if (isScenarioDraftDirty() && isScenarioDraftValid()) {
      const category = isNewCategoryInput
        ? newScenarioCategory
        : newScenarioCategory || "Umum";
      if (editingScenarioId) {
        finalSettings = {
          ...finalSettings,
          scenarios: finalSettings.scenarios.map((s) =>
            s.id === editingScenarioId
              ? {
                  ...s,
                  category,
                  title: newScenarioTitle,
                  description: newScenarioDesc,
                  script: isScenarioScriptEnabled ? newScenarioScript : "",
                  images: newScenarioImages,
                }
              : s,
          ),
        };
      } else {
        finalSettings = {
          ...finalSettings,
          scenarios: [
            ...finalSettings.scenarios,
            {
              id: `s-${Date.now()}`,
              category,
              title: newScenarioTitle,
              description: newScenarioDesc,
              script: isScenarioScriptEnabled ? newScenarioScript : "",
              isActive: true,
              images: newScenarioImages,
            },
          ],
        };
      }
    }
    if (isConsumerDraftDirty() && isConsumerDraftValid()) {
      if (editingConsumerId) {
        finalSettings = {
          ...finalSettings,
          consumerTypes: finalSettings.consumerTypes.map((c) =>
            c.id === editingConsumerId
              ? {
                  ...c,
                  name: newConsumerName,
                  description: newConsumerDesc,
                  difficulty: newConsumerDifficulty,
                }
              : c,
          ),
        };
      } else {
        finalSettings = {
          ...finalSettings,
          consumerTypes: [
            ...finalSettings.consumerTypes,
            {
              id: `c-${Date.now()}`,
              name: newConsumerName,
              description: newConsumerDesc,
              difficulty: newConsumerDifficulty,
              isCustom: true,
            },
          ],
        };
      }
    }
    if (isScenarioDraftDirty()) {
      resetScenarioForm();
      setIsScenarioFormOpen(false);
    }
    if (isConsumerDraftDirty()) {
      resetConsumerForm();
      setIsConsumerFormOpen(false);
    }
    if (isTemplateDirty()) {
      setEditingTemplateId(null);
      setNewTemplateKeyword("");
      setNewTemplateContent("");
      setIsTemplateFormOpen(false);
    }

    onSave(finalSettings);
    onClose();
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
      )
    )
      setLocalSettings(DEFAULT_KETIK_SETTINGS);
  };

  return {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    isScenarioFormOpen,
    setIsScenarioFormOpen,
    isConsumerFormOpen,
    setIsConsumerFormOpen,
    isTemplateFormOpen,
    setIsTemplateFormOpen,
    editingScenarioId,
    setEditingScenarioId,
    newScenarioCategory,
    setNewScenarioCategory,
    isNewCategoryInput,
    setIsNewCategoryInput,
    newScenarioTitle,
    setNewScenarioTitle,
    newScenarioDesc,
    setNewScenarioDesc,
    newScenarioScript,
    setNewScenarioScript,
    isScenarioScriptEnabled,
    setIsScenarioScriptEnabled,
    newScenarioImages,
    setNewScenarioImages,
    editingConsumerId,
    setEditingConsumerId,
    newConsumerName,
    setNewConsumerName,
    newConsumerDesc,
    setNewConsumerDesc,
    newConsumerDifficulty,
    setNewConsumerDifficulty,
    editingTemplateId,
    setEditingTemplateId,
    newTemplateKeyword,
    setNewTemplateKeyword,
    newTemplateContent,
    setNewTemplateContent,
    customInputValue,
    setCustomInputValue,
    durationValidationError,
    setDurationValidationError,
    categories,
    activeCount,
    totalScenarios,
    allSelected,
    noneSelected,
    durationMode,
    handlePresetClick,
    handleCustomClick,
    handleDurationInputChange,
    handleDurationBlur,
    handleIdentityChange,
    handleSelectAll,
    handleUnselectAll,
    handleToggleScenario,
    handleDeleteScenario,
    handleSelectConsumerType,
    resetScenarioForm,
    handleEditScenario,
    handleSaveScenario,
    handleImageUpload,
    resetConsumerForm,
    handleEditConsumer,
    handleSaveConsumer,
    handleDeleteConsumer,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleSave,
    handleResetDefaults,
  };
}
