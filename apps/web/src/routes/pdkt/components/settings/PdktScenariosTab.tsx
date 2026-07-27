import React, { useRef, useState } from "react";
import type { PdktConsumerType, PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { notify } from "../../../../lib/toast";
import { pdktClient, unwrapResponse } from "../../../../lib/api";
import type { PdktAppSettings as AppSettings } from "../../pdktSettings";
import { TEXT_MODELS } from "../../pdktSettings";
import {
  findInvalidPdktRecipientEmails,
  normalizePdktScenarioDraft,
  isValidPdktRecipientEmail,
} from "./pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "./SettingsPrimitives";
import { ScenarioList } from "./scenarios/ScenarioList";
import { ScenarioForm } from "./scenarios/ScenarioForm";
import { ScenarioRecipientsField } from "./scenarios/ScenarioRecipientsField";
import { ScenarioTemplateField } from "./scenarios/ScenarioTemplateField";
import { ScenarioAttachments } from "./scenarios/ScenarioAttachments";
import { ScenarioAIGenerator } from "./scenarios/ScenarioAIGenerator";
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
  setCustomSenderName: (value: string) => void;
  setCustomBodyName: (value: string) => void;
  setCustomEmail: (value: string) => void;
  setCustomCity: (value: string) => void;
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

type ErrorKey = "category" | "title" | "description" | "email";
const CONFIRM_MESSAGE = "Perubahan belum disimpan. Yakin ingin keluar?";
const EMPTY_SCENARIO_DRAFT: Omit<PdktScenario, "id"> = {
  category: "",
  title: "",
  description: "",
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

export function PdktScenariosTab(props: Props) {
  const {
    scenarios,
    consumerTypes,
    scenarioForm,
    enableImageGeneration,
    setEnableImageGeneration,
    customIdentity,
    setCustomSenderName,
    setCustomBodyName,
    setCustomEmail,
    setCustomCity,
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
  const [step, setStep] = useState<ScenarioWizardStep>("scenario");
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [attempted, setAttempted] = useState<Set<ErrorKey>>(new Set());
  const [emailVisited, setEmailVisited] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wizardSnapshot = useRef<{
    draft: Omit<PdktScenario, "id">;
    editingId: string | null;
    identity: Props["customIdentity"];
    enableImageGeneration: boolean;
    globalConsumerTypeId: string;
    consumerNameMentionPattern: Props["consumerNameMentionPattern"];
    selectedModel: string;
    writingStyleMode: Props["writingStyleMode"];
    consumerTypes: PdktConsumerType[];
  } | null>(null);

  const draft = scenarioForm.draft;
  const categories = Array.from(
    new Set(scenarios.map((scenario) => scenario.category).filter(Boolean)),
  );
  const category = (
    newCategoryMode ? newCategory : draft.category || ""
  ).trim();
  const scenarioErrors: Record<ErrorKey, string> = {
    category: category ? "" : "Kategori wajib diisi.",
    title: draft.title?.trim() ? "" : "Judul skenario wajib diisi.",
    description: draft.description?.trim()
      ? ""
      : "Deskripsi masalah wajib diisi.",
    email:
      customIdentity.email.trim() &&
      !isValidPdktRecipientEmail(customIdentity.email.trim())
        ? "Format email tidak valid."
        : "",
  };
  const scenarioValid =
    !scenarioErrors.category &&
    !scenarioErrors.title &&
    !scenarioErrors.description;
  const profileValid = !scenarioErrors.email;
  const emailValid =
    findInvalidPdktRecipientEmails(draft.recipientEmails).length === 0 &&
    (!draft.alwaysUseSampleEmail ||
      Boolean(draft.sampleEmailTemplate?.body?.trim()));
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
      markAndFocus(
        ["category", "title", "description"],
        [
          newCategoryMode ? "scenario-category-new" : "scenario-category",
          "scenario-title",
          "scenario-description",
        ],
      );
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
    wizardSnapshot.current = {
      draft: editing
        ? (({ id: _, ...rest }) => rest)(editing)
        : { ...EMPTY_SCENARIO_DRAFT },
      editingId: editing?.id ?? null,
      identity: { ...customIdentity },
      enableImageGeneration,
      globalConsumerTypeId,
      consumerNameMentionPattern,
      selectedModel,
      writingStyleMode,
      consumerTypes: structuredClone(consumerTypes),
    };
    if (editing) scenarioForm.openEdit(editing);
    else scenarioForm.openAdd();
  };

  const wizardIsDirty = () => {
    const snapshot = wizardSnapshot.current;
    if (!snapshot) return false;
    const current = {
      draft,
      identity: customIdentity,
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
        identity: snapshot.identity,
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
      scenarioForm.setDraft(snapshot.draft);
      scenarioForm.setEditingId(snapshot.editingId);
      scenarioForm.setIsOpen(false);
      setCustomSenderName(snapshot.identity.senderName);
      setCustomBodyName(snapshot.identity.bodyName);
      setCustomEmail(snapshot.identity.email);
      setCustomCity(snapshot.identity.city);
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
    setStep("scenario");
    setEmailVisited(false);
    setAttempted(new Set());
  };

  const saveScenario = () => {
    if (!scenarioValid) {
      setStep("scenario");
      markAndFocus(
        ["category", "title", "description"],
        [
          newCategoryMode ? "scenario-category-new" : "scenario-category",
          "scenario-title",
          "scenario-description",
        ],
      );
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
      draft.alwaysUseSampleEmail && !draft.sampleEmailTemplate?.body?.trim(),
    );
    if (invalidRecipients.length || invalidTemplate) {
      setStep("email");
      if (invalidRecipients.length) {
        setAttempted((previous) => new Set([...previous, "email"]));
        const firstInvalidRecipientIndex = (draft.recipientEmails ?? []).findIndex(
          (email) => invalidRecipients.includes(email.trim().toLowerCase()),
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
    const normalized = normalizePdktScenarioDraft({ ...draft, category });
    setLocalSettings((previous) => ({
      ...previous,
      scenarios: scenarioForm.save(previous.scenarios, normalized),
    }));
    scenarioForm.close();
    setStep("scenario");
    setAttempted(new Set());
  };

  const updateIdentity = (
    key: keyof Props["customIdentity"],
    value: string,
  ) => {
    const setters = {
      senderName: setCustomSenderName,
      bodyName: setCustomBodyName,
      email: setCustomEmail,
      city: setCustomCity,
    };
    setters[key](value);
    if (key === "email")
      setAttempted(
        (previous) => new Set([...previous].filter((item) => item !== "email")),
      );
  };

  const uploadAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      const reader = new FileReader();
      reader.onloadend = () =>
        scenarioForm.setDraft({
          attachmentImages: [
            ...(scenarioForm.draft.attachmentImages || []),
            reader.result as string,
          ],
        });
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const generateTemplate = async () => {
    if (!draft.title?.trim() || !draft.description?.trim()) {
      notify.warning(
        "Isi judul dan deskripsi masalah terlebih dahulu untuk generate template.",
      );
      return;
    }
    setGenerating(true);
    try {
      const result = (await unwrapResponse(
        await pdktClient["generate-template"].$post({
          json: {
            scenarioDraft: {
              id: scenarioForm.editingId || "draft",
              ...normalizePdktScenarioDraft({ ...draft, category }),
              attachmentImages: (draft.attachmentImages || []).map(() => ""),
            },
            consumerTypeId:
              globalConsumerTypeId === "random"
                ? "ramah"
                : globalConsumerTypeId,
            consumerTypeDraft: selectedConsumer,
            identity: {
              name: customIdentity.senderName || "Budi Santoso",
              bodyName: customIdentity.bodyName || "Budi",
              email: customIdentity.email || "budi@example.com",
              city: customIdentity.city || "Jakarta",
            },
          },
        }),
      )) as { subject: string; body: string };
      scenarioForm.setDraft({ sampleEmailTemplate: result });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Gagal generate template.",
      );
    } finally {
      setGenerating(false);
    }
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

  if (scenarioForm.isOpen) {
    return (
      <ScenarioForm
        scenarioForm={scenarioForm}
        activeStep={step}
        statuses={statuses}
        onStepChange={goToStep}
        onNext={next}
        onBack={() => setStep(step === "email" ? "profile" : "scenario")}
        onCancel={cancel}
        onSubmit={saveScenario}
        canNext={step === "scenario" ? scenarioValid : profileValid}
        scenarioContent={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField
              label="Kategori"
              id={
                newCategoryMode ? "scenario-category-new" : "scenario-category"
              }
              required
              error={
                attempted.has("category") ? scenarioErrors.category : undefined
              }
            >
              {newCategoryMode ? (
                <div className="flex gap-2">
                  <SettingsInput
                    id="scenario-category-new"
                    required
                    aria-required="true"
                    value={newCategory}
                    placeholder="Nama kategori baru"
                    aria-invalid={Boolean(
                      attempted.has("category") && scenarioErrors.category,
                    )}
                    aria-describedby="scenario-category-error"
                    onChange={(event) => {
                      setNewCategory(event.target.value);
                      scenarioForm.setDraft({ category: event.target.value });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryMode(false);
                      setNewCategory("");
                      scenarioForm.setDraft({ category: "" });
                    }}
                    className="rounded-md border border-border px-3 text-xs"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <SettingsSelect
                  id="scenario-category"
                  required
                  aria-required="true"
                  value={draft.category || ""}
                  aria-invalid={Boolean(
                    attempted.has("category") && scenarioErrors.category,
                  )}
                  aria-describedby="scenario-category-error"
                  onChange={(event) => {
                    if (event.target.value === "NEW") {
                      setNewCategoryMode(true);
                      setNewCategory("");
                      scenarioForm.setDraft({ category: "" });
                    } else
                      scenarioForm.setDraft({ category: event.target.value });
                  }}
                >
                  <option value="">Pilih kategori</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value="NEW">+ Tambah kategori</option>
                </SettingsSelect>
              )}
            </SettingsField>
            <SettingsField
              label="Judul"
              id="scenario-title"
              required
              error={attempted.has("title") ? scenarioErrors.title : undefined}
            >
              <SettingsInput
                id="scenario-title"
                required
                aria-required="true"
                value={draft.title || ""}
                placeholder="Contoh: Kesalahan Transaksi Real-time"
                aria-invalid={Boolean(
                  attempted.has("title") && scenarioErrors.title,
                )}
                aria-describedby="scenario-title-error"
                onChange={(event) =>
                  scenarioForm.setDraft({ title: event.target.value })
                }
              />
            </SettingsField>
            <SettingsField
              label="Deskripsi"
              id="scenario-description"
              required
              className="md:col-span-2"
              error={
                attempted.has("description")
                  ? scenarioErrors.description
                  : undefined
              }
            >
              <textarea
                id="scenario-description"
                required
                aria-required="true"
                rows={4}
                value={draft.description || ""}
                placeholder="Jelaskan konteks masalah yang harus diselesaikan oleh agen..."
                aria-invalid={Boolean(
                  attempted.has("description") && scenarioErrors.description,
                )}
                aria-describedby="scenario-description-error"
                onChange={(event) =>
                  scenarioForm.setDraft({ description: event.target.value })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
              />
            </SettingsField>
          </div>
        }
        profileContent={
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-border p-4">
              <h4 className="text-base font-semibold text-foreground">
                Identitas Pengirim
              </h4>
              <SettingsField
                label="Nama pengirim"
                id="custom-sender-name"
                optional
              >
                <SettingsInput
                  id="custom-sender-name"
                  value={customIdentity.senderName}
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
                  value={customIdentity.bodyName}
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
                  value={customIdentity.email}
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
                  value={customIdentity.city}
                  onChange={(event) =>
                    updateIdentity("city", event.target.value)
                  }
                />
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
            </div>
            <div className="space-y-4 rounded-xl border border-border p-4">
              <h4 className="text-base font-semibold text-foreground">
                Karakter dan Gaya Komunikasi
              </h4>
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
                    <textarea
                      id="consumer-description"
                      rows={4}
                      value={selectedConsumer.description}
                      onChange={(event) =>
                        updateConsumer({ description: event.target.value })
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
                    />
                  </SettingsField>
                </>
              )}
            </div>
          </div>
        }
        emailContent={
          <div className="space-y-5 pt-4">
            <ScenarioRecipientsField
              draft={draft}
              onDraftChange={(updates) => scenarioForm.setDraft(updates)}
            />
            <ScenarioTemplateField
              draft={draft}
              onDraftChange={(updates) => scenarioForm.setDraft(updates)}
              error={
                attempted.has("email") &&
                draft.alwaysUseSampleEmail &&
                !draft.sampleEmailTemplate?.body?.trim()
                  ? "Isi body template email jika opsi ini aktif."
                  : undefined
              }
            >
              <ScenarioAIGenerator
                onGenerate={generateTemplate}
                isGenerating={generating}
                canGenerate={Boolean(
                  draft.title?.trim() && draft.description?.trim(),
                )}
              />
            </ScenarioTemplateField>
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
                className="h-4 w-4 rounded border-border text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
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
