import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../../hooks/useCrudForm";
import { ScenarioStickyFooter } from "./ScenarioStickyFooter";
import {
  ScenarioCreationModePicker,
  type ScenarioCreationMode,
} from "./ScenarioCreationModePicker";
import { Button } from "../../../../../components/ui/button";
import {
  ScenarioWizardStepHeader,
  type ScenarioStepStatus,
  type ScenarioWizardStep,
} from "./ScenarioWizardStepHeader";

interface Props {
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  creationMode: ScenarioCreationMode | null;
  activeStep: ScenarioWizardStep;
  statuses: Record<ScenarioWizardStep, ScenarioStepStatus>;
  onStepChange: (step: ScenarioWizardStep) => void;
  onModeSelect: (mode: ScenarioCreationMode) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  pendingAttachmentReads: number;
  canNext: boolean;
  scenarioContent: React.ReactNode;
  profileContent: React.ReactNode;
  emailContent: React.ReactNode;
  simulationContent: React.ReactNode;
}

export function ScenarioForm({
  scenarioForm,
  creationMode,
  activeStep,
  statuses,
  onStepChange,
  onModeSelect,
  onNext,
  onBack,
  onCancel,
  onSubmit,
  pendingAttachmentReads,
  canNext,
  scenarioContent,
  profileContent,
  emailContent,
  simulationContent,
}: Props) {
  const editing = Boolean(scenarioForm.editingId);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (scenarioForm.isOpen) closeButtonRef.current?.focus();
  }, [scenarioForm.isOpen]);

  const stepLabels = {
    scenario: creationMode === "ai" ? "1. Skenario AI" : "1. Email Anda",
    email: "3. Penerima & Evaluasi",
  };

  if (!scenarioForm.isOpen) return null;

  return (
    <div
      id="scenario-form"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className="flex min-h-0 flex-1 flex-col bg-card"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2
            id="scenario-wizard-title"
            className="text-lg tracking-tight text-foreground"
          >
            {editing ? "Edit Skenario PDKT" : "Tambah Skenario PDKT"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {creationMode === null
              ? "Pilih cara menyiapkan skenario sebelum mengisi form."
              : creationMode === "ai"
                ? "Skenario AI · email akan dibuat oleh AI dari deskripsi situasi."
                : "Email buatan sendiri · gunakan email yang Anda tulis."}
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onCancel}
          aria-label="Tutup wizard skenario"
        >
          <X data-icon="inline" />
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[env(safe-area-inset-bottom)] sm:px-6">
        {creationMode === null ? (
          <ScenarioCreationModePicker
            onSelect={onModeSelect}
            onCancel={onCancel}
          />
        ) : (
          <>
            <ScenarioWizardStepHeader
              activeStep={activeStep}
              statuses={statuses}
              onStepChange={onStepChange}
              labels={stepLabels}
            />

            <section
              id="scenario-step-scenario"
              hidden={activeStep !== "scenario"}
              className="flex flex-col gap-5 pt-5"
              aria-labelledby="scenario-step-scenario-title"
            >
              <div>
                <h3
                  id="scenario-step-scenario-title"
                  className="text-sm font-semibold tracking-tight text-foreground"
                >
                  {creationMode === "ai"
                    ? "Skenario Permasalahan"
                    : "Email Buatan Sendiri"}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {creationMode === "ai"
                    ? "Jelaskan situasi yang akan dihadapi agent dalam simulasi email."
                    : "Tulis email yang akan dipakai sebagai isi awal simulasi."}
                </p>
              </div>
              {scenarioContent}
            </section>

            <section
              id="scenario-step-profile"
              hidden={activeStep !== "profile"}
              className="flex flex-col gap-5 pt-5"
              aria-labelledby="scenario-step-profile-title"
            >
              <div>
                <h3
                  id="scenario-step-profile-title"
                  className="text-sm font-semibold tracking-tight text-foreground"
                >
                  Profil Pengirim
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Atur siapa pengirim email dan bagaimana cara pengirim
                  berkomunikasi.
                </p>
              </div>
              {profileContent}
            </section>

            <section
              id="scenario-step-email"
              hidden={activeStep !== "email"}
              className="flex flex-col gap-6 pt-5"
              aria-labelledby="scenario-step-email-title"
            >
              <div>
                <h3
                  id="scenario-step-email-title"
                  className="text-sm font-semibold tracking-tight text-foreground"
                >
                  Penerima & Evaluasi
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Atur penerima dan lampiran; jawaban acuan opsional membantu
                  evaluasi balasan.
                </p>
              </div>

              {emailContent}

              <details className="border-t border-border pt-5">
                <summary className="cursor-pointer text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  Pengaturan tambahan
                </summary>
                <div className="pt-4">
                  <h4
                    id="simulation-settings-title"
                    className="text-sm font-medium text-foreground"
                  >
                    Pengaturan Simulasi
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Sesuaikan perilaku AI yang digunakan dalam simulasi.
                  </p>
                </div>
                <div className="pt-4">{simulationContent}</div>
              </details>
            </section>
          </>
        )}
      </main>

      {creationMode !== null && (
        <ScenarioStickyFooter>
          {activeStep === "scenario" ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Batal
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onBack}>
              Kembali
            </Button>
          )}
          {activeStep === "email" ? (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pendingAttachmentReads > 0}
            >
              {editing ? "Simpan Skenario" : "Buat Skenario"}
            </Button>
          ) : (
            <Button type="button" onClick={onNext} disabled={!canNext}>
              Lanjut
            </Button>
          )}
        </ScenarioStickyFooter>
      )}
    </div>
  );
}
