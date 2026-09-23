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
  mode?: "ai" | "manual";
  idPrefix?: string;
}

export function ScenarioTemplateField({
  draft,
  onDraftChange,
  error,
  children,
  mode = "ai",
  idPrefix = "scenario-template",
}: ScenarioTemplateFieldProps) {
  const alwaysUseTemplate = draft.alwaysUseSampleEmail || false;
  const manual = mode === "manual";
  const toggleId = `${idPrefix}-toggle`;
  const subjectId = `${idPrefix}-subject`;
  const bodyId = `${idPrefix}-body`;
  const bodyErrorId = `${bodyId}-error`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-md">
          <h4 className="text-sm font-medium text-foreground">
            {manual ? "Ditulis oleh Anda" : "Template Email"}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {manual
              ? "Email ini menjadi sumber utama isi simulasi dan dapat Anda ubah langsung."
              : "Template hanya dipakai bila opsi di bawah aktif; jika tidak, email konsumen dibuat ulang oleh AI."}
          </p>
        </div>
        {children}
      </div>

      {!manual && (
        <label
          htmlFor={toggleId}
          className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground"
        >
          <input
            id={toggleId}
            type="checkbox"
            checked={alwaysUseTemplate}
            onChange={(e) =>
              onDraftChange({ alwaysUseSampleEmail: e.target.checked })
            }
            className="size-4 shrink-0 rounded border-input accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          Selalu pakai template ini
        </label>
      )}

      <div className="flex flex-col gap-3">
        <SettingsField
          label={
            manual ? "Subjek email buatan sendiri" : "Subjek Template Email"
          }
          id={subjectId}
          optional
        >
          <SettingsInput
            id={subjectId}
            type="text"
            placeholder={manual ? "Subjek email" : "Subjek email template"}
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
          label={manual ? "Isi email buatan sendiri" : "Isi Template Email"}
          id={bodyId}
          required={manual}
          optional={!manual}
          error={error}
          helperText={
            manual
              ? "Tulis email lengkap yang ingin dipakai dalam simulasi."
              : "Gunakan wording netral; nama konsumen disisipkan otomatis sesuai pengaturan sistem."
          }
        >
          <SettingsTextarea
            id={bodyId}
            rows={6}
            placeholder={
              manual
                ? "Tulis email buatan sendiri di sini."
                : "Tulis isi email template di sini."
            }
            value={draft.sampleEmailTemplate?.body || ""}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? bodyErrorId : undefined}
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
