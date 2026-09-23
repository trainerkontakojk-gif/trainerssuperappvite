import React from "react";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../../components/ui/button";

export type ScenarioWizardStep = "scenario" | "profile" | "email";
export type ScenarioStepStatus = "Belum diisi" | "Sedang diisi" | "Selesai";

interface Props {
  activeStep: ScenarioWizardStep;
  statuses: Record<ScenarioWizardStep, ScenarioStepStatus>;
  onStepChange: (step: ScenarioWizardStep) => void;
  labels?: Partial<Record<ScenarioWizardStep, string>>;
}

const defaultSteps: { id: ScenarioWizardStep; label: string }[] = [
  { id: "scenario", label: "1. Skenario" },
  { id: "profile", label: "2. Profil Pengirim" },
  { id: "email", label: "3. Email & Pengaturan" },
];

export function ScenarioWizardStepHeader({
  activeStep,
  statuses,
  onStepChange,
  labels,
}: Props) {
  const steps = defaultSteps.map((step) => ({
    ...step,
    label: labels?.[step.id] ?? step.label,
  }));
  return (
    <nav
      aria-label="Tahapan pengaturan skenario"
      className="border-b border-border pb-4"
    >
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map(({ id, label }) => {
          const active = activeStep === id;
          const status = statuses[id];
          return (
            <li key={id}>
              <Button
                type="button"
                variant="outline"
                aria-current={active ? "step" : undefined}
                aria-controls={`scenario-step-${id}`}
                aria-label={`${label}, ${status}`}
                onClick={() => onStepChange(id)}
                className={cn(
                  "h-auto min-h-11 w-full flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left whitespace-normal",
                  active
                    ? "border-foreground/30 bg-muted/50"
                    : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  {status === "Selesai" && (
                    <Check aria-hidden="true" className="size-3.5" />
                  )}
                  {status}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
