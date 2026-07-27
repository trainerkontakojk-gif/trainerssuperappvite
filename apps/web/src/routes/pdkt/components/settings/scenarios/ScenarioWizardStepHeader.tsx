import React from "react";
import { Check } from "lucide-react";

export type ScenarioWizardStep = "scenario" | "profile" | "email";
export type ScenarioStepStatus = "Belum diisi" | "Sedang diisi" | "Selesai";

interface Props {
  activeStep: ScenarioWizardStep;
  statuses: Record<ScenarioWizardStep, ScenarioStepStatus>;
  onStepChange: (step: ScenarioWizardStep) => void;
}

const steps: { id: ScenarioWizardStep; label: string }[] = [
  { id: "scenario", label: "1. Skenario" },
  { id: "profile", label: "2. Profil Pengirim" },
  { id: "email", label: "3. Email & Pengaturan" },
];

export function ScenarioWizardStepHeader({
  activeStep,
  statuses,
  onStepChange,
}: Props) {
  return (
    <nav
      aria-label="Tahapan pengaturan skenario"
      className="border-b border-border pb-4"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map(({ id, label }) => {
          const active = activeStep === id;
          const status = statuses[id];
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-controls={`scenario-step-${id}`}
              aria-label={`${label}, ${status}`}
              onClick={() => onStepChange(id)}
              className={`rounded-lg border px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${active ? "border-foreground bg-foreground/5" : "border-border hover:bg-foreground/5"}`}
            >
              <span className="block text-sm font-semibold text-foreground">
                {label}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {status === "Selesai" && (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {status}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
