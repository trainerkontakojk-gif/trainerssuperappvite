import React from "react";
import { Button } from "../../../../../components/ui/button";

export type ScenarioCreationMode = "ai" | "manual";

interface Props {
  onSelect: (mode: ScenarioCreationMode) => void;
  onCancel: () => void;
}

const modeOptions: Array<{
  mode: ScenarioCreationMode;
  title: string;
  description: string;
}> = [
  {
    mode: "ai",
    title: "Skenario AI",
    description: "Jelaskan situasinya. Email simulasi akan dibuat oleh AI.",
  },
  {
    mode: "manual",
    title: "Email buatan sendiri",
    description: "Tulis email sendiri tanpa meminta AI membuat email.",
  },
];

export function ScenarioCreationModePicker({ onSelect, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          Pilih cara menyiapkan skenario
        </h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pilih satu mode untuk melanjutkan dengan field yang sesuai.
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        role="group"
        aria-label="Mode pembuatan skenario"
      >
        {modeOptions.map(({ mode, title, description }) => (
          <Button
            key={mode}
            type="button"
            variant="outline"
            onClick={() => onSelect(mode)}
            className="h-auto min-h-36 items-start justify-start rounded-xl p-5 text-left whitespace-normal hover:border-foreground/30 hover:bg-muted/30"
          >
            <span className="flex flex-col items-start gap-2">
              <span className="text-sm font-semibold text-foreground">
                {title}
              </span>
              <span className="text-sm font-normal leading-relaxed text-muted-foreground">
                {description}
              </span>
              <span className="mt-1 text-xs font-medium text-foreground">
                Pilih mode ini
              </span>
            </span>
          </Button>
        ))}
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
      </div>
    </div>
  );
}
