import React from "react";
import { SettingsField, SettingsInput } from "../SettingsPrimitives";
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
  return (
    <div className="col-span-2 space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {children}
        <label className="flex items-center gap-2 cursor-pointer group shrink-0">
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Selalu pakai template ini
          </span>
          <div className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="scenario-template-toggle"
              className="sr-only peer"
              checked={draft.alwaysUseSampleEmail || false}
              onChange={(e) =>
                onDraftChange({ alwaysUseSampleEmail: e.target.checked })
              }
            />
            <div className="h-5 w-9 rounded-full bg-border transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border/45 after:bg-card after:content-[''] after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground"></div>
          </div>
        </label>
      </div>
      <div className="space-y-2.5">
        <SettingsField
          label="Subjek Template Email"
          id="scenario-template-subject"
          optional
        >
          <SettingsInput
            id="scenario-template-subject"
            type="text"
            placeholder="Subjek email template (opsional)..."
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
        >
          <textarea
            id="scenario-template-body"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none font-mono placeholder:text-muted-foreground/30 leading-relaxed font-normal"
            rows={6}
            placeholder="Tulis isi email template di sini. Gunakan wording netral; nama konsumen akan disisipkan otomatis sesuai pengaturan sistem."
            value={draft.sampleEmailTemplate?.body || ""}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "scenario-template-body-error" : undefined}
            onChange={(e) =>
              onDraftChange({
                sampleEmailTemplate: {
                  subject: draft.sampleEmailTemplate?.subject || "",
                  body: e.target.value,
                },
              })
            }
          />
          {error && (
            <p
              id="scenario-template-body-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </SettingsField>
        <p className="text-xs text-muted-foreground/80 leading-normal">
          * Jika opsi ini aktif, AI tidak akan meng-generate email baru dan akan
          memakai teks di atas hanya saat diperlukan.
        </p>
      </div>
    </div>
  );
}
