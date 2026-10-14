import { useEffect, type ReactNode } from "react";
import type { KetikAppSettings } from "@trainers/types";
import { cn } from "cn";
import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../../../lib/aiModels"; // Shared model registry
import { SettingsRadioIndicator } from "../../../../components/settings/SettingsChoices";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";

export interface KetikSystemTabProps {
  localSettings: KetikAppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<KetikAppSettings>>;
  durationMode: "preset" | "custom";
  handlePresetClick: (d: number) => void;
  handleCustomClick: () => void;
  customInputValue: string;
  handleDurationInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDurationBlur: () => void;
  durationValidationError: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  MIN_DURATION?: number;
  MAX_DURATION?: number;
}

const PRESET_DURATIONS = [5, 10, 15];

const PACING_MODES = [
  {
    id: "realistic" as const,
    label: "Realistis",
    description: "Jeda mengetik bervariasi seperti orang sungguhan.",
  },
  {
    id: "training_fast" as const,
    label: "Cepat",
    description: "Konsumen membalas lebih cepat, cocok untuk latihan singkat.",
  },
];

/** Tombol pilihan `role="radio"` dengan lingkaran indikator di kanan. */
function RadioOption({
  selected,
  onSelect,
  className,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "h-auto min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal",
        selected
          ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
          : "border-border bg-card hover:bg-muted/40",
        className,
      )}
    >
      {children}
      <SettingsRadioIndicator isSelected={selected} />
    </Button>
  );
}

export function KetikSystemTab({
  localSettings,
  setLocalSettings,
  durationMode,
  handlePresetClick,
  handleCustomClick,
  customInputValue,
  handleDurationInputChange,
  handleDurationBlur,
  durationValidationError,
  inputRef,
  MIN_DURATION = 1,
  MAX_DURATION = 60,
}: KetikSystemTabProps) {
  useEffect(() => {
    if (durationMode !== "custom") return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [durationMode, inputRef]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
          Sesi &amp; AI
        </h3>
        <p className="text-[13px] leading-5 text-fg2">
          Atur lama sesi, tempo balasan konsumen, dan AI yang memerankan
          konsumen.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h4
            id="ketik-duration-label"
            className="text-[15px] font-semibold text-foreground"
          >
            Durasi sesi
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-fg2">
            Peserta tidak melihat durasi. Saat waktu habis, konsumen menutup
            chat dengan pesan penutup.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="ketik-duration-label"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {PRESET_DURATIONS.map((d) => (
            <RadioOption
              key={d}
              selected={
                durationMode === "preset" &&
                localSettings.simulationDuration === d
              }
              onSelect={() => handlePresetClick(d)}
            >
              <span className="text-sm font-medium text-foreground">
                {d} menit
              </span>
            </RadioOption>
          ))}
          <RadioOption
            selected={durationMode === "custom"}
            onSelect={handleCustomClick}
          >
            <span className="text-sm font-medium text-foreground">Kustom</span>
          </RadioOption>
        </div>
        {durationMode === "custom" && (
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="ketik-custom-duration"
              className="text-[13px] text-fg2"
            >
              Durasi kustom ({MIN_DURATION}–{MAX_DURATION} menit)
            </label>
            <div className="relative w-36">
              <Input
                id="ketik-custom-duration"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                placeholder="5"
                value={customInputValue}
                onChange={handleDurationInputChange}
                onBlur={handleDurationBlur}
                aria-invalid={Boolean(durationValidationError)}
                aria-describedby={
                  durationValidationError
                    ? "ketik-custom-duration-error"
                    : undefined
                }
                className="min-h-[44px] bg-background pr-14 text-right"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                menit
              </span>
            </div>
            {durationValidationError && (
              <span
                id="ketik-custom-duration-error"
                className="text-xs font-medium text-destructive"
              >
                {durationValidationError}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h4
          id="ketik-pacing-label"
          className="text-[15px] font-semibold text-foreground"
        >
          Tempo balasan konsumen
        </h4>
        <div
          role="radiogroup"
          aria-labelledby="ketik-pacing-label"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {PACING_MODES.map((mode) => (
            <RadioOption
              key={mode.id}
              selected={localSettings.responsePacingMode === mode.id}
              onSelect={() =>
                setLocalSettings((prev) => ({
                  ...prev,
                  responsePacingMode: mode.id,
                }))
              }
              className="py-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight text-foreground">
                  {mode.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed font-normal text-fg2">
                  {mode.description}
                </span>
              </span>
            </RadioOption>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h4 className="text-[15px] font-semibold text-foreground">
            Model AI
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-fg2">
            Model yang memerankan konsumen selama chat.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Model AI"
          className="grid grid-cols-1 gap-2.5"
        >
          {TEXT_MODELS.map((model) => (
            <RadioOption
              key={model.id}
              selected={localSettings.selectedModel === model.id}
              onSelect={() =>
                setLocalSettings((prev) => ({
                  ...prev,
                  selectedModel: model.id,
                }))
              }
              className="py-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                  {model.name}
                </span>
                {model.description && (
                  <span className="mt-1 block text-xs leading-relaxed font-normal text-fg2">
                    {model.description}
                  </span>
                )}
              </span>
            </RadioOption>
          ))}
        </div>
      </section>
    </div>
  );
}
