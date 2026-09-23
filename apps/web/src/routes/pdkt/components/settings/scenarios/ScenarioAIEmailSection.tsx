import React from "react";
import { ScenarioAIGenerator } from "./ScenarioAIGenerator";
import type { PdktScenario } from "@trainers/types";

interface Props {
  draft: Partial<PdktScenario>;
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
}

export function ScenarioAIEmailSection({
  draft,
  onGenerate,
  isGenerating,
  canGenerate,
}: Props) {
  const hasGenerated = Boolean(draft.sampleEmailTemplate?.body?.trim());

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="scenario-ai-email-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h5
            id="scenario-ai-email-title"
            className="text-sm font-medium text-foreground"
          >
            Dibuat oleh AI
          </h5>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Tinjau hasilnya di bawah atau buat ulang setelah mengubah
            deskripsi skenario.
          </p>
        </div>
        <ScenarioAIGenerator
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          canGenerate={canGenerate}
          hasGenerated={hasGenerated}
        />
      </div>

      <div
        className="rounded-lg border border-border bg-muted/20 p-4"
        aria-live="polite"
      >
        {hasGenerated ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-foreground">
              Contoh email siap ditinjau
            </p>
            {draft.sampleEmailTemplate?.subject?.trim() && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Subjek
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                  {draft.sampleEmailTemplate.subject}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Isi</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {draft.sampleEmailTemplate?.body}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-foreground">
              Belum ada contoh email
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Gunakan tombol di atas untuk membuat pratinjau dari deskripsi
              skenario.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
