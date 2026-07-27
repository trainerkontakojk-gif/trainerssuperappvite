import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { PdktScenario } from "@trainers/types";
import { useCrudForm } from "../../../../../hooks/useCrudForm";
import { ScenarioStickyFooter } from "./ScenarioStickyFooter";
import {
  ScenarioWizardStepHeader,
  type ScenarioStepStatus,
  type ScenarioWizardStep,
} from "./ScenarioWizardStepHeader";

interface Props {
  scenarioForm: ReturnType<typeof useCrudForm<PdktScenario>>;
  activeStep: ScenarioWizardStep;
  statuses: Record<ScenarioWizardStep, ScenarioStepStatus>;
  onStepChange: (step: ScenarioWizardStep) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  canNext: boolean;
  scenarioContent: React.ReactNode;
  profileContent: React.ReactNode;
  emailContent: React.ReactNode;
  simulationContent: React.ReactNode;
}

export function ScenarioForm({
  scenarioForm,
  activeStep,
  statuses,
  onStepChange,
  onNext,
  onBack,
  onCancel,
  onSubmit,
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
            className="text-xl font-bold tracking-tight text-foreground"
          >
            {editing ? "Edit Skenario PDKT" : "Tambah Skenario PDKT"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lengkapi informasi secara bertahap untuk membuat simulasi email.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onCancel}
          aria-label="Tutup wizard skenario"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[env(safe-area-inset-bottom)] sm:px-6">
        <ScenarioWizardStepHeader
          activeStep={activeStep}
          statuses={statuses}
          onStepChange={onStepChange}
        />
        <section
          id="scenario-step-scenario"
          hidden={activeStep !== "scenario"}
          className="space-y-5 pt-5"
          aria-labelledby="scenario-step-scenario-title"
        >
          <div>
            <h3
              id="scenario-step-scenario-title"
              className="text-lg font-bold text-foreground"
            >
              Skenario Permasalahan
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Jelaskan situasi yang akan dihadapi agent dalam simulasi email.
            </p>
          </div>
          {scenarioContent}
        </section>
        <section
          id="scenario-step-profile"
          hidden={activeStep !== "profile"}
          className="space-y-5 pt-5"
          aria-labelledby="scenario-step-profile-title"
        >
          <div>
            <h3
              id="scenario-step-profile-title"
              className="text-lg font-bold text-foreground"
            >
              Profil Pengirim
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Atur siapa pengirim email dan bagaimana cara pengirim
              berkomunikasi.
            </p>
          </div>
          {profileContent}
        </section>
        <section
          id="scenario-step-email"
          hidden={activeStep !== "email"}
          className="space-y-5 pt-5"
          aria-labelledby="scenario-step-email-title"
        >
          <div>
            <h3
              id="scenario-step-email-title"
              className="text-lg font-bold text-foreground"
            >
              Email &amp; Pengaturan
            </h3>
          </div>
          <div className="space-y-5">
            <section
              className="space-y-4 rounded-xl border border-border p-4"
              aria-labelledby="email-config-title"
            >
              <div>
                <h4
                  id="email-config-title"
                  className="text-base font-semibold text-foreground"
                >
                  Konfigurasi Email
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Atur penerima, template, dan lampiran untuk skenario ini.
                </p>
              </div>
              {emailContent}
            </section>
            <section
              className="space-y-4 rounded-xl border border-border p-4"
              aria-labelledby="simulation-settings-title"
            >
              <div>
                <h4
                  id="simulation-settings-title"
                  className="text-base font-semibold text-foreground"
                >
                  Pengaturan Simulasi
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sesuaikan perilaku AI yang digunakan dalam simulasi.
                </p>
              </div>
              {simulationContent}
            </section>
          </div>
        </section>
      </main>

      <ScenarioStickyFooter>
        {activeStep === "scenario" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
          >
            Batal
          </button>
        )}
        {activeStep !== "scenario" && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
          >
            Kembali
          </button>
        )}
        {activeStep === "email" ? (
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
          >
            {editing ? "Simpan Perubahan" : "Buat Skenario"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
          >
            Lanjut
          </button>
        )}
      </ScenarioStickyFooter>
    </div>
  );
}
