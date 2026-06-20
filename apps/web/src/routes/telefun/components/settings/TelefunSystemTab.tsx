import React from 'react';
import { Zap, AlertCircle, Clock, Check } from 'lucide-react';
import { DurationSelector } from '../DurationSelector';
import {
  TelefunAppSettings as AppSettings,
  VOICE_MODELS as TELEFUN_AUDIO_MODELS
} from '../../telefunSettings';

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
        <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
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
        <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
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
        <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
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

      {/* Realistic Mode */}
      <section className="space-y-3">
        <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
          <div className="relative z-10 max-w-2xl flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">Mode Simulasi Realistis</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Aktifkan simulasi percakapan tingkat lanjut: turn-taking kontekstual, backchannel alami, gangguan, dan fitur hold.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, realisticModeEnabled: !prev.realisticModeEnabled }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                localSettings.realisticModeEnabled ? 'bg-primary' : 'bg-border'
              }`}
              role="switch"
              aria-checked={localSettings.realisticModeEnabled || false}
              aria-label="Toggle mode simulasi realistis"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow-sm ring-0 transition duration-200 ease-in-out ${
                  localSettings.realisticModeEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Disruption Type Configuration */}
        {localSettings.realisticModeEnabled && (
          <div className="bg-card/45 p-5 rounded-xl border border-border mt-2">
            <h4 className="font-bold text-foreground text-sm tracking-tight mb-1">Skenario Gangguan</h4>
            <p className="text-xs text-muted-foreground font-medium mb-3">
              Pilih 1-3 tipe gangguan yang akan muncul selama simulasi.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: 'technical_term_confusion', label: 'Bingung Istilah Teknis' },
                { id: 'repeated_question', label: 'Pertanyaan Berulang' },
                { id: 'misunderstanding', label: 'Salah Paham' },
                { id: 'interruption', label: 'Interupsi' },
                { id: 'incomplete_data', label: 'Data Tidak Lengkap' },
                { id: 'unclear_voice', label: 'Suara Tidak Jelas' },
                { id: 'emotional_escalation', label: 'Eskalasi Emosional' },
              ].map(disruption => {
                const currentTypes = localSettings.realisticModeDisruptionTypes || [];
                const isSelected = currentTypes.includes(disruption.id);
                const isDisabled = !isSelected && currentTypes.length >= 3;
                return (
                  <button
                    key={disruption.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setLocalSettings((prev: AppSettings) => {
                        const current = prev.realisticModeDisruptionTypes || [];
                        const updated = isSelected
                          ? current.filter((t: string) => t !== disruption.id)
                          : [...current, disruption.id];
                        return { ...prev, realisticModeDisruptionTypes: updated };
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all text-left ${
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
                    {disruption.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground font-medium">
              {(localSettings.realisticModeDisruptionTypes || []).length}/3 tipe dipilih
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
