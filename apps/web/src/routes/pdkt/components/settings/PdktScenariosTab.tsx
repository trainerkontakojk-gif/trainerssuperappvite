import React, { useState, useRef } from "react";
import { PdktScenario, PdktIdentity } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { postApi } from "../../../../hooks/useApi";
import { type PdktAppSettings as AppSettings } from "../../pdktSettings";
import { normalizePdktScenarioDraft } from "./pdktDraftNormalizers";

// Sub-components
import { ScenarioList } from "./scenarios/ScenarioList";
import { ScenarioForm } from "./scenarios/ScenarioForm";
import { ScenarioAttachments } from "./scenarios/ScenarioAttachments";
import { ScenarioAIGenerator } from "./scenarios/ScenarioAIGenerator";
import { ScenarioTemplateField } from "./scenarios/ScenarioTemplateField";

interface PdktScenariosTabProps {
  scenarios: PdktScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  enableImageGeneration: boolean;
  setEnableImageGeneration: (val: boolean) => void;
  customIdentity: PdktIdentity;
  globalConsumerTypeId: string;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function PdktScenariosTab({
  scenarios,
  scenarioForm,
  enableImageGeneration,
  setEnableImageGeneration,
  customIdentity,
  globalConsumerTypeId,
  setLocalSettings,
}: PdktScenariosTabProps) {
  const [isNewCategoryInput, setIsNewCategoryInput] = useState(false);
  const [newScenarioCategory, setNewScenarioCategory] = useState("");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = Array.from(new Set(scenarios.map((s) => s.category)));
  const activeCount = scenarios.filter((s) => s.isActive).length;
  const totalScenarios = scenarios.length;
  const allSelected = totalScenarios > 0 && activeCount === totalScenarios;
  const noneSelected = activeCount === 0;

  const handleSelectAll = () => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: true })),
    }));
  };

  const handleUnselectAll = () => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isActive: false })),
    }));
  };

  const handleToggleScenario = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      ),
    }));
  };

  const handleDeleteScenario = (id: string) => {
    if (window.confirm("Hapus skenario ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        scenarios: prev.scenarios.filter((s) => s.id !== id),
      }));
    }
  };

  const handleAddClick = () => {
    scenarioForm.openAdd();
    setNewScenarioCategory("");
    setIsNewCategoryInput(false);
    setIsGeneratingTemplate(false);
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleEditClick = (scenario: PdktScenario) => {
    scenarioForm.openEdit(scenario);
    setNewScenarioCategory(scenario.category);
    setIsNewCategoryInput(!categories.includes(scenario.category));
    setIsGeneratingTemplate(false);
    setTimeout(() => {
      document.getElementById("scenario-form")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > 500 * 1024) {
        notify.error("Ukuran gambar terlalu besar! Maksimal 500KB per gambar agar pengaturan dapat disimpan.");
        return;
      }
      const currentImages = scenarioForm.draft.attachmentImages || [];
      if (currentImages.length >= 5) {
        notify.warning("Maksimal 5 gambar per skenario.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        scenarioForm.setDraft({ attachmentImages: [...currentImages, reader.result as string] });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const currentImages = scenarioForm.draft.attachmentImages || [];
    scenarioForm.setDraft({
      attachmentImages: currentImages.filter((_, idx) => idx !== indexToRemove),
    });
  };

  const handleGenerateTemplate = async () => {
    const title = scenarioForm.draft.title;
    const desc = scenarioForm.draft.description;
    if (!title || !desc) {
      notify.warning("Isi judul dan deskripsi masalah terlebih dahulu untuk generate template.");
      return;
    }

    setIsGeneratingTemplate(true);
    try {
      const category = isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category || "Umum";
      const draft: PdktScenario = {
        id: scenarioForm.editingId || "draft",
        category,
        title,
        description: desc,
        isActive: true,
        isLicensed: scenarioForm.draft.isLicensed,
        sampleEmailTemplate: {
          subject: scenarioForm.draft.sampleEmailTemplate?.subject || "",
          body: scenarioForm.draft.sampleEmailTemplate?.body || "",
        },
        attachmentImages: scenarioForm.draft.attachmentImages || [],
      };

      const identity: PdktIdentity = {
        name: customIdentity.name || "Budi Santoso",
        email: customIdentity.email || "budi.santoso88@gmail.com",
        city: customIdentity.city || "Jakarta",
        bodyName: customIdentity.bodyName || "Budi",
      };

      const result = await postApi<{ subject: string; body: string }>(
        "/pdkt/generate-template",
        {
          scenarioDraft: draft,
          consumerTypeId: globalConsumerTypeId === "random" ? "ramah" : globalConsumerTypeId,
          identity,
        }
      );

      scenarioForm.setDraft({
        sampleEmailTemplate: {
          subject: result.subject,
          body: result.body,
        },
      });
    } catch (e: unknown) {
      notify.error(
        e instanceof Error ? e.message : "Gagal generate template.",
      );
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const handleSaveScenario = () => {
    const title = scenarioForm.draft.title;
    const desc = scenarioForm.draft.description;
    if (!title || !desc) return;
    if (scenarioForm.draft.alwaysUseSampleEmail && !scenarioForm.draft.sampleEmailTemplate?.body?.trim()) {
      notify.warning('Isi body template email jika Anda memilih "Always use this email".');
      return;
    }

    const category = isNewCategoryInput ? newScenarioCategory : scenarioForm.draft.category || "Umum";

    const normalizedDraft = normalizePdktScenarioDraft({
      ...scenarioForm.draft,
      category,
    });

    setLocalSettings((prev) => ({
      ...prev,
      scenarios: scenarioForm.save(prev.scenarios, normalizedDraft),
    }));

    scenarioForm.close();
  };

  const handleCancelScenarioForm = () => {
    if (scenarioForm.isDirty(scenarios)) {
      if (!window.confirm("Skenario belum disimpan. Buang perubahan?")) return;
    }
    scenarioForm.close();
  };

  return (
    <div className="space-y-6 mt-4">
      <ScenarioList
        scenarios={scenarios}
        isOpen={scenarioForm.isOpen}
        activeCount={activeCount}
        totalScenarios={totalScenarios}
        allSelected={allSelected}
        noneSelected={noneSelected}
        enableImageGeneration={enableImageGeneration}
        onToggleImageGeneration={() => setEnableImageGeneration(!enableImageGeneration)}
        onSelectAll={handleSelectAll}
        onUnselectAll={handleUnselectAll}
        onToggleScenario={handleToggleScenario}
        onEdit={handleEditClick}
        onDelete={handleDeleteScenario}
        onAdd={handleAddClick}
      />

      <ScenarioForm
        scenarioForm={scenarioForm}
        categories={categories}
        isNewCategoryInput={isNewCategoryInput}
        setIsNewCategoryInput={setIsNewCategoryInput}
        newScenarioCategory={newScenarioCategory}
        setNewScenarioCategory={setNewScenarioCategory}
        onSave={handleSaveScenario}
        onCancel={handleCancelScenarioForm}
      >
        <ScenarioTemplateField
          draft={scenarioForm.draft}
          onDraftChange={(updates) => scenarioForm.setDraft(updates)}
        >
          <ScenarioAIGenerator
            onGenerate={handleGenerateTemplate}
            isGenerating={isGeneratingTemplate}
            canGenerate={!!scenarioForm.draft.title && !!scenarioForm.draft.description}
          />
        </ScenarioTemplateField>

        <ScenarioAttachments
          attachmentImages={scenarioForm.draft.attachmentImages || []}
          onUpload={handleImageUpload}
          onRemove={handleRemoveImage}
          fileInputRef={fileInputRef}
        />
      </ScenarioForm>
    </div>
  );
}
