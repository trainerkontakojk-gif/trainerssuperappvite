import React, { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
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
    // Reveal input and focus
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    // If current customInputValue is empty or invalid, validate to trigger inline error if appropriate
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        {presets.map((duration) => {
          const isSelected = mode === 'preset' && value === duration;
          return (
            <div
              key={duration}
              onClick={() => handlePresetClick(duration)}
              className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/5'
                  : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'
              }`}
            >
              <span
                className={`text-3xl sm:text-4xl font-black tracking-tighter ${
                  isSelected ? 'text-primary' : 'text-foreground/20'
                }`}
              >
                {duration}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Menit
              </span>
              {isSelected && (
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 z-10">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Card */}
        <div
          onClick={handleCustomClick}
          className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${
            mode === 'custom'
              ? 'border-primary bg-primary/5 shadow-2xl shadow-primary/5'
              : 'border-transparent bg-card border-border/50 hover:bg-foreground/5'
          }`}
        >
          <span
            className={`text-3xl sm:text-4xl font-black tracking-tighter ${
              mode === 'custom' ? 'text-primary' : 'text-foreground/20'
            }`}
          >
            ⚙️
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Kustom
          </span>
          {mode === 'custom' && (
            <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 z-10">
              <Check className="w-4 h-4 text-white" />
            </div>
          )}
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
            <div className="p-6 rounded-[2rem] border border-border/50 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div>
                <label className="block text-xs font-black text-foreground uppercase tracking-wider mb-1">
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
                    className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-3.5 pr-12 text-base font-black text-foreground focus:ring-2 focus:ring-primary outline-none transition-all text-right"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
                    Min
                  </span>
                </div>
                {validationError && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-black text-red-500 uppercase tracking-wider mt-1"
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
