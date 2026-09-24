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
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Pilih Model AI
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pilih model AI yang akan menggerakkan karakter pelanggan.
          </p>
        </div>
        <div className="grid gap-2.5" role="group" aria-label="Model AI">
          {TEXT_MODELS.map((model) => {
            const isSelected = localSettings.selectedModel === model.id;
            return (
              <Button
                key={model.id}
                type="button"
                variant="outline"
                aria-pressed={isSelected}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    selectedModel: model.id,
                  }))
                }
                className={`h-auto min-h-16 w-full justify-between gap-3 whitespace-normal rounded-xl p-4 text-left ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {model.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {model.provider === "gemini" ? "Gemini" : "OpenAI"}
                    </Badge>
                  </span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {model.description}
                  </span>
                </span>
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? "border-primary" : "border-border"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="size-2.5 rounded-full bg-primary" />
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Durasi Simulasi
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
                variant="outline"
                aria-pressed={isSelected}
                onClick={() => handlePresetClick(d)}
                className={`h-auto min-h-11 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="text-sm font-medium text-foreground">
                  {d} Menit
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
            aria-pressed={durationMode === "custom"}
            onClick={handleCustomClick}
            className={`h-auto min-h-11 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left ${
              durationMode === "custom"
                ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <span className="text-sm font-medium text-foreground">Kustom</span>
            <span
              aria-hidden="true"
              className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                durationMode === "custom" ? "border-primary" : "border-border"
              }`}
            >
              {durationMode === "custom" && (
                <span className="size-2.5 rounded-full bg-primary" />
              )}
            </span>
          </Button>
        </div>
        {durationMode === "custom" && (
          <Card className="border border-border bg-card py-0 ring-0">
            <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-foreground">
                  Masukkan Durasi Kustom
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
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
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    Menit
                  </span>
                </div>
                {durationValidationError && (
                  <span className="mt-0.5 text-xs font-medium text-destructive">
                    {durationValidationError}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Tempo Balasan Konsumen
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
                variant="outline"
                aria-pressed={isSelected}
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    responsePacingMode: mode,
                  }))
                }
                className={`h-auto min-h-24 w-full items-center justify-between gap-3 whitespace-normal rounded-xl p-4 text-left ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-tight text-foreground">
                    {mode === "realistic" ? "Realistis" : "Cepat Latihan"}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {mode === "realistic"
                      ? "Variasi tempo seperti manusia asli."
                      : "Balasan lebih cepat, cocok untuk latihan."}
                  </span>
                </span>
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? "border-primary" : "border-border"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="size-2.5 rounded-full bg-primary" />
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
