import React from "react";
import type { PdktScenario } from "@trainers/types";
import {
  SettingsField,
  SettingsInput,
  SettingsTextarea,
} from "@/components/settings/SettingsPrimitives";

interface ScenarioTemplateFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
  error?: string;
}

export function ScenarioTemplateField({
  draft,
  onDraftChange,
  error,
}: ScenarioTemplateFieldProps) {
  const subjectId = "scenario-template-subject";
  const bodyId = "scenario-template-body";
  const bodyErrorId = `${bodyId}-error`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 max-w-md">
        <h4 className="text-sm font-medium text-foreground">
          Ditulis oleh Anda
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Email ini menjadi sumber utama isi simulasi.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SettingsField
          label="Subjek email buatan sendiri"
          id={subjectId}
          optional
        >
          <SettingsInput
            id={subjectId}
            type="text"
            placeholder="Subjek email"
            value={draft.sampleEmailTemplate?.subject || ""}
            onChange={(event) =>
              onDraftChange({
                sampleEmailTemplate: {
                  subject: event.target.value,
                  body: draft.sampleEmailTemplate?.body || "",
                },
              })
            }
          />
        </SettingsField>

        <SettingsField
          label="Isi email buatan sendiri"
          id={bodyId}
          required
          error={error}
          helperText="Tulis email lengkap yang ingin dipakai dalam simulasi."
        >
          <SettingsTextarea
            id={bodyId}
            rows={6}
            placeholder="Tulis email buatan sendiri di sini."
            value={draft.sampleEmailTemplate?.body || ""}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? bodyErrorId : undefined}
            onChange={(event) =>
              onDraftChange({
                sampleEmailTemplate: {
                  subject: draft.sampleEmailTemplate?.subject || "",
                  body: event.target.value,
                },
              })
            }
          />
        </SettingsField>
      </div>
    </div>
  );
}
