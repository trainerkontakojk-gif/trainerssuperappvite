import React from "react";
import { AlertCircle, Check } from "lucide-react";
import { TELEFUN_LIVE_MODELS } from "@trainers/types";
import { DurationSelector } from "../DurationSelector";
import { TelefunAppSettings as AppSettings } from "../../telefunSettings";
import { SIMULATION_CHALLENGES } from "../../services/simulationChallenges";
import type { TelefunProviderReadinessState } from "../../hooks/useTelefunProviderReadiness";
import type { TelefunWebRtcCapability } from "../../services/telefunWebRtcCapability";

interface TelefunSystemTabProps {
  localSettings: AppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  selectedTelefunModel: string;
  setSelectedTelefunModel: (modelId: string) => void;
  selectedTelefunTransport?: AppSettings["telefunTransport"];
  setSelectedTelefunTransport?: (
    transport: AppSettings["telefunTransport"],
  ) => void;
  providerReadiness: TelefunProviderReadinessState;
  webRtcCapability?: TelefunWebRtcCapability | null;
}

export const TelefunSystemTab: React.FC<TelefunSystemTabProps> = ({
  localSettings,
  setLocalSettings,
  selectedTelefunModel,
  setSelectedTelefunModel,
  selectedTelefunTransport: _selectedTelefunTransport,
  setSelectedTelefunTransport: _setSelectedTelefunTransport,
  providerReadiness: _providerReadiness,
  webRtcCapability: _webRtcCapability,
}) => {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Model AI untuk Telefun
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pilih model AI yang akan digunakan untuk simulasi voice call.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {TELEFUN_LIVE_MODELS.filter(
            (model) => model.provider === "gemini",
          ).map((model) => {
            const isSelected = selectedTelefunModel === model.id;
            const isDisabled = false;
            return (
              <button
                type="button"
                key={model.id}
                onClick={() => setSelectedTelefunModel(model.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={`flex h-auto min-h-16 w-full items-center justify-between gap-3 rounded-xl border p-4 text-left whitespace-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : isDisabled
                      ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                      : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {model.name}
                    </span>
                    <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Gemini Live
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {model.description}
                  </span>
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
              </button>
            );
          })}
        </div>

        {localSettings.telefunModelWarningReason ? (
          <p
            role="status"
            className="flex items-start gap-2 text-sm font-medium text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {localSettings.telefunModelWarningReason === "unknown-model"
                ? "Model tersimpan tidak dikenali. Pilihan dikembalikan ke Gemini 3.8."
                : localSettings.telefunModelWarningReason ===
                    "provider-unavailable"
                  ? "Pilihan model lama telah dikembalikan ke Gemini 3.8."
                  : "Pilihan model lama telah dikembalikan ke Gemini."}
            </span>
          </p>
        ) : null}
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

        <DurationSelector
          value={localSettings.maxCallDuration || 5}
          onChange={(val) =>
            setLocalSettings((prev: AppSettings) => ({
              ...prev,
              maxCallDuration: val,
            }))
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Tempo Respons Konsumen
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Atur kecepatan bicara konsumen: Natural (tempo normal) atau Cepat
            (respons lebih cepat).
          </p>
        </div>

        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Tempo respons konsumen"
        >
          {[
            {
              value: "realistic" as const,
              label: "Natural",
              description: "Kecepatan bicara normal dengan jeda natural.",
            },
            {
              value: "training_fast" as const,
              label: "Cepat",
              description:
                "Respons lebih cepat tanpa jeda panjang. Cocok untuk latihan intensif.",
            },
          ].map((option) => {
            const selected =
              (localSettings.responsePacingMode || "realistic") ===
              option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() =>
                  setLocalSettings((prev: AppSettings) => ({
                    ...prev,
                    responsePacingMode: option.value,
                  }))
                }
                className={`flex h-auto min-h-24 w-full items-center justify-between gap-3 rounded-xl border p-4 text-left whitespace-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    {option.label}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-primary" : "border-border"
                  }`}
                >
                  {selected && (
                    <span className="size-2.5 rounded-full bg-primary" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Tantangan Percakapan (Opsional)
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pilih maksimal 3 tantangan. AI akan menggunakannya hanya saat sesuai
            konteks, sehingga kemunculannya tidak selalu dijamin.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SIMULATION_CHALLENGES.map((challenge) => {
            const currentTypes = localSettings.simulationChallengeTypes || [];
            const isSelected = currentTypes.includes(challenge.id);
            const isDisabled = !isSelected && currentTypes.length >= 3;
            return (
              <button
                key={challenge.id}
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => {
                  setLocalSettings((prev: AppSettings) => {
                    const current = prev.simulationChallengeTypes || [];
                    const updated = isSelected
                      ? current.filter((t) => t !== challenge.id)
                      : [...current, challenge.id];
                    return {
                      ...prev,
                      simulationChallengeTypes: updated.slice(0, 3),
                    };
                  });
                }}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 text-foreground"
                    : isDisabled
                      ? "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent"
                  }`}
                >
                  {isSelected && <Check className="size-3.5 stroke-[3]" />}
                </span>
                <span className="min-w-0">{challenge.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          {(localSettings.simulationChallengeTypes || []).length}/3 tantangan
          dipilih
        </p>
      </section>
    </div>
  );
};
