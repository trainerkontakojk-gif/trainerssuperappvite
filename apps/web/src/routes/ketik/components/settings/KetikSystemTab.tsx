import type { KetikAppSettings } from "@trainers/types";
import { Check, Clock, Settings, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TEXT_SIMULATION_MODELS as TEXT_MODELS } from "../../../../lib/aiModels"; // Shared model registry

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
  const PRESET_DURATIONS = [5, 10, 15];

  return (
    <div className="space-y-10 pb-10">
      {/* Model Selection */}
      <section className="space-y-6">
        <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="flex items-start gap-6 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
              <span className="text-3xl">&#x1F916;</span>
            </div>
            <div>
              <h3 className="font-black text-foreground text-xl tracking-tighter">
                Pilih Model Simulasi
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
                Pilih model AI yang akan menggerakkan karakter pelanggan.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          {TEXT_MODELS.map((model) => {
            const isSelected = localSettings.selectedModel === model.id;
            return (
              <div
                key={model.id}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    selectedModel: model.id,
                  }))
                }
                className={`cursor-pointer p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between gap-6 group ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-2xl shadow-primary/5"
                    : "border-transparent bg-card border-border/50 hover:bg-foreground/5"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-foreground tracking-tight text-lg">
                      {model.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                        model.provider === "openrouter"
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {model.provider}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">
                    {model.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Duration Configuration */}
      <section className="space-y-6">
        <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="flex items-start gap-6 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
              <Clock className="w-7 h-7 text-orange-500" />
            </div>
            <div>
              <h3 className="font-black text-foreground text-xl tracking-tighter">
                Durasi Simulasi
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
                Tentukan batas waktu maksimal untuk setiap sesi simulasi.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {PRESET_DURATIONS.map((d) => {
            const isSelected =
              durationMode === "preset" &&
              localSettings.simulationDuration === d;
            return (
              <div
                key={d}
                onClick={() => handlePresetClick(d)}
                className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-2xl shadow-primary/5"
                    : "border-transparent bg-card border-border/50 hover:bg-foreground/5"
                }`}
              >
                <span
                  className={`text-3xl sm:text-4xl font-black tracking-tighter ${
                    isSelected ? "text-primary" : "text-foreground/20"
                  }`}
                >
                  {d}
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
          <div
            onClick={handleCustomClick}
            className={`cursor-pointer p-6 sm:p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 sm:gap-3 text-center relative group ${
              durationMode === "custom"
                ? "border-primary bg-primary/5 shadow-2xl shadow-primary/5"
                : "border-transparent bg-card border-border/50 hover:bg-foreground/5"
            }`}
          >
            <span
              className={`text-3xl sm:text-4xl font-black tracking-tighter ${
                durationMode === "custom" ? "text-primary" : "text-foreground/20"
              }`}
            >
              &#x2699;&#xFE0F;
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Kustom
            </span>
            {durationMode === "custom" && (
              <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 z-10">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        </div>
        <AnimatePresence>
          {durationMode === "custom" && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="overflow-hidden"
            >
              <div className="p-6 rounded-[2rem] border border-border/50 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <label className="block text-xs font-black text-foreground uppercase tracking-wider mb-1">
                    Masukkan Durasi Kustom
                  </label>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Tentukan durasi simulasi antara {MIN_DURATION} hingga {MAX_DURATION} menit.
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
                      onChange={handleDurationInputChange}
                      onBlur={handleDurationBlur}
                      className="w-full rounded-2xl border border-border/50 bg-foreground/5 p-3.5 pr-12 text-base font-black text-foreground focus:ring-2 focus:ring-primary outline-none transition-all text-right"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
                      Min
                    </span>
                  </div>
                  {durationValidationError && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] font-black text-red-500 uppercase tracking-wider mt-1"
                    >
                      {durationValidationError}
                    </motion.span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Response Pacing Mode */}
      <section className="space-y-6">
        <div className="bg-card p-8 rounded-[2rem] border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="flex items-start gap-6 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center shrink-0 border border-teal-500/20">
              <Zap className="w-7 h-7 text-teal-500" />
            </div>
            <div>
              <h3 className="font-black text-foreground text-xl tracking-tighter">
                Tempo Balasan Konsumen
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed font-medium">
                Pengaturan ini memengaruhi kecepatan balasan konsumen ditampilkan.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {(["realistic", "training_fast"] as const).map((mode) => (
            <div
              key={mode}
              onClick={() =>
                setLocalSettings((prev) => ({
                  ...prev,
                  responsePacingMode: mode,
                }))
              }
              className={`cursor-pointer p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative ${
                localSettings.responsePacingMode === mode
                  ? "border-primary bg-primary/5"
                  : "border-transparent bg-card border-border/50 hover:bg-foreground/5"
              }`}
            >
              <Zap
                className={`w-8 h-8 ${
                  localSettings.responsePacingMode === mode
                    ? "text-primary"
                    : "text-foreground/20"
                }`}
              />
              <span
                className={`text-lg font-black tracking-tight ${
                  localSettings.responsePacingMode === mode
                    ? "text-primary"
                    : "text-foreground"
                }`}
              >
                {mode === "realistic" ? "Realistis" : "Cepat Latihan"}
              </span>
              <span className="text-xs text-muted-foreground font-medium text-center">
                {mode === "realistic"
                  ? "Variasi tempo seperti manusia asli."
                  : "Balasan lebih cepat, cocok untuk latihan."}
              </span>
              {localSettings.responsePacingMode === mode && (
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
