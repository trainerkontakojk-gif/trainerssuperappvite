import React from "react";

export type ScenarioWizardStep = "basic" | "advanced";

interface ScenarioWizardStepHeaderProps {
  activeStep: ScenarioWizardStep;
  onStepChange: (step: ScenarioWizardStep) => void;
}

export function ScenarioWizardStepHeader({
  activeStep,
  onStepChange,
}: ScenarioWizardStepHeaderProps) {
  const steps = [
    {
      id: "basic" as const,
      label: "Langkah 1",
      title: "Info Dasar",
      description: "Wajib diisi untuk menyimpan skenario.",
    },
    {
      id: "advanced" as const,
      label: "Langkah 2",
      title: "Detail Lanjutan (Opsional)",
      description: "Dipakai hanya jika email atau lampiran memang diperlukan.",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-foreground tracking-tight">
            Wizard Skenario
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Bagi pengisian menjadi dua langkah agar lebih mudah dipindai.
          </p>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          Langkah aktif: {activeStep === "basic" ? "1" : "2"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(step.id)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors cursor-pointer ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-foreground/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                {step.id === "advanced" && (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Opsional
                  </span>
                )}
              </div>
              <div className="mt-1">
                <div className="text-sm font-semibold text-foreground tracking-tight">
                  {step.title}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
