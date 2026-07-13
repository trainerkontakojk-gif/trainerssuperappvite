import React from "react";
import { X, Play, AlertCircle } from "lucide-react";
import type { PdktScenario } from "@trainers/types";

interface CreateEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarios: PdktScenario[];
  onCreate: (scenario: PdktScenario) => void;
  isLoading: boolean;
}

export const CreateEmailModal: React.FC<CreateEmailModalProps> = ({
  isOpen,
  onClose,
  scenarios,
  onCreate,
  isLoading,
}) => {
  if (!isOpen) return null;

  const activeScenarios = scenarios.filter((s) => s.isActive);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Dialog content */}
      <div className="relative w-full max-w-lg bg-[var(--surface)] rounded-xl overflow-hidden border border-[var(--border)] transition-all transform scale-100">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--fg)]">
            Buat Email Baru
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg)] rounded-xl transition-all text-[var(--fg2)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeScenarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-12 h-12 text-[var(--fg3)] mb-3" />
              <p className="text-xs text-[var(--fg2)] leading-loose">
                Tidak ada skenario aktif.
                <br />
                Harap aktifkan skenario di Pengaturan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-[var(--fg3)] uppercase tracking-wider mb-4">
                Pilih Skenario Sesuai Masalah
              </p>
              <p className="text-[10px] text-[var(--fg2)] leading-relaxed mb-3">
                Setiap skenario aktif dibuat sebagai email terpisah. Pilih satu
                skenario saat Create Email.
              </p>
              {activeScenarios.map((scenario) => {
                const isAlways =
                  (scenario as any).alwaysUseSampleEmail &&
                  (scenario as any).sampleEmailTemplate?.body;
                const hasTemplate = (scenario as any).sampleEmailTemplate?.body;

                return (
                  <button
                    key={scenario.id}
                    onClick={() => onCreate(scenario)}
                    disabled={isLoading}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border border-[var(--border)] hover:border-[var(--module-pdkt)] hover:bg-[var(--bg)] text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--module-pdkt-bg)] flex items-center justify-center text-[var(--module-pdkt)] group-hover:bg-[var(--module-pdkt)] group-hover:text-[var(--inv-fg)] transition-colors">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-bold text-[var(--fg)] truncate">
                          {scenario.title}
                        </div>
                        {isAlways ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[7px] font-bold uppercase tracking-wider shrink-0">
                            Always use
                          </span>
                        ) : hasTemplate ? (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 text-[7px] font-bold uppercase tracking-wider shrink-0">
                            Template tersedia
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[7px] font-bold uppercase tracking-wider shrink-0">
                            AI generated
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--fg2)] line-clamp-2 leading-relaxed">
                        {scenario.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[var(--bg)] border-t border-[var(--border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-semibold text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--surface)] transition-all"
          >
            Batal
          </button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-[var(--surface)]/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-pdkt)]/30 border-t-[var(--module-pdkt)] mb-3" />
            <span className="text-xs font-bold text-[var(--module-pdkt)] animate-pulse">
              Menghasilkan Email...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
