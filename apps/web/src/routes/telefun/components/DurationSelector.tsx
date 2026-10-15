import React, { useEffect, useRef, useState } from "react";
import { SettingsRadioOption } from "../../../components/settings/SettingsChoices";
import { Input } from "../../../components/ui/input";
import {
  classifyDurationMode,
  filterDurationInput,
  MAX_DURATION,
  MIN_DURATION,
  normalizeDurationDisplay,
  validateDuration,
  PRESET_DURATIONS,
} from "./duration-validation";

export interface DurationSelectorProps {
  value: number;
  onChange: (value: number) => void;
  /** `id` judul yang menamai grup radio. */
  labelledBy: string;
  presets?: readonly number[];
}

/** Durasi panggilan sebagai grup radio: pilihan cepat atau Kustom 1–60 menit. */
export const DurationSelector: React.FC<DurationSelectorProps> = ({
  value,
  onChange,
  labelledBy,
  presets = PRESET_DURATIONS,
}) => {
  const initialClass = classifyDurationMode(value);
  const [mode, setMode] = useState<"preset" | "custom">(initialClass.mode);
  const [customInputValue, setCustomInputValue] = useState<string>(
    initialClass.mode === "custom" ? initialClass.value.toString() : "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Nilai yang baru dikirim dari sini (mis. "10" diketik di Kustom) tidak
  // mengubah mode; nilai dari luar (Pulihkan bawaan) menentukan mode lagi.
  const emittedRef = useRef<number | null>(null);

  useEffect(() => {
    if (emittedRef.current === value) return;
    const cls = classifyDurationMode(value);
    setMode(cls.mode);
    setCustomInputValue(cls.mode === "custom" ? cls.value.toString() : "");
    setValidationError(null);
  }, [value]);

  const emit = (next: number) => {
    emittedRef.current = next;
    onChange(next);
  };

  useEffect(() => {
    if (mode !== "custom") return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [mode]);

  const handlePresetClick = (presetValue: number) => {
    setMode("preset");
    setCustomInputValue("");
    setValidationError(null);
    emit(presetValue);
  };

  const handleCustomClick = () => {
    setMode("custom");
    const validated = validateDuration(customInputValue);
    if (!validated.valid) setValidationError(validated.error);
  };

  const applyInput = (input: string) => {
    setCustomInputValue(input);
    const validated = validateDuration(input);
    if (validated.valid) {
      setValidationError(null);
      emit(validated.value);
    } else {
      setValidationError(validated.error);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {presets.map((duration) => (
          <SettingsRadioOption
            key={duration}
            selected={mode === "preset" && value === duration}
            onSelect={() => handlePresetClick(duration)}
          >
            <span className="text-sm font-medium text-foreground">
              {duration} menit
            </span>
          </SettingsRadioOption>
        ))}
        <SettingsRadioOption
          selected={mode === "custom"}
          onSelect={handleCustomClick}
        >
          <span className="text-sm font-medium text-foreground">Kustom</span>
        </SettingsRadioOption>
      </div>
      {mode === "custom" && (
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="telefun-custom-duration"
            className="text-[13px] text-fg2"
          >
            Durasi kustom ({MIN_DURATION}–{MAX_DURATION} menit)
          </label>
          <div className="relative w-36">
            <Input
              id="telefun-custom-duration"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder="5"
              value={customInputValue}
              onChange={(event) =>
                applyInput(filterDurationInput(event.target.value))
              }
              onBlur={() =>
                applyInput(normalizeDurationDisplay(customInputValue))
              }
              aria-invalid={Boolean(validationError)}
              aria-describedby={
                validationError ? "telefun-custom-duration-error" : undefined
              }
              className="min-h-[44px] bg-background pr-14 text-right"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
              menit
            </span>
          </div>
          {validationError && (
            <span
              id="telefun-custom-duration-error"
              className="text-xs font-medium text-destructive"
            >
              {validationError}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
