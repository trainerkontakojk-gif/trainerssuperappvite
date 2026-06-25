import { useEffect } from "react";
import type { KetikAppSettings } from "@trainers/types";
import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../../../lib/aiModels"; // Shared model registry

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

  useEffect(() => {
    if (durationMode !== "custom") return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [durationMode, inputRef]);

  return (
    <div className="space-y-8 pb-10 mt-2">
      {/* Model Selection */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h3 className="font-bold text-foreground text-base tracking-tight">
            Pilih Model AI
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pilih model AI yang akan menggerakkan karakter pelanggan.
          </p>
        </div>
        <div className="grid gap-3">
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
                className={`cursor-pointer p-4 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/45 hover:bg-foreground/[0.02]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-semibold text-foreground text-sm truncate">
                      {model.name}
                    </h4>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-medium ${
                        model.provider === "openrouter"
                          ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                          : model.provider === "deepseek"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                      }`}
                    >
                      {model.provider}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {model.description}
                  </p>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? "border-primary" : "border-border"}`}>
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Duration Configuration */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h3 className="font-bold text-foreground text-base tracking-tight">
            Durasi Simulasi
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tentukan batas waktu maksimal untuk setiap sesi simulasi.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {PRESET_DURATIONS.map((d) => {
            const isSelected =
              durationMode === "preset" &&
              localSettings.simulationDuration === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => handlePresetClick(d)}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card/45 hover:bg-foreground/[0.02] text-foreground"
                }`}
              >
                {d} Menit
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleCustomClick}
            className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
              durationMode === "custom"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card/45 hover:bg-foreground/[0.02] text-foreground"
            }`}
          >
            Kustom
          </button>
        </div>
        {durationMode === "custom" && (
          <div className="p-4 rounded-xl border border-border bg-card/20 flex flex-col sm:flex-row sm:items-center gap-4 justify-between mt-2">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-0.5">
                Masukkan Durasi Kustom
              </label>
              <p className="text-[11px] text-muted-foreground">
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
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pr-12 text-sm text-foreground focus:border-foreground outline-none transition-colors text-right"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground pointer-events-none">
                  Menit
                </span>
              </div>
              {durationValidationError && (
                <span className="text-[11px] font-medium text-destructive mt-0.5">
                  {durationValidationError}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Response Pacing Mode */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h3 className="font-bold text-foreground text-base tracking-tight">
            Tempo Balasan Konsumen
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pengaturan ini memengaruhi kecepatan balasan konsumen ditampilkan.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["realistic", "training_fast"] as const).map((mode) => {
            const isSelected = localSettings.responsePacingMode === mode;
            return (
              <div
                key={mode}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    responsePacingMode: mode,
                  }))
                }
                className={`cursor-pointer p-4 rounded-xl border transition-colors flex items-start justify-between gap-4 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/45 hover:bg-foreground/[0.02]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold block ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {mode === "realistic" ? "Realistis" : "Cepat Latihan"}
                  </span>
                  <span className="text-xs text-muted-foreground block mt-1 leading-relaxed">
                    {mode === "realistic"
                      ? "Variasi tempo seperti manusia asli."
                      : "Balasan lebih cepat, cocok untuk latihan."}
                  </span>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? "border-primary" : "border-border"}`}>
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
