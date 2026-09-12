import { useEffect } from "react";
import type { KetikAppSettings } from "@trainers/types";
import { KETIK_PDKT_MODELS as TEXT_MODELS } from "../../../../lib/aiModels"; // Shared model registry
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";

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
    <div className="mt-2 flex flex-col gap-8 pb-10">
      {/* Model Selection */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">
            Pilih Model AI
          </h3>
          <p className="text-xs text-muted-foreground">
            Pilih model AI yang akan menggerakkan karakter pelanggan.
          </p>
        </div>
        <div className="grid gap-3" role="group" aria-label="Model AI">
          {TEXT_MODELS.map((model) => {
            const isSelected = localSettings.selectedModel === model.id;
            return (
              <Button
                key={model.id}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                aria-pressed={isSelected}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    selectedModel: model.id,
                  }))
                }
                className={`h-auto min-h-20 w-full justify-between gap-4 whitespace-normal rounded-xl p-4 text-left ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                    : "border-border bg-card/45 text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {model.name}
                    </h4>
                    <Badge variant="outline" className="text-[11px]">
                      {model.provider === "gemini" ? "Gemini" : "OpenAI"}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {model.description}
                  </p>
                </div>
                <div
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-primary" : "border-border"}`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <div className="size-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </section>

      {/* Duration Configuration */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            Durasi Simulasi
          </h3>
          <p className="text-xs text-muted-foreground">
            Tentukan batas waktu maksimal untuk setiap sesi simulasi.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRESET_DURATIONS.map((d) => {
            const isSelected =
              durationMode === "preset" &&
              localSettings.simulationDuration === d;
            return (
              <Button
                key={d}
                type="button"
                size="lg"
                variant={isSelected ? "secondary" : "outline"}
                onClick={() => handlePresetClick(d)}
                className={`min-h-11 ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                    : "border-border bg-card/45 text-foreground hover:bg-muted/40"
                }`}
              >
                {d} Menit
              </Button>
            );
          })}
          <Button
            type="button"
            size="lg"
            variant={durationMode === "custom" ? "secondary" : "outline"}
            onClick={handleCustomClick}
            className={`min-h-11 ${
              durationMode === "custom"
                ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                : "border-border bg-card/45 text-foreground hover:bg-muted/40"
            }`}
          >
            Kustom
          </Button>
        </div>
        {durationMode === "custom" && (
          <Card>
            <CardContent className="flex flex-col justify-between gap-4 bg-card/20 p-4 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-foreground">
                  Masukkan Durasi Kustom
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Tentukan durasi simulasi antara {MIN_DURATION} hingga{" "}
                  {MAX_DURATION} menit.
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
                    onChange={handleDurationInputChange}
                    onBlur={handleDurationBlur}
                    className="bg-background pr-12 text-right"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                    Menit
                  </span>
                </div>
                {durationValidationError && (
                  <span className="mt-0.5 text-[11px] font-medium text-destructive">
                    {durationValidationError}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Response Pacing Mode */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            Tempo Balasan Konsumen
          </h3>
          <p className="text-xs text-muted-foreground">
            Pengaturan ini memengaruhi kecepatan balasan konsumen ditampilkan.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["realistic", "training_fast"] as const).map((mode) => {
            const isSelected = localSettings.responsePacingMode === mode;
            return (
              <Button
                key={mode}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                aria-pressed={isSelected}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    responsePacingMode: mode,
                  }))
                }
                className={`h-auto min-h-24 w-full items-start justify-between gap-4 whitespace-normal rounded-xl p-4 text-left ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                    : "border-border bg-card/45 text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}
                  >
                    {mode === "realistic" ? "Realistis" : "Cepat Latihan"}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {mode === "realistic"
                      ? "Variasi tempo seperti manusia asli."
                      : "Balasan lebih cepat, cocok untuk latihan."}
                  </span>
                </div>
                <div
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-primary" : "border-border"}`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <div className="size-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
