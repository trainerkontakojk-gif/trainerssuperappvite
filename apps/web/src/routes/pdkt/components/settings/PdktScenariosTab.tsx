import React, { useEffect, useRef, useState } from "react";
import {
  PDKT_PROMPT_INPUT_LIMITS,
  type PdktConsumerType,
  type PdktScenario,
} from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import { TEXT_MODELS } from "../../pdktSettings";
import {
  findInvalidPdktRecipientEmails,
  normalizePdktScenarioDraft,
} from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
  SettingsTextarea,
} from "./SettingsPrimitives";
import { ScenarioList } from "./scenarios/ScenarioList";
import { ScenarioForm } from "./scenarios/ScenarioForm";
import { ScenarioRecipientsField } from "./scenarios/ScenarioRecipientsField";
import { ScenarioAttachments } from "./scenarios/ScenarioAttachments";
import { ScenarioBasicsFields } from "./scenarios/ScenarioBasicsFields";
import type { ScenarioCreationMode } from "./scenarios/ScenarioCreationModePicker";
import {
  getScenarioCreationValidation,
  type ScenarioValidationErrorKey,
} from "./scenarios/ScenarioCreationValidation";
import type {
  ScenarioStepStatus,
  ScenarioWizardStep,
} from "./scenarios/ScenarioWizardStepHeader";

