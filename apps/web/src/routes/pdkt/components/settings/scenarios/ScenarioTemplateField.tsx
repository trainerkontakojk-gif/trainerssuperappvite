import React from "react";
import { SettingsInput } from "../SettingsPrimitives";
import { PdktScenario } from "@trainers/types";

interface ScenarioTemplateFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
  children?: React.ReactNode; // For AIGenerator
}

export function ScenarioTemplateField({
  draft,
  onDraftChange,
  children,
}: ScenarioTemplateFieldProps) {
  return (
    <div className="col-span-2 space-y-3 pt-2">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {children}
        <label className="flex items-center gap-2 cursor-pointer group shrink-0">
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Selalu pakai template ini
          </span>
          <div className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={draft.alwaysUseSampleEmail || false}
              onChange={(e) =>
                onDraftChange({ alwaysUseSampleEmail: e.target.checked })
              }
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border/45 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </div>
        </label>
      </div>
      <div className="space-y-2.5">
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
        <textarea
          id="scenario-template-body"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none resize-none font-mono placeholder:text-muted-foreground/30 leading-relaxed font-normal"
          rows={6}
          placeholder="Tulis isi email template di sini. Gunakan wording netral; nama konsumen akan disisipkan otomatis sesuai pengaturan sistem."
          value={draft.sampleEmailTemplate?.body || ""}
          onChange={(e) =>
            onDraftChange({
              sampleEmailTemplate: {
                subject: draft.sampleEmailTemplate?.subject || "",
                body: e.target.value,
              },
            })
          }
        />
        <p className="text-xs text-muted-foreground/80 leading-normal">
          * Jika opsi ini aktif, AI tidak akan meng-generate email baru dan akan memakai teks di atas hanya saat diperlukan.
        </p>
      </div>
    </div>
  );
}
