import React, { useEffect, useRef, useState } from "react";
import type { PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import {
  findInvalidPdktRecipientEmails,
  normalizePdktScenarioDraft,
} from "./pdktDraftNormalizers";
import { ScenarioList } from "./scenarios/ScenarioList";
import { ScenarioEditor } from "./scenarios/ScenarioEditor";
import {
  getScenarioCreationValidation,
  type ScenarioCreationMode,
  type ScenarioValidationErrorKey,
} from "./scenarios/ScenarioCreationValidation";

interface Props {
  scenarios: PdktScenario[];
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

type ErrorKey = ScenarioValidationErrorKey;
const CONFIRM_MESSAGE = "Perubahan belum diterapkan. Yakin ingin keluar?";

function focusField(id: string) {
  window.setTimeout(() => {
    const element = document.getElementById(id) as HTMLElement | null;
    element?.focus();
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 0);
}

function inferScenarioCreationMode(
  scenario: PdktScenario,
): ScenarioCreationMode {
  return scenario.alwaysUseSampleEmail ? "manual" : "ai";
}

export function PdktScenariosTab({
  scenarios,
  scenarioForm,
  setLocalSettings,
}: Props) {
  const [creationMode, setCreationMode] = useState<ScenarioCreationMode>("ai");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorGenerationRef = useRef(0);
  const pendingAttachmentReadsRef = useRef(0);

  useEffect(() => {
    return () => {
      editorGenerationRef.current += 1;
    };
  }, []);

  const draft = scenarioForm.draft;
  const categories = Array.from(
    new Set(scenarios.map((scenario) => scenario.category).filter(Boolean)),
  );
  const category = (
    newCategoryMode ? newCategory : draft.category || ""
  ).trim();
  const { errors, manualEmailBody } = getScenarioCreationValidation({
    draft,
    category,
    creationMode,
  });
  const visibleErrors: Partial<Record<ErrorKey, string>> = attempted
    ? errors
    : {};

  const resetEditorState = () => {
    editorGenerationRef.current += 1;
    pendingAttachmentReadsRef.current = 0;
    setPendingAttachmentReads(0);
    setAttempted(false);
    setAdvancedOpen(false);
  };

  const openEditor = (editing: PdktScenario | null) => {
    resetEditorState();
    setCreationMode(editing ? inferScenarioCreationMode(editing) : "ai");
    setNewCategory(editing?.category ?? "");
    setNewCategoryMode(
      Boolean(editing?.category) && !categories.includes(editing!.category),
    );
    if (editing) scenarioForm.openEdit(editing);
    else scenarioForm.openAdd();
  };

  const closeEditor = () => {
    resetEditorState();
    scenarioForm.close();
  };

  const cancel = () => {
    if (scenarioForm.isDirty(scenarios) && !window.confirm(CONFIRM_MESSAGE))
      return;
    closeEditor();
  };

  const deleteScenario = (id: string) => {
    if (!window.confirm("Hapus skenario ini?")) return false;
    setLocalSettings((previous) => ({
      ...previous,
      scenarios: previous.scenarios.filter((scenario) => scenario.id !== id),
    }));
    return true;
  };

  const applyScenario = () => {
    if (pendingAttachmentReads > 0) return;
    // Urutan sesuai tampilan editor: judul, kategori, isi kasus, lalu email
    // identitas di Opsi tambahan.
    const fields: Array<[ErrorKey, string]> = [
      ["title", "scenario-title"],
      [
        "category",
        newCategoryMode ? "scenario-category-new" : "scenario-category",
      ],
      creationMode === "manual"
        ? ["manualEmail", "scenario-template-body"]
        : ["description", "scenario-description"],
      ["email", "custom-email"],
    ];
    const failing = fields.find(([key]) => errors[key]);
    const invalidRecipients = findInvalidPdktRecipientEmails(
      draft.recipientEmails,
    );
    if (failing || invalidRecipients.length) {
      setAttempted(true);
      if (errors.email) setAdvancedOpen(true);
      if (failing) {
        focusField(failing[1]);
      } else {
        const index = (draft.recipientEmails ?? []).findIndex((email) =>
          invalidRecipients.includes(email.trim().toLowerCase()),
        );
        focusField(`scenario-recipient-email-${Math.max(index, 0)}`);
      }
      return;
    }
    const normalized = normalizePdktScenarioDraft({
      ...draft,
      category,
      description:
        draft.description?.trim() ||
        (creationMode === "manual" ? manualEmailBody : ""),
      alwaysUseSampleEmail: creationMode === "manual",
    });
    setLocalSettings((previous) => ({
      ...previous,
      scenarios: scenarioForm.save(previous.scenarios, normalized),
    }));
    closeEditor();
  };

  const updateIdentity = (
    key: "name" | "bodyName" | "email" | "city",
    value: string,
  ) => {
    scenarioForm.setDraft({
      identity: { ...draft.identity, [key]: value },
    });
  };

  const uploadAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const readGeneration = editorGenerationRef.current;
    if (!file) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isPdf) {
      notify.error("Format lampiran belum didukung. Gunakan gambar atau PDF.");
    } else if (file.size > (isPdf ? 2 * 1024 * 1024 : 500 * 1024)) {
      notify.error(
        isPdf
          ? "Ukuran PDF terlalu besar! Maksimal 2MB per PDF agar pengaturan dapat disimpan."
          : "Ukuran gambar terlalu besar! Maksimal 500KB per gambar agar pengaturan dapat disimpan.",
      );
    } else if ((draft.attachmentImages || []).length >= 5) {
      notify.warning("Maksimal 5 lampiran per skenario.");
    } else {
      const draftGeneration = scenarioForm.getDraftGeneration();
      const reader = new FileReader();
      let settled = false;
      pendingAttachmentReadsRef.current += 1;
      setPendingAttachmentReads(pendingAttachmentReadsRef.current);
      const finishRead = () => {
        if (settled) return;
        settled = true;
        if (editorGenerationRef.current === readGeneration) {
          pendingAttachmentReadsRef.current = Math.max(
            0,
            pendingAttachmentReadsRef.current - 1,
          );
          setPendingAttachmentReads(pendingAttachmentReadsRef.current);
        }
      };
      const isCurrentEditor = () =>
        editorGenerationRef.current === readGeneration &&
        scenarioForm.getDraftGeneration() === draftGeneration &&
        scenarioForm.isOpen;
      reader.onloadend = () => {
        if (settled) return;
        if (!isCurrentEditor()) {
          finishRead();
          return;
        }
        if (typeof reader.result !== "string") {
          notify.error(`Gagal membaca file ${file.name}.`);
          finishRead();
          return;
        }
        scenarioForm.setDraft((previous) => {
          if ((previous.attachmentImages || []).length >= 5) {
            notify.warning("Maksimal 5 lampiran per skenario.");
            return {};
          }
          return {
            attachmentImages: [
              ...(previous.attachmentImages || []),
              reader.result as string,
            ],
          };
        });
        finishRead();
      };
      reader.onerror = () => {
        if (settled) return;
        if (isCurrentEditor()) notify.error(`Gagal membaca file ${file.name}.`);
        finishRead();
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (scenarioForm.isOpen) {
    const editingId = scenarioForm.editingId;
    return (
      <ScenarioEditor
        isNew={!editingId}
        draft={draft}
        onDraftChange={(updates) => scenarioForm.setDraft(updates)}
        creationMode={creationMode}
        onModeChange={setCreationMode}
        categories={categories}
        newCategory={newCategory}
        newCategoryMode={newCategoryMode}
        onNewCategoryChange={setNewCategory}
        onNewCategoryModeChange={setNewCategoryMode}
        errors={visibleErrors}
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={setAdvancedOpen}
        onIdentityChange={updateIdentity}
        attachments={{
          onUpload: uploadAttachment,
          onRemove: (index) =>
            scenarioForm.setDraft({
              attachmentImages: (draft.attachmentImages || []).filter(
                (_, current) => current !== index,
              ),
            }),
          fileInputRef,
          pendingReads: pendingAttachmentReads,
        }}
        onCancel={cancel}
        onApply={applyScenario}
        onDelete={
          editingId
            ? () => {
                if (deleteScenario(editingId)) closeEditor();
              }
            : undefined
        }
      />
    );
  }

  const activeCount = scenarios.filter((scenario) => scenario.isActive).length;
  return (
    <ScenarioList
      scenarios={scenarios}
      activeCount={activeCount}
      totalScenarios={scenarios.length}
      allSelected={activeCount === scenarios.length && scenarios.length > 0}
      noneSelected={activeCount === 0}
      onSelectAll={() =>
        setLocalSettings((previous) => ({
          ...previous,
          scenarios: previous.scenarios.map((scenario) => ({
            ...scenario,
            isActive: true,
          })),
        }))
      }
      onUnselectAll={() =>
        setLocalSettings((previous) => ({
          ...previous,
          scenarios: previous.scenarios.map((scenario) => ({
            ...scenario,
            isActive: false,
          })),
        }))
      }
      onToggleScenario={(id) =>
        setLocalSettings((previous) => ({
          ...previous,
          scenarios: previous.scenarios.map((scenario) =>
            scenario.id === id
              ? { ...scenario, isActive: !scenario.isActive }
              : scenario,
          ),
        }))
      }
      onEdit={openEditor}
      onDelete={deleteScenario}
      onAdd={() => openEditor(null)}
    />
  );
}
