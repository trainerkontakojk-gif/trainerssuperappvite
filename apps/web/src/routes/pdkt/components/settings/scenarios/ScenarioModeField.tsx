import { useRef } from "react";
import { cn } from "cn";
import type { ScenarioCreationMode } from "./ScenarioCreationValidation";

const MODES: { id: ScenarioCreationMode; label: string; hint: string }[] = [
  {
    id: "ai",
    label: "Dibuat AI tiap sesi",
    hint: "AI menulis email baru dari ringkasan masalah setiap kali sesi dimulai, mengikuti Arah balasan di bawah.",
  },
  {
    id: "manual",
    label: "Ditulis sendiri (email tetap)",
    hint: "Semua peserta menerima email yang sama persis. Cocok untuk ujian.",
  },
];

interface Props {
  value: ScenarioCreationMode;
  onChange: (mode: ScenarioCreationMode) => void;
}

/** Pilihan cara email konsumen dibuat, berbentuk segmen dengan navigasi panah. */
export function ScenarioModeField({ value, onChange }: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const active = MODES.find((mode) => mode.id === value) ?? MODES[0];

  const select = (index: number) => {
    const next = MODES[(index + MODES.length) % MODES.length];
    onChange(next.id);
    buttons.current[MODES.indexOf(next)]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        id="scenario-mode-label"
        className="text-[12px] font-medium text-muted-foreground"
      >
        Isi email dibuat oleh
      </span>
      <div
        role="radiogroup"
        aria-labelledby="scenario-mode-label"
        aria-describedby="scenario-mode-hint"
        className="flex max-w-full flex-wrap gap-0.5 self-start rounded-lg bg-muted p-[3px]"
      >
        {MODES.map((mode, index) => {
          const checked = mode.id === active.id;
          return (
            <button
              key={mode.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(mode.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  select(index + 1);
                } else if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  select(index - 1);
                }
              }}
              className={cn(
                "min-h-[44px] rounded-md px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                checked
                  ? "bg-background text-foreground shadow-sm"
                  : "text-fg2 hover:text-foreground",
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      <p
        id="scenario-mode-hint"
        className="text-xs leading-[18px] text-muted-foreground"
      >
        {active.hint}
      </p>
    </div>
  );
}
