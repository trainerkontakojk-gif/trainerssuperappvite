import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  classifyDurationMode,
  filterDurationInput,
  normalizeDurationDisplay,
  validateDuration,
  PRESET_DURATIONS,
} from './duration-validation';

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
  const [mode, setMode] = useState<'preset' | 'custom'>(initialClass.mode);
  const [customInputValue, setCustomInputValue] = useState<string>(
    initialClass.mode === 'custom' ? initialClass.value.toString() : ''
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cls = classifyDurationMode(value);
    setMode(cls.mode);
    if (cls.mode === 'custom') {
      setCustomInputValue(cls.value.toString());
      setValidationError(null);
    } else {
      setCustomInputValue('');
      setValidationError(null);
    }
  }, [value]);

  const handlePresetClick = (presetValue: number) => {
    setMode('preset');
    setCustomInputValue('');
    setValidationError(null);
    onChange(presetValue);
  };

  const handleCustomClick = () => {
    setMode('custom');
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
    <div className="space-y-4 w-full">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {presets.map((duration) => {
          const isSelected = mode === 'preset' && value === duration;
          return (
            <div
              key={duration}
              onClick={() => handlePresetClick(duration)}
              className={`cursor-pointer p-5 rounded-xl border transition-colors flex flex-col justify-between h-28 relative group ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card/45 hover:bg-foreground/[0.02]'
              }`}
            >
              <div className="flex justify-between items-start w-full">
                <span
                  className={`text-3xl font-bold tracking-tight ${
                    isSelected ? 'text-primary' : 'text-foreground/30'
                  }`}
                >
                  {duration}
                </span>
                <div className="flex items-center shrink-0">
                  {isSelected ? (
                    <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Menit
              </span>
            </div>
          );
        })}

        {/* Custom Card */}
        <div
          onClick={handleCustomClick}
          className={`cursor-pointer p-5 rounded-xl border transition-colors flex flex-col justify-between h-28 relative group ${
            mode === 'custom'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card/45 hover:bg-foreground/[0.02]'
          }`}
        >
          <div className="flex justify-between items-start w-full">
            <span
              className={`text-3xl font-bold ${
                mode === 'custom' ? 'text-primary' : 'text-foreground/30'
              }`}
            >
              ⚙️
            </span>
            <div className="flex items-center shrink-0">
              {mode === 'custom' ? (
                <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
              )}
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Kustom
          </span>
        </div>
      </div>

      {/* Revealed Custom Input Area */}
      <AnimatePresence>
        {mode === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="overflow-hidden pt-2"
          >
            <div className="p-5 rounded-xl border border-border bg-muted/15 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1">
                  Masukkan Durasi Kustom
                </label>
                <p className="text-[11px] text-muted-foreground font-medium">
                  Tentukan durasi simulasi antara 1 hingga 60 menit.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="relative w-36">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="5"
                    value={customInputValue}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors text-right font-medium pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wider text-muted-foreground pointer-events-none">
                    Min
                  </span>
                </div>
                {validationError && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mt-1"
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
