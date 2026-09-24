import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  classifyDurationMode,
  filterDurationInput,
  normalizeDurationDisplay,
  validateDuration,
  PRESET_DURATIONS,
} from "./duration-validation";

export interface DurationSelectorProps {
  value: number;
  onChange: (value: number) => void;
  presets?: readonly number[];
}

export const DurationSelector: React.FC<DurationSelectorProps> = ({
  value,
  onChange,
  presets = PRESET_DURATIONS,
}) => {
  const initialClass = classifyDurationMode(value);
  const [mode, setMode] = useState<"preset" | "custom">(initialClass.mode);
  const [customInputValue, setCustomInputValue] = useState<string>(
    initialClass.mode === "custom" ? initialClass.value.toString() : "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cls = classifyDurationMode(value);
    setMode(cls.mode);
    if (cls.mode === "custom") {
      setCustomInputValue(cls.value.toString());
      setValidationError(null);
    } else {
      setCustomInputValue("");
      setValidationError(null);
    }
  }, [value]);

  const handlePresetClick = (presetValue: number) => {
    setMode("preset");
    setCustomInputValue("");
    setValidationError(null);
    onChange(presetValue);
  };

  const handleCustomClick = () => {
    setMode("custom");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    const validated = validateDuration(customInputValue);
    if (!validated.valid) {
      setValidationError(validated.error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterDurationInput(e.target.value);
    setCustomInputValue(filtered);

    const validated = validateDuration(filtered);
    if (validated.valid) {
      setValidationError(null);
      onChange(validated.value);
    } else {
      setValidationError(validated.error);
    }
  };

  const handleBlur = () => {
    const normalized = normalizeDurationDisplay(customInputValue);
    setCustomInputValue(normalized);
    const validated = validateDuration(normalized);
    if (validated.valid) {
      setValidationError(null);
      onChange(validated.value);
    } else {
      setValidationError(validated.error);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {presets.map((duration) => {
          const isSelected = mode === "preset" && value === duration;
          return (
            <Button
              key={duration}
              type="button"
              variant="outline"
              aria-pressed={isSelected}
              onClick={() => handlePresetClick(duration)}
              className={`h-auto min-h-11 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal ${
                isSelected
                  ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <span className="text-sm font-medium text-foreground">
                {duration} Menit
              </span>
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  isSelected ? "border-primary" : "border-border"
                }`}
              >
                {isSelected && (
                  <span className="size-2.5 rounded-full bg-primary" />
                )}
              </span>
            </Button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          aria-pressed={mode === "custom"}
          onClick={handleCustomClick}
          className={`h-auto min-h-11 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal ${
            mode === "custom"
              ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="text-sm font-medium text-foreground">Kustom</span>
          <span
            aria-hidden="true"
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
              mode === "custom" ? "border-primary" : "border-border"
            }`}
          >
            {mode === "custom" && (
              <span className="size-2.5 rounded-full bg-primary" />
            )}
          </span>
        </Button>
      </div>

      <AnimatePresence>
        {mode === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  Masukkan Durasi Kustom
                </label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tentukan durasi simulasi antara 1 hingga 60 menit.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="relative w-36">
                  <Input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="5"
                    value={customInputValue}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    className="bg-background pr-12 text-right font-medium"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    Min
                  </span>
                </div>
                {validationError && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs font-medium text-destructive"
                  >
                    {validationError}
                  </motion.span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
