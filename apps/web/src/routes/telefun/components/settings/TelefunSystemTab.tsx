import React from "react";
import { Zap, AlertCircle, Clock, Check } from "lucide-react";
import { TELEFUN_LIVE_MODELS } from "@trainers/types";
import { DurationSelector } from "../DurationSelector";
import { TelefunAppSettings as AppSettings } from "../../telefunSettings";
import { SIMULATION_CHALLENGES } from "../../services/simulationChallenges";
import type { TelefunProviderReadinessState } from "../../hooks/useTelefunProviderReadiness";
import {
  isAllowedTelefunWebRtc,
  isTelefunWebRtcModelAllowed,
  type TelefunWebRtcCapability,
} from "../../services/telefunWebRtcCapability";

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
  selectedTelefunTransport,
  setSelectedTelefunTransport,
  providerReadiness,
  webRtcCapability = null,
}) => {
  const openAIReady =
    providerReadiness.status === "ready" &&
    providerReadiness.openai.enabled &&
    providerReadiness.openai.configured &&
    providerReadiness.openai.ready;
  return (
    <div className="space-y-8 mt-4">
      {/* AI Model Selection for Telefun */}
      <section className="space-y-3">
        <div className="relative group overflow-hidden rounded-xl border border-border bg-primary/5 p-4">
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary/5 transition-transform group-hover:scale-110">
            <Zap className="w-24 h-24" />
          </div>
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">
                Model AI untuk Telefun
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Pilih model AI yang akan digunakan untuk simulasi voice call.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {TELEFUN_LIVE_MODELS.map((model) => {
            const isSelected = selectedTelefunModel === model.id;
            const isOpenAI = model.provider === "openai";
            const isWebRtcPilot =
              isAllowedTelefunWebRtc(webRtcCapability) &&
              isTelefunWebRtcModelAllowed(webRtcCapability, model.id);
            const isDisabled = isOpenAI && !openAIReady && !isWebRtcPilot;
            return (
              <button
                type="button"
                key={model.id}
                onClick={() => setSelectedTelefunModel(model.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? "bg-card border-primary opacity-100"
                    : isDisabled
                      ? "border-border/30 bg-card/20 opacity-50 cursor-not-allowed"
                      : "bg-card/30 border-border/40 opacity-85 hover:opacity-100 hover:bg-card/50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-foreground tracking-tight truncate">
                      {model.name}
                    </h4>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                        model.realtime.transport === "openai-audio"
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {model.realtime.transport}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {model.description}
                  </p>
                  {isOpenAI && providerReadiness.status === "loading" ? (
                    <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Memeriksa kesiapan layanan OpenAI…</span>
                    </div>
                  ) : isDisabled ? (
                    <div className="flex items-center gap-1 mt-1.5 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Layanan OpenAI belum siap di Telefun.</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center shrink-0">
                  {isSelected && !isDisabled ? (
                    <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {isAllowedTelefunWebRtc(webRtcCapability) &&
        isTelefunWebRtcModelAllowed(
          webRtcCapability,
          selectedTelefunModel,
        ) ? (
          <div className="space-y-2 rounded-xl border border-border bg-card/30 p-4">
            <p className="text-xs font-semibold text-foreground">
              Transport panggilan (pilot non-produksi)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["openai-audio", "openai-webrtc"] as const).map((transport) => (
                <button
                  key={transport}
                  type="button"
                  aria-pressed={
                    (selectedTelefunTransport ??
                      localSettings.telefunTransport) === transport
                  }
                  onClick={() => setSelectedTelefunTransport?.(transport)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    (selectedTelefunTransport ??
                      localSettings.telefunTransport) === transport
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-foreground/[0.03]"
                  }`}
                >
                  {transport === "openai-webrtc"
                    ? "OpenAI WebRTC"
                    : "OpenAI WebSocket"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              WebRTC tidak dipilih otomatis dan belum menyediakan rekaman atau
              fallback di tengah panggilan.
            </p>
          </div>
        ) : null}
        {localSettings.telefunModelWarningReason ? (
          <p
            role="status"
            className="flex items-start gap-2 text-xs font-medium text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {localSettings.telefunModelWarningReason === "unknown-model"
                ? "Model tersimpan tidak dikenali. Pilihan dikembalikan ke Gemini 3.1."
                : localSettings.telefunModelWarningReason ===
                    "provider-unavailable"
                  ? "Layanan OpenAI belum siap. Pilihan dikembalikan ke Gemini 3.1."
                  : "Transport model tersimpan tidak cocok dan telah disesuaikan."}
            </span>
          </p>
        ) : null}
      </section>

      {/* Simulation Duration Selection */}
      <section className="space-y-3">
        <div className="relative group overflow-hidden rounded-xl border border-border bg-primary/5 p-4">
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary/5 transition-transform group-hover:scale-110">
            <Clock className="w-24 h-24" />
          </div>
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">
                Durasi Simulasi
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Tentukan batas waktu maksimal untuk setiap sesi simulasi.
              </p>
            </div>
          </div>
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

      {/* Tempo Respons Konsumen */}
      <section className="space-y-3">
        <div className="bg-primary/5 border border-border p-4 rounded-xl">
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">
                Tempo Respons Konsumen
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Atur kecepatan bicara konsumen: Natural (tempo normal) atau
                Cepat (respons lebih cepat).
              </p>
            </div>
          </div>
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
                className={`relative flex h-36 flex-col justify-between rounded-xl border p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/45 hover:bg-foreground/[0.02]"
                }`}
              >
                <span
                  className={`text-sm font-bold tracking-tight ${selected ? "text-primary" : "text-foreground"}`}
                >
                  {option.label}
                </span>
                <span className="text-xs font-medium leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute right-5 top-5 flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-primary" : "border-border"}`}
                >
                  {selected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Conversation Challenges */}
      <section className="space-y-3">
        <div className="bg-primary/5 border border-border p-4 rounded-xl">
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">
                Tantangan Percakapan (Opsional)
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Pilih maksimal 3 tantangan. AI akan menggunakannya hanya saat
                sesuai konteks, sehingga kemunculannya tidak selalu dijamin.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                className={`flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-lg border text-xs font-semibold transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary"
                    : isDisabled
                      ? "border-border/30 bg-card/25 text-muted-foreground/30 cursor-not-allowed opacity-50"
                      : "border-border bg-card/40 text-muted-foreground hover:border-primary/30"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border bg-transparent"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </span>
                {challenge.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground font-medium">
          {(localSettings.simulationChallengeTypes || []).length}/3 tantangan
          dipilih
        </p>
      </section>
    </div>
  );
};