interface Props {
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  enableImageGeneration: boolean;
  setEnableImageGeneration: (value: boolean) => void;
  customIdentity: {
    senderName: string;
    bodyName: string;
    email: string;
    city: string;
  };
  globalConsumerTypeId: string;
  setGlobalConsumerTypeId: (value: string) => void;
  consumerNameMentionPattern: AppSettings["consumerNameMentionPattern"];
  setConsumerNameMentionPattern: (
    value: AppSettings["consumerNameMentionPattern"],
  ) => void;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  writingStyleMode: AppSettings["writingStyleMode"];
  setWritingStyleMode: (value: AppSettings["writingStyleMode"]) => void;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

type ErrorKey = ScenarioValidationErrorKey;
const CONFIRM_MESSAGE = "Perubahan belum disimpan. Yakin ingin keluar?";
const EMPTY_SCENARIO_DRAFT: Omit<PdktScenario, "id"> = {
  category: "",
  title: "",
  description: "",
  primaryRecipientType: "ojk",
  recipientMode: "single",
  recipientEmails: [],
  sampleEmailTemplate: { subject: "", body: "" },
  alwaysUseSampleEmail: false,
  isActive: true,
  attachmentImages: [],
};

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

export function PdktScenariosTab(props: Props) {
  const {
    scenarios,
    consumerTypes,
    scenarioForm,
    enableImageGeneration,
    setEnableImageGeneration,
    globalConsumerTypeId,
    setGlobalConsumerTypeId,
    consumerNameMentionPattern,
    setConsumerNameMentionPattern,
    selectedModel,
    setSelectedModel,
    writingStyleMode,
    setWritingStyleMode,
    setLocalSettings,
  } = props;
  const [creationMode, setCreationMode] = useState<ScenarioCreationMode | null>(
    null,
  );
  const [step, setStep] = useState<ScenarioWizardStep>("scenario");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [attempted, setAttempted] = useState<Set<ErrorKey>>(new Set());
  const [emailVisited, setEmailVisited] = useState(false);
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorGenerationRef = useRef(0);
  const pendingAttachmentReadsRef = useRef(0);

  const beginEditor = () => {
    editorGenerationRef.current += 1;
    pendingAttachmentReadsRef.current = 0;
    setPendingAttachmentReads(0);
  };

  const closeEditor = () => {
    editorGenerationRef.current += 1;
    pendingAttachmentReadsRef.current = 0;
    setPendingAttachmentReads(0);
    scenarioForm.close();
  };

  useEffect(() => {
    return () => {
      editorGenerationRef.current += 1;
    };
  }, []);
  const wizardSnapshot = useRef<{
    draft: Omit<PdktScenario, "id">;
    editingId: string | null;
    enableImageGeneration: boolean;
    globalConsumerTypeId: string;
    consumerNameMentionPattern: Props["consumerNameMentionPattern"];
    selectedModel: string;
    writingStyleMode: Props["writingStyleMode"];
    consumerTypes: PdktConsumerType[];
  } | null>(null);

  const draft = scenarioForm.draft;
  const descriptionLength = (draft.description || "").length;
  const categories = Array.from(
    new Set(scenarios.map((scenario) => scenario.category).filter(Boolean)),
  );
  const category = (
    newCategoryMode ? newCategory : draft.category || ""
  ).trim();
  const {
    errors: scenarioErrors,
    validationKeys: scenarioValidationKeys,
    validationIds: scenarioValidationIds,
    scenarioValid,
    profileValid,
    emailValid,
    manualEmailBody,
  } = getScenarioCreationValidation({
    draft,
    category,
    creationMode,
    newCategoryMode,
  });
  const descriptionErrorId =
    attempted.has("description") && scenarioErrors.description
      ? "scenario-description-error"
      : undefined;
  const selectedConsumer = consumerTypes.find(
    (consumer) => consumer.id === globalConsumerTypeId,
  );
  const statuses: Record<ScenarioWizardStep, ScenarioStepStatus> = {
    scenario:
      step === "scenario"
        ? "Sedang diisi"
        : scenarioValid
          ? "Selesai"
          : "Belum diisi",
    profile:
      step === "profile"
        ? "Sedang diisi"
        : step === "email" && profileValid
          ? "Selesai"
          : "Belum diisi",
    email:
      step === "email"
        ? "Sedang diisi"
        : emailVisited && emailValid
          ? "Selesai"
          : "Belum diisi",
  };

  const markAndFocus = (keys: ErrorKey[], ids: string[]) => {
    setAttempted((previous) => new Set([...previous, ...keys]));
    const index = keys.findIndex((key) => scenarioErrors[key]);
    if (index >= 0) focusField(ids[index]);
  };

  const goToStep = (requested: ScenarioWizardStep) => {
    const order: ScenarioWizardStep[] = ["scenario", "profile", "email"];
    const currentIndex = order.indexOf(step);
    const requestedIndex = order.indexOf(requested);
    if (requestedIndex <= currentIndex) {
      setStep(requested);
      return;
    }
    if (!scenarioValid) {
      setStep("scenario");
      markAndFocus(scenarioValidationKeys, scenarioValidationIds);
      return;
    }
    if (!profileValid) {
      setStep("profile");
      markAndFocus(["email"], ["custom-email"]);
      return;
    }
    if (requested === "email") setEmailVisited(true);
    setStep(requested);
  };

  const next = () => goToStep(step === "scenario" ? "profile" : "email");

  const openWizard = (editing: PdktScenario | null) => {
    beginEditor();
    wizardSnapshot.current = {
      draft: editing
        ? (({ id: _, ...rest }) => rest)(editing)
        : { ...EMPTY_SCENARIO_DRAFT },
      editingId: editing?.id ?? null,
      enableImageGeneration,
      globalConsumerTypeId,
      consumerNameMentionPattern,
      selectedModel,
      writingStyleMode,
      consumerTypes: structuredClone(consumerTypes),
    };
    setCreationMode(editing ? inferScenarioCreationMode(editing) : null);
    if (editing) scenarioForm.openEdit(editing);
    else scenarioForm.openAdd();
  };

  const wizardIsDirty = () => {
    const snapshot = wizardSnapshot.current;
    if (!snapshot) return false;
    const current = {
      draft,
      enableImageGeneration,
      globalConsumerTypeId,
      consumerNameMentionPattern,
      selectedModel,
      writingStyleMode,
      consumerTypes,
    };
    return (
      JSON.stringify(current) !==
      JSON.stringify({
        draft: snapshot.draft,
        enableImageGeneration: snapshot.enableImageGeneration,
        globalConsumerTypeId: snapshot.globalConsumerTypeId,
        consumerNameMentionPattern: snapshot.consumerNameMentionPattern,
        selectedModel: snapshot.selectedModel,
        writingStyleMode: snapshot.writingStyleMode,
        consumerTypes: snapshot.consumerTypes,
      })
    );
  };

  const cancel = () => {
    if (wizardIsDirty() && !window.confirm(CONFIRM_MESSAGE)) return;
    const snapshot = wizardSnapshot.current;
    if (snapshot) {
      closeEditor();
      setEnableImageGeneration(snapshot.enableImageGeneration);
      setGlobalConsumerTypeId(snapshot.globalConsumerTypeId);
      setConsumerNameMentionPattern(snapshot.consumerNameMentionPattern);
      setSelectedModel(snapshot.selectedModel);
      setWritingStyleMode(snapshot.writingStyleMode);
      setLocalSettings((previous) => ({
        ...previous,
        consumerTypes: snapshot.consumerTypes,
      }));
    } else scenarioForm.close();
    wizardSnapshot.current = null;
    setCreationMode(null);
    setStep("scenario");
    setEmailVisited(false);
    setAttempted(new Set());
  };

  const saveScenario = () => {
    if (pendingAttachmentReads > 0) return;
    if (!scenarioValid) {
      setStep("scenario");
      markAndFocus(scenarioValidationKeys, scenarioValidationIds);
      return;
    }
    if (!profileValid) {
      setStep("profile");
      markAndFocus(["email"], ["custom-email"]);
      return;
    }
    const invalidRecipients = findInvalidPdktRecipientEmails(
      draft.recipientEmails,
    );
    const invalidTemplate = Boolean(
      creationMode === "manual" && !draft.sampleEmailTemplate?.body?.trim(),
    );
    if (invalidRecipients.length || invalidTemplate) {
      setStep("email");
      if (invalidRecipients.length) {
        setAttempted((previous) => new Set([...previous, "email"]));
        const firstInvalidRecipientIndex = (
          draft.recipientEmails ?? []
        ).findIndex((email) =>
          invalidRecipients.includes(email.trim().toLowerCase()),
        );
        focusField(
          `scenario-recipient-email-${Math.max(firstInvalidRecipientIndex, 0)}`,
        );
      } else {
        setAttempted((previous) => new Set([...previous, "email"]));
        focusField("scenario-template-body");
      }
      return;
    }
    const normalized = normalizePdktScenarioDraft({
      ...draft,
      category,
      description:
        draft.description?.trim() ||
        (creationMode === "manual" ? manualEmailBody : ""),
      alwaysUseSampleEmail:
        creationMode === "manual"
          ? true
          : (draft.alwaysUseSampleEmail ?? false),
    });
    setLocalSettings((previous) => ({
      ...previous,
      scenarios: scenarioForm.save(previous.scenarios, normalized),
    }));
    closeEditor();
    setCreationMode(null);
    setStep("scenario");
    setAttempted(new Set());
  };

  const updateIdentity = (
    key: keyof Props["customIdentity"],
    value: string,
  ) => {
    const identityKey = key === "senderName" ? "name" : key;
    scenarioForm.setDraft({
      identity: { ...draft.identity, [identityKey]: value },
    });
    if (key === "email")
      setAttempted(
        (previous) => new Set([...previous].filter((item) => item !== "email")),
      );
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

  const activeCount = scenarios.filter((scenario) => scenario.isActive).length;
  const updateConsumer = (updates: Partial<PdktConsumerType>) => {
    if (!selectedConsumer) return;
    setLocalSettings((previous) => ({
      ...previous,
      consumerTypes: previous.consumerTypes.map((consumer) =>
        consumer.id === selectedConsumer.id
          ? { ...consumer, ...updates }
          : consumer,
      ),
    }));
  };

  const selectCreationMode = (mode: ScenarioCreationMode) => {
    setCreationMode(mode);
    setStep("scenario");
    setAttempted(new Set());
    setEmailVisited(false);
  };

  if (scenarioForm.isOpen) {
    return (
      <ScenarioForm
        scenarioForm={scenarioForm}
        creationMode={creationMode}
        activeStep={step}
        statuses={statuses}
        onStepChange={goToStep}
        onModeSelect={selectCreationMode}
        onNext={next}
        onBack={() => setStep(step === "email" ? "profile" : "scenario")}
        onCancel={cancel}
        onSubmit={saveScenario}
        pendingAttachmentReads={pendingAttachmentReads}
        canNext={step === "scenario" ? scenarioValid : profileValid}
        scenarioContent={
          <ScenarioBasicsFields
            creationMode={creationMode ?? "ai"}
            categories={categories}
            newCategory={newCategory}
            newCategoryMode={newCategoryMode}
            draft={draft}
            attempted={attempted}
            categoryError={scenarioErrors.category}
            titleError={scenarioErrors.title}
            descriptionError={scenarioErrors.description}
            manualEmailError={scenarioErrors.manualEmail}
            descriptionLength={descriptionLength}
            descriptionErrorId={descriptionErrorId}
            onNewCategoryChange={setNewCategory}
            onNewCategoryModeChange={setNewCategoryMode}
            onDraftChange={(updates) => scenarioForm.setDraft(updates)}
          />
        }
        profileContent={
          <div className="flex min-w-0 flex-col gap-6">
            <section className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 md:col-span-2">
                <h4 className="text-sm font-medium text-foreground">
                  Identitas Pengirim
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Berlaku khusus untuk skenario ini. Field kosong akan memakai
                  nilai skenario terkait, lalu identitas default.
                </p>
              </div>
              <SettingsField
                label="Nama pengirim"
                id="custom-sender-name"
                optional
              >
                <SettingsInput
                  id="custom-sender-name"
                  value={draft.identity?.name || ""}
                  onChange={(event) =>
                    updateIdentity("senderName", event.target.value)
                  }
                />
              </SettingsField>
              <SettingsField
                label="Nama panggilan"
                id="custom-body-name"
                optional
              >
                <SettingsInput
                  id="custom-body-name"
                  value={draft.identity?.bodyName || ""}
                  onChange={(event) =>
                    updateIdentity("bodyName", event.target.value)
                  }
                />
              </SettingsField>
              <SettingsField
                label="Email"
                id="custom-email"
                optional
                error={
                  attempted.has("email") ? scenarioErrors.email : undefined
                }
              >
                <SettingsInput
                  id="custom-email"
                  type="email"
                  value={draft.identity?.email || ""}
                  aria-invalid={Boolean(
                    attempted.has("email") && scenarioErrors.email,
                  )}
                  aria-describedby="custom-email-error"
                  onChange={(event) =>
                    updateIdentity("email", event.target.value)
                  }
                />
              </SettingsField>
              <SettingsField label="Kota" id="custom-city" optional>
                <SettingsInput
                  id="custom-city"
                  value={draft.identity?.city || ""}
                  onChange={(event) =>
                    updateIdentity("city", event.target.value)
                  }
                />
              </SettingsField>
            </section>
            <section className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 md:col-span-2">
                <h4 className="text-sm font-medium text-foreground">
                  Karakter dan Gaya Komunikasi
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Karakter aktif dan detailnya dipakai khusus untuk skenario
                  ini.
                </p>
              </div>
              <SettingsField
                label="Karakter aktif"
                id="global-consumer-type"
                optional
              >
                <SettingsSelect
                  id="global-consumer-type"
                  value={globalConsumerTypeId}
                  onChange={(event) =>
                    setGlobalConsumerTypeId(event.target.value)
                  }
                >
                  <option value="random">Acak</option>
                  {consumerTypes.map((consumer) => (
                    <option key={consumer.id} value={consumer.id}>
                      {consumer.name}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
              <SettingsField
                label="Penyebutan nama konsumen"
                id="consumer-mention-pattern"
                optional
              >
                <SettingsSelect
                  id="consumer-mention-pattern"
                  value={consumerNameMentionPattern}
                  onChange={(event) =>
                    setConsumerNameMentionPattern(
                      event.target
                        .value as AppSettings["consumerNameMentionPattern"],
                    )
                  }
                >
                  <option value="random">Acak</option>
                  <option value="upfront">Di awal</option>
                  <option value="middle">Di tengah</option>
                  <option value="late">Di akhir</option>
                  <option value="none">Tidak disebut</option>
                </SettingsSelect>
              </SettingsField>
              {selectedConsumer && (
                <>
                  <SettingsField
                    label="Nama karakter"
                    id="consumer-name"
                    optional
                  >
                    <SettingsInput
                      id="consumer-name"
                      value={selectedConsumer.name}
                      onChange={(event) =>
                        updateConsumer({ name: event.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="Tingkat kesulitan"
                    id="consumer-difficulty"
                    optional
                  >
                    <SettingsSelect
                      id="consumer-difficulty"
                      value={selectedConsumer.difficulty || "Medium"}
                      onChange={(event) =>
                        updateConsumer({
                          difficulty: event.target
                            .value as PdktConsumerType["difficulty"],
                        })
                      }
                    >
                      <option>Easy</option>
                      <option>Medium</option>
                      <option>Hard</option>
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField
                    label="Tone komunikasi"
                    id="consumer-tone"
                    optional
                  >
                    <SettingsInput
                      id="consumer-tone"
                      value={selectedConsumer.tone || ""}
                      onChange={(event) =>
                        updateConsumer({ tone: event.target.value })
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    label="Deskripsi karakter"
                    id="consumer-description"
                    optional
                  >
                    <SettingsTextarea
                      id="consumer-description"
                      rows={4}
                      value={selectedConsumer.description}
                      onChange={(event) =>
                        updateConsumer({ description: event.target.value })
                      }
                    />
                  </SettingsField>
                </>
              )}
            </section>
          </div>
        }
        emailContent={
          <div
            id="scenario-email-content"
            className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8"
          >
            <div className="min-w-0">
              <ScenarioRecipientsField
                draft={draft}
                onDraftChange={(updates) => scenarioForm.setDraft(updates)}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {pendingAttachmentReads > 0 && (
                <p role="status" className="text-xs text-muted-foreground">
                  Membaca lampiran...
                </p>
              )}

              <ScenarioAttachments
                attachmentImages={draft.attachmentImages || []}
                onUpload={uploadAttachment}
                onRemove={(index) =>
                  scenarioForm.setDraft({
                    attachmentImages: (draft.attachmentImages || []).filter(
                      (_, current) => current !== index,
                    ),
                  })
                }
                fileInputRef={fileInputRef}
              />

              <SettingsField
                label="Jawaban yang Diharapkan"
                id="scenario-expected-answer"
              >
                <SettingsTextarea
                  id="scenario-expected-answer"
                  rows={4}
                  aria-describedby="scenario-expected-answer-help"
                  maxLength={PDKT_PROMPT_INPUT_LIMITS.longText}
                  value={draft.expectedAnswer || ""}
                  placeholder="Tuliskan inti tindakan atau informasi yang diharapkan dalam balasan agent..."
                  onChange={(event) =>
                    scenarioForm.setDraft({
                      expectedAnswer: event.target.value,
                    })
                  }
                />
                <p
                  id="scenario-expected-answer-help"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Hanya digunakan sebagai referensi evaluasi setelah balasan
                  dikirim, bukan untuk membuat email simulasi.
                </p>
              </SettingsField>
            </div>
          </div>
        }
        simulationContent={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField
              label="Buat gambar"
              id="enable-image-generation"
              optional
            >
              <input
                id="enable-image-generation"
                type="checkbox"
                checked={enableImageGeneration}
                onChange={(event) =>
                  setEnableImageGeneration(event.target.checked)
                }
                className="size-4 rounded border-input accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </SettingsField>
            <SettingsField label="Model AI" id="selected-model" optional>
              <SettingsSelect
                id="selected-model"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
              >
                {TEXT_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </SettingsSelect>
            </SettingsField>
            <SettingsField label="Gaya penulisan" id="writing-style" optional>
              <SettingsSelect
                id="writing-style"
                value={writingStyleMode}
                onChange={(event) =>
                  setWritingStyleMode(
                    event.target.value as AppSettings["writingStyleMode"],
                  )
                }
              >
                <option value="training">Latihan</option>
                <option value="realistic">Realistis</option>
              </SettingsSelect>
            </SettingsField>
          </div>
        }
      />
    );
  }

  return (
    <ScenarioList
      scenarios={scenarios}
      isOpen={false}
      activeCount={activeCount}
      totalScenarios={scenarios.length}
      allSelected={activeCount === scenarios.length && scenarios.length > 0}
      noneSelected={activeCount === 0}
      enableImageGeneration={enableImageGeneration}
      onToggleImageGeneration={() =>
        setEnableImageGeneration(!enableImageGeneration)
      }
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
      onEdit={(scenario) => {
        setStep("scenario");
        setAttempted(new Set());
        setNewCategory(scenario.category);
        setNewCategoryMode(!categories.includes(scenario.category));
        openWizard(scenario);
      }}
      onDelete={(id) => {
        if (window.confirm("Hapus skenario ini?"))
          setLocalSettings((previous) => ({
            ...previous,
            scenarios: previous.scenarios.filter(
              (scenario) => scenario.id !== id,
            ),
          }));
      }}
      onAdd={() => {
        setStep("scenario");
        setAttempted(new Set());
        setNewCategory("");
        setNewCategoryMode(false);
        openWizard(null);
      }}
    />
  );
}
