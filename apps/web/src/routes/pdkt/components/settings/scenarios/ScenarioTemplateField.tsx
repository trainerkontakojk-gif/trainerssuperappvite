import React from "react";
import {
  SettingsField,
  SettingsInput,
  SettingsTextarea,
} from "../SettingsPrimitives";
import { PdktScenario } from "@trainers/types";

interface ScenarioTemplateFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
  error?: string;
  children?: React.ReactNode; // For AIGenerator
}

export function ScenarioTemplateField({
  draft,
  onDraftChange,
  error,
  children,
}: ScenarioTemplateFieldProps) {
  const alwaysUseTemplate = draft.alwaysUseSampleEmail || false;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-md">
          <h4 className="text-sm font-medium text-foreground">
            Template Email
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Template hanya dipakai bila opsi di bawah aktif; jika tidak, email
            konsumen dibuat ulang oleh AI.
          </p>
        </div>
        {children}
      </div>

      <label
        htmlFor="scenario-template-toggle"
        className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground"
      >
        <input
          id="scenario-template-toggle"
          type="checkbox"
          checked={alwaysUseTemplate}
          onChange={(e) =>
            onDraftChange({ alwaysUseSampleEmail: e.target.checked })
          }
          className="size-4 shrink-0 rounded border-input accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        Selalu pakai template ini
      </label>

      <div className="flex flex-col gap-3">
        <SettingsField
          label="Subjek Template Email"
          id="scenario-template-subject"
          optional
        >
          <SettingsInput
            id="scenario-template-subject"
            type="text"
            placeholder="Subjek email template"
            value={draft.sampleEmailTemplate?.subject || ""}
            onChange={(e) =>
              onDraftChange({
                sampleEmailTemplate: {
                  subject: e.target.value,
                  body: draft.sampleEmailTemplate?.body || "",
                },
              })
            }
          />
        </SettingsField>

        <SettingsField
          label="Isi Template Email"
          id="scenario-template-body"
          optional
          error={error}
          helperText="Gunakan wording netral; nama konsumen disisipkan otomatis sesuai pengaturan sistem."
        >
          <SettingsTextarea
            id="scenario-template-body"
            rows={6}
            placeholder="Tulis isi email template di sini."
            value={draft.sampleEmailTemplate?.body || ""}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? "scenario-template-body-error" : undefined
            }
            onChange={(e) =>
              onDraftChange({
                sampleEmailTemplate: {
                  subject: draft.sampleEmailTemplate?.subject || "",
                  body: e.target.value,
                },
              })
            }
          />
        </SettingsField>
      </div>
    </div>
  );
}
