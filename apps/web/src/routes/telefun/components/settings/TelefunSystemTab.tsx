import React from 'react';
import { Zap, AlertCircle, Clock, Check } from 'lucide-react';
import { DurationSelector } from '../DurationSelector';
import {
  TelefunAppSettings as AppSettings,
  VOICE_MODELS as TELEFUN_AUDIO_MODELS
} from '../../telefunSettings';
import { SIMULATION_CHALLENGES } from '../../services/simulationChallenges';

interface TelefunSystemTabProps {
  localSettings: AppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  selectedTelefunModel: string;
  setSelectedTelefunModel: (modelId: string) => void;
}

export const TelefunSystemTab: React.FC<TelefunSystemTabProps> = ({
  localSettings,
  setLocalSettings,
  selectedTelefunModel,
  setSelectedTelefunModel,
}) => {
  return (
    <div className="space-y-8 mt-4">
      {/* AI Model Selection for Telefun */}
      <section className="space-y-3">
        <div className="bg-primary/5 border border-border p-4 rounded-xl">
          <div className="absolute top-1/2 -translate-y-1/2 right-4 text-primary/5 group-hover:scale-110 transition-transform pointer-events-none">
            <Zap className="w-24 h-24" />
          </div>
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Model AI untuk Telefun</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Pilih model AI yang akan digunakan untuk simulasi voice call.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {TELEFUN_AUDIO_MODELS.map((model: any) => {
            const isSelected = selectedTelefunModel === model.id;
            const isDisabled = model.disabled;
            return (
              <div
                key={model.id}
                onClick={() => !isDisabled && setSelectedTelefunModel(model.id)}
                className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center justify-between gap-4 group relative overflow-hidden ${
                  isSelected
                    ? 'bg-card border-primary opacity-100'
                    : isDisabled
                    ? 'border-border/30 bg-card/20 opacity-50 cursor-not-allowed'
                    : 'bg-card/30 border-border/40 opacity-85 hover:opacity-100 hover:bg-card/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-foreground tracking-tight truncate">{model.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                      model.telefunTransport === 'openai-audio'
                        ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    }`}>
                      {model.telefunTransport}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{model.description}</p>
                  {isDisabled && (
                    <div className="flex items-center gap-1 mt-1.5 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Belum tersedia</span>
                    </div>
                  )}
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
              </div>
            );
          })}
        </div>
      </section>

      {/* Simulation Duration Selection */}
      <section className="space-y-3">
        <div className="bg-primary/5 border border-border p-4 rounded-xl">
          <div className="absolute top-1/2 -translate-y-1/2 right-4 text-primary/5 group-hover:scale-110 transition-transform pointer-events-none">
            <Clock className="w-24 h-24" />
          </div>
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Durasi Simulasi</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Tentukan batas waktu maksimal untuk setiap sesi simulasi.
              </p>
            </div>
          </div>
        </div>

        <DurationSelector
          value={localSettings.maxCallDuration || 5}
          onChange={(val) => setLocalSettings((prev: AppSettings) => ({ ...prev, maxCallDuration: val }))}
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
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Tempo Respons Konsumen</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Atur kecepatan bicara konsumen: Natural (tempo normal) atau Cepat (respons lebih cepat).
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, responsePacingMode: 'realistic' }))}
            className={`cursor-pointer p-5 rounded-xl border transition-all flex flex-col justify-between h-36 relative group ${
              (localSettings.responsePacingMode || 'realistic') === 'realistic'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card/45 hover:bg-foreground/[0.02]'
            }`}
          >
            <div className="flex justify-between items-start w-full">
              <span className={`text-sm font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'realistic' ? 'text-primary' : 'text-foreground'}`}>
                Natural
              </span>
              <div className="flex items-center shrink-0">
                {(localSettings.responsePacingMode || 'realistic') === 'realistic' ? (
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-medium mt-2 leading-relaxed">
              Kecepatan bicara normal dengan jeda natural.
            </span>
          </div>

          <div
            onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, responsePacingMode: 'training_fast' }))}
            className={`cursor-pointer p-5 rounded-xl border transition-all flex flex-col justify-between h-36 relative group ${
              (localSettings.responsePacingMode || 'realistic') === 'training_fast'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card/45 hover:bg-foreground/[0.02]'
            }`}
          >
            <div className="flex justify-between items-start w-full">
              <span className={`text-sm font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? 'text-primary' : 'text-foreground'}`}>
                Cepat
              </span>
              <div className="flex items-center shrink-0">
                {(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? (
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-medium mt-2 leading-relaxed">
              Respons lebih cepat tanpa jeda panjang. Cocok untuk latihan intensif.
            </span>
          </div>
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
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Tantangan Percakapan (Opsional)</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Pilih maksimal 3 tantangan. AI akan menggunakannya hanya saat sesuai konteks, sehingga kemunculannya tidak selalu dijamin.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SIMULATION_CHALLENGES.map(challenge => {
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
                        return { ...prev, simulationChallengeTypes: updated.slice(0, 3) };
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-lg border text-xs font-semibold transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : isDisabled
                        ? 'border-border/30 bg-card/25 text-muted-foreground/30 cursor-not-allowed opacity-50'
                        : 'border-border bg-card/40 text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-transparent'
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
          {(localSettings.simulationChallengeTypes || []).length}/3 tantangan dipilih
        </p>
      </section>
    </div>
  );
};
