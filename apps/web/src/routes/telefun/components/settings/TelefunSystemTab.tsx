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
    <div className="space-y-8">
      {/* AI Model Selection for Telefun */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">Model AI untuk Telefun</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Pilih model AI yang akan digunakan untuk simulasi voice call.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {TELEFUN_AUDIO_MODELS.map((model: any) => {
            const isSelected = selectedTelefunModel === model.id;
            const isDisabled = model.disabled;
            return (
              <div
                key={model.id}
                onClick={() => !isDisabled && setSelectedTelefunModel(model.id)}
                className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex items-center justify-between gap-6 group relative ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                    : isDisabled
                    ? 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1C1C1E]/50 opacity-50 cursor-not-allowed'
                    : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg">{model.name}</h4>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border ${
                      model.telefunTransport === 'openai-audio'
                        ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    }`}>
                      {model.telefunTransport}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{model.description}</p>
                  {isDisabled && (
                    <div className="flex items-center gap-1 mt-2 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>Belum tersedia</span>
                    </div>
                  )}
                </div>
                {isSelected && !isDisabled && (
                  <div className="w-8 h-8 bg-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Simulation Duration Selection */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">Durasi Simulasi</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
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
      <section className="space-y-6">
        <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-teal-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">Tempo Respons Konsumen</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Atur kecepatan bicara konsumen: Natural (tempo normal) atau Cepat (respons lebih cepat). Tidak memengaruhi fitur simulasi realistis di bawah.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, responsePacingMode: 'realistic' }))}
            className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative group ${
              (localSettings.responsePacingMode || 'realistic') === 'realistic'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
            }`}
          >
            <Zap className={`w-8 h-8 ${(localSettings.responsePacingMode || 'realistic') === 'realistic' ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
            <span className={`text-base font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'realistic' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
              Natural
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center leading-relaxed">
              Kecepatan bicara normal dengan jeda natural. Tidak mengaktifkan fitur simulasi tambahan.
            </span>
            {(localSettings.responsePacingMode || 'realistic') === 'realistic' && (
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 z-10">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>

          <div
            onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, responsePacingMode: 'training_fast' }))}
            className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 text-center relative group ${
              (localSettings.responsePacingMode || 'realistic') === 'training_fast'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-transparent bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'
            }`}
          >
            <Zap className={`w-8 h-8 ${(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
            <span className={`text-base font-bold tracking-tight ${(localSettings.responsePacingMode || 'realistic') === 'training_fast' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
              Cepat
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center leading-relaxed">
              Respons lebih cepat tanpa jeda panjang. Cocok untuk latihan berulang secara efisien.
            </span>
            {(localSettings.responsePacingMode || 'realistic') === 'training_fast' && (
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 z-10">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Realistic Mode */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">Mode Simulasi Realistis</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Aktifkan simulasi percakapan tingkat lanjut: turn-taking kontekstual, backchannel alami, kepribadian konsisten, skenario gangguan, dan fitur hold. Atur tempo bicara secara terpisah di panel atas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocalSettings((prev: AppSettings) => ({ ...prev, realisticModeEnabled: !prev.realisticModeEnabled }))}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                localSettings.realisticModeEnabled ? 'bg-violet-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
              role="switch"
              aria-checked={localSettings.realisticModeEnabled || false}
              aria-label="Toggle mode simulasi realistis"
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  localSettings.realisticModeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Disruption Type Configuration - only shown when realistic mode is enabled */}
        {localSettings.realisticModeEnabled && (
          <div className="bg-white dark:bg-[#1C1C1E] p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
            <h4 className="font-bold text-gray-900 dark:text-white text-base mb-2">Skenario Gangguan</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
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
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                      isSelected
                        ? 'border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        : isDisabled
                        ? 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1C1C1E]/50 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                        : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-500/30'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-violet-500 border-violet-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                    {disruption.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {(localSettings.realisticModeDisruptionTypes || []).length}/3 tipe dipilih
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
