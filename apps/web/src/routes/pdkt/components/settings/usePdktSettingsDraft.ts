import { useState, useEffect, useRef } from "react";
import type {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
} from "@trainers/types";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import { notify } from "../../../../lib/toast";
import { postApi } from "../../../../hooks/useApi";
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

  // Scenario Form State
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(
    null,
  );
  const [isAddingScenario, setIsAddingScenario] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState("");
  const [newScenarioDesc, setNewScenarioDesc] = useState("");
  const [newScenarioTemplateSubject, setNewScenarioTemplateSubject] =
    useState("");
  const [newScenarioTemplateBody, setNewScenarioTemplateBody] = useState("");
  const [newScenarioAlwaysUseTemplate, setNewScenarioAlwaysUseTemplate] =
    useState(false);
  const [newScenarioIsLicensed, setNewScenarioIsLicensed] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const templateGenerationTokenRef = useRef<string | null>(null);

  const [newScenarioImages, setNewScenarioImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consumer Form State
  const [editingConsumerId, setEditingConsumerId] = useState<string | null>(
    null,
  );
  const [isAddingConsumer, setIsAddingConsumer] = useState(false);
  const [newConsumerName, setNewConsumerName] = useState("");
  const [newConsumerDesc, setNewConsumerDesc] = useState("");
  const [newConsumerDifficulty, setNewConsumerDifficulty] = useState<
    "Easy" | "Medium" | "Hard"
  >("Medium");
  const [newConsumerTone, setNewConsumerTone] = useState("");

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

      // Reset forms
      setEditingScenarioId(null);
      setIsAddingScenario(false);
      setNewScenarioImages([]);
      setEditingConsumerId(null);
      setIsAddingConsumer(false);
    }
  }, [isOpen, settings]);

  const categories = Array.from(
    new Set(localSettings.scenarios.map((s) => s.category)),
  );

  const handleToggleScenario = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s,
      ),
    }));
  };

  const handleAddScenario = () => {
    setEditingScenarioId(null);
    setIsAddingScenario(true);
    setNewScenarioCategory("");
    setNewScenarioTitle("");
    setNewScenarioDesc("");
    setNewScenarioTemplateSubject("");
    setNewScenarioTemplateBody("");
    setNewScenarioAlwaysUseTemplate(false);
    setNewScenarioIsLicensed(false);
    setNewScenarioImages([]);
    setIsNewCategoryInput(false);

    setTimeout(() => {
      const formElement = document.getElementById("scenario-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const handleEditScenario = (scenario: PdktScenario) => {
    setEditingScenarioId(scenario.id);
    setIsAddingScenario(true);
    setNewScenarioCategory(scenario.category);
    setNewScenarioTitle(scenario.title);
    setNewScenarioDesc(scenario.description);
    setNewScenarioTemplateSubject(scenario.sampleEmailTemplate?.subject || "");
    setNewScenarioTemplateBody(scenario.sampleEmailTemplate?.body || "");
    setNewScenarioAlwaysUseTemplate(scenario.alwaysUseSampleEmail || false);
    setNewScenarioIsLicensed(scenario.isLicensed || false);
    setNewScenarioImages(scenario.attachmentImages || []);
    setIsNewCategoryInput(!categories.includes(scenario.category));

    setTimeout(() => {
      const formElement = document.getElementById("scenario-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const resetScenarioForm = () => {
    templateGenerationTokenRef.current = null;
    setEditingScenarioId(null);
    setIsAddingScenario(false);
    setNewScenarioTitle("");
    setNewScenarioDesc("");
    setNewScenarioTemplateSubject("");
    setNewScenarioTemplateBody("");
    setNewScenarioAlwaysUseTemplate(false);
    setNewScenarioIsLicensed(false);
    setNewScenarioCategory("");
    setNewScenarioImages([]);
    setIsNewCategoryInput(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];

      if (file.size > 500 * 1024) {
        notify.error(
          "Ukuran gambar terlalu besar! Maksimal 500KB per gambar agar pengaturan dapat disimpan.",
        );
        return;
      }

      if (newScenarioImages.length >= 5) {
        notify.warning("Maksimal 5 gambar per skenario.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setNewScenarioImages((prev) => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setNewScenarioImages((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const handleSaveScenario = () => {
    if (!newScenarioTitle || !newScenarioDesc) return;
    if (newScenarioAlwaysUseTemplate && !newScenarioTemplateBody.trim()) {
      notify.warning(
        'Isi body template email jika Anda memilih "Always use this email".',
      );
      return;
    }
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
                sampleEmailTemplate: {
                  subject: newScenarioTemplateSubject,
                  body: newScenarioTemplateBody,
                },
                alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
                isLicensed: newScenarioIsLicensed,
                attachmentImages: newScenarioImages,
              }
            : s,
        ),
      }));
    } else {
      const newScenario: PdktScenario = {
        id: `s-${Date.now()}`,
        category,
        title: newScenarioTitle,
        description: newScenarioDesc,
        sampleEmailTemplate: {
          subject: newScenarioTemplateSubject,
          body: newScenarioTemplateBody,
        },
        alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
        isLicensed: newScenarioIsLicensed,
        isActive: true,
        attachmentImages: newScenarioImages,
      };
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: [...prev.scenarios, newScenario],
      }));
    }
    resetScenarioForm();
  };

  const handleGenerateTemplate = async () => {
    if (!newScenarioTitle || !newScenarioDesc) {
      notify.warning(
        "Isi judul dan deskripsi masalah terlebih dahulu untuk generate template.",
      );
      return;
    }

    const draftIdentity = `${editingScenarioId || "new"}|${newScenarioTitle}|${newScenarioDesc}|${newScenarioCategory}`;
    templateGenerationTokenRef.current = draftIdentity;
    setIsGeneratingTemplate(true);
    try {
      const category = isNewCategoryInput
        ? newScenarioCategory
        : newScenarioCategory || "Umum";
      const draft: PdktScenario = {
        id: editingScenarioId || "draft",
        category,
        title: newScenarioTitle,
        description: newScenarioDesc,
        isActive: true,
        isLicensed: newScenarioIsLicensed,
        sampleEmailTemplate: {
          subject: newScenarioTemplateSubject,
          body: newScenarioTemplateBody,
        },
        attachmentImages: newScenarioImages,
      };

      const identity: PdktIdentity = {
        name: customSenderName || "Budi Santoso",
        email: customEmail || "budi.santoso88@gmail.com",
        city: customCity || "Jakarta",
        bodyName: customBodyName || "Budi",
      };

      const result = await postApi<{ subject: string; body: string }>(
        "/pdkt/generate-template",
        {
          scenarioDraft: draft,
          consumerTypeId:
            globalConsumerTypeId === "random" ? "ramah" : globalConsumerTypeId,
          identity,
        },
      );

      if (templateGenerationTokenRef.current !== draftIdentity) {
        return;
      }
      setNewScenarioTemplateSubject(result.subject);
      setNewScenarioTemplateBody(result.body);
    } catch (e: any) {
      notify.error(e.message || "Gagal generate template.");
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
    setNewConsumerName("");
    setNewConsumerDesc("");
    setNewConsumerDifficulty("Medium");
    setNewConsumerTone("");

    setTimeout(() => {
      const formElement = document.getElementById("consumer-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const handleEditConsumer = (consumer: PdktConsumerType) => {
    setEditingConsumerId(consumer.id);
    setIsAddingConsumer(true);
    setNewConsumerName(consumer.name);
    setNewConsumerDesc(consumer.description);
    setNewConsumerDifficulty(consumer.difficulty || "Medium");
    setNewConsumerTone(consumer.tone || "");

    setTimeout(() => {
      const formElement = document.getElementById("consumer-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const resetConsumerForm = () => {
    setEditingConsumerId(null);
    setIsAddingConsumer(false);
    setNewConsumerName("");
    setNewConsumerDesc("");
    setNewConsumerDifficulty("Medium");
    setNewConsumerTone("");
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
                tone: newConsumerTone,
              }
            : c,
        ),
      }));
    } else {
      const newConsumer: PdktConsumerType = {
        id: `c-${Date.now()}`,
        name: newConsumerName,
        description: newConsumerDesc,
        difficulty: newConsumerDifficulty,
        tone: newConsumerTone,
        isCustom: true,
      };
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: [...prev.consumerTypes, newConsumer],
      }));
    }
    resetConsumerForm();
  };

  const isScenarioDraftDirty = () =>
    isAddingScenario || editingScenarioId !== null;

  const isScenarioDraftValid = () => {
    if (!newScenarioTitle) return false;
    if (!newScenarioDesc) return false;
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";
    if (!category) return false;
    return true;
  };

  const applyScenarioDraft = (base: AppSettings): AppSettings | null => {
    if (!isScenarioDraftDirty() || !isScenarioDraftValid()) return null;
    const category = isNewCategoryInput
      ? newScenarioCategory
      : newScenarioCategory || "Umum";

    if (editingScenarioId) {
      return {
        ...base,
        scenarios: base.scenarios.map((s) =>
          s.id === editingScenarioId
            ? {
                ...s,
                category,
                title: newScenarioTitle,
                description: newScenarioDesc,
                sampleEmailTemplate: {
                  subject: newScenarioTemplateSubject,
                  body: newScenarioTemplateBody,
                },
                alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
                isLicensed: newScenarioIsLicensed,
                attachmentImages: newScenarioImages,
              }
            : s,
        ),
      };
    } else {
      const newScenario: PdktScenario = {
        id: `s-${Date.now()}`,
        category,
        title: newScenarioTitle,
        description: newScenarioDesc,
        sampleEmailTemplate: {
          subject: newScenarioTemplateSubject,
          body: newScenarioTemplateBody,
        },
        alwaysUseSampleEmail: newScenarioAlwaysUseTemplate,
        isActive: true,
        attachmentImages: newScenarioImages,
      };
      return {
        ...base,
        scenarios: [...base.scenarios, newScenario],
      };
    }
  };

  const isConsumerDraftDirty = () =>
    isAddingConsumer || editingConsumerId !== null;

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
        consumerTypes: base.consumerTypes.map((c) =>
          c.id === editingConsumerId
            ? {
                ...c,
                name: newConsumerName,
                description: newConsumerDesc,
                difficulty: newConsumerDifficulty,
                tone: newConsumerTone,
              }
            : c,
        ),
      };
    } else {
      const newConsumer: PdktConsumerType = {
        id: `c-${Date.now()}`,
        name: newConsumerName,
        description: newConsumerDesc,
        difficulty: newConsumerDifficulty,
        tone: newConsumerTone,
        isCustom: true,
      };
      return {
        ...base,
        consumerTypes: [...base.consumerTypes, newConsumer],
      };
    }
  };

  const handleSave = () => {
    const scenarioDirty = isScenarioDraftDirty();
    const consumerDirty = isConsumerDraftDirty();

    if (scenarioDirty && !isScenarioDraftValid()) {
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

    if (newScenarioAlwaysUseTemplate && !newScenarioTemplateBody.trim()) {
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

    if (consumerDirty && !isConsumerDraftValid()) {
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
          city: customCity,
        },
      };

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

      resetScenarioForm();
      resetConsumerForm();

      onSave(defaultSettings);
      onClose();
    }
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
    }
  };

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev) => {
        const newTypes = prev.consumerTypes.filter((c) => c.id !== id);
        return {
          ...prev,
          consumerTypes: newTypes,
          globalConsumerTypeId:
            prev.globalConsumerTypeId === id
              ? "random"
              : prev.globalConsumerTypeId,
        };
      });
    }
  };

  return {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    editingScenarioId,
    setEditingScenarioId,
    isAddingScenario,
    setIsAddingScenario,
    newScenarioCategory,
    setNewScenarioCategory,
    isNewCategoryInput,
    setIsNewCategoryInput,
    newScenarioTitle,
    setNewScenarioTitle,
    newScenarioDesc,
    setNewScenarioDesc,
    newScenarioTemplateSubject,
    setNewScenarioTemplateSubject,
    newScenarioTemplateBody,
    setNewScenarioTemplateBody,
    newScenarioAlwaysUseTemplate,
    setNewScenarioAlwaysUseTemplate,
    newScenarioIsLicensed,
    setNewScenarioIsLicensed,
    isGeneratingTemplate,
    setIsGeneratingTemplate,
    newScenarioImages,
    setNewScenarioImages,
    fileInputRef,
    editingConsumerId,
    setEditingConsumerId,
    isAddingConsumer,
    setIsAddingConsumer,
    newConsumerName,
    setNewConsumerName,
    newConsumerDesc,
    setNewConsumerDesc,
    newConsumerDifficulty,
    setNewConsumerDifficulty,
    newConsumerTone,
    setNewConsumerTone,
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
    categories,
    handleToggleScenario,
    handleAddScenario,
    handleEditScenario,
    resetScenarioForm,
    handleImageUpload,
    handleRemoveImage,
    handleSaveScenario,
    handleGenerateTemplate,
    handleAddConsumer,
    handleEditConsumer,
    resetConsumerForm,
    handleSaveConsumer,
    handleSave,
    handleResetDefaults,
    handleDeleteScenario,
    handleDeleteConsumer,
  };
}
