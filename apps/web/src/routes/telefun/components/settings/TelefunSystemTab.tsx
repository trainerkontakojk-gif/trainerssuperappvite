import React from "react";
import { AlertCircle } from "lucide-react";
import { TELEFUN_LIVE_MODELS } from "@trainers/types";
import { SettingsRadioOption } from "../../../../components/settings/SettingsChoices";
import { DurationSelector } from "../DurationSelector";
import { TelefunAppSettings as AppSettings } from "../../telefunSettings";
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

const PACING_MODES = [
  {
    id: "realistic" as const,
    label: "Natural",
    description: "Kecepatan bicara normal dengan jeda seperti orang sungguhan.",
  },
  {
    id: "training_fast" as const,
    label: "Cepat",
    description: "Konsumen menjawab lebih cepat, cocok untuk latihan singkat.",
  },
];

function modelWarning(reason: AppSettings["telefunModelWarningReason"]) {
  if (reason === "unknown-model") {
    return "Model tersimpan tidak dikenali. Pilihan dikembalikan ke Gemini 3.8.";
  }
  if (reason === "provider-unavailable") {
    return "Pilihan model lama telah dikembalikan ke Gemini 3.8.";
  }
  return reason ? "Pilihan model lama telah dikembalikan ke Gemini." : null;
}

export const TelefunSystemTab: React.FC<TelefunSystemTabProps> = ({
  localSettings,
  setLocalSettings,
  selectedTelefunModel,
  setSelectedTelefunModel,
}) => {
  const warning = modelWarning(localSettings.telefunModelWarningReason);
  const pacing = localSettings.responsePacingMode || "realistic";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
          Sesi &amp; AI
        </h3>
        <p className="text-[13px] leading-5 text-fg2">
          Atur lama panggilan, tempo bicara konsumen, dan AI yang memerankan
          konsumen.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h4
            id="telefun-duration-label"
            className="text-[15px] font-semibold text-foreground"
          >
            Durasi panggilan
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-fg2">
            Konsumen diberi tahu sisa waktu menjelang akhir, lalu panggilan
            berakhir otomatis saat waktu habis.
          </p>
        </div>
        <DurationSelector
          labelledBy="telefun-duration-label"
          value={localSettings.maxCallDuration || 5}
          onChange={(value) =>
            setLocalSettings((prev) => ({ ...prev, maxCallDuration: value }))
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h4
          id="telefun-pacing-label"
          className="text-[15px] font-semibold text-foreground"
        >
          Tempo bicara konsumen
        </h4>
        <div
          role="radiogroup"
          aria-labelledby="telefun-pacing-label"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {PACING_MODES.map((mode) => (
            <SettingsRadioOption
              key={mode.id}
              selected={pacing === mode.id}
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
            </SettingsRadioOption>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h4 className="text-[15px] font-semibold text-foreground">
            Model AI
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-fg2">
            Model suara yang memerankan konsumen selama panggilan.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Model AI"
          className="grid grid-cols-1 gap-2.5"
        >
          {TELEFUN_LIVE_MODELS.filter(
            (model) => model.provider === "gemini",
          ).map((model) => (
            <SettingsRadioOption
              key={model.id}
              selected={selectedTelefunModel === model.id}
              onSelect={() => setSelectedTelefunModel(model.id)}
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
            </SettingsRadioOption>
          ))}
        </div>
        {warning && (
          <p
            role="status"
            className="flex items-start gap-2 text-[13px] text-fg2"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-chart-amber"
            />
            <span>{warning}</span>
          </p>
        )}
      </section>
    </div>
  );
};
