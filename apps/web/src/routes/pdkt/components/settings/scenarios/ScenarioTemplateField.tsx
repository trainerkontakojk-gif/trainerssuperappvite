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
      <div className="flex items-center justify-between ml-1">
        {children}
        <label className="flex items-center gap-2 cursor-pointer group">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-primary transition-colors">
            Always use this email
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
            <div className="w-7 h-4 bg-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
          </div>
        </label>
      </div>
      <div className="space-y-2">
        <SettingsInput
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
          className="w-full rounded-lg border border-border bg-background p-3 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none font-mono placeholder:text-muted-foreground/30"
          rows={8}
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
        <p className="text-[10px] text-muted-foreground/80 italic ml-1">
          * Jika &quot;Always use this email&quot; aktif, AI tidak akan meng-generate email baru melainkan langsung memakai teks di atas.
        </p>
      </div>
    </div>
  );
}
