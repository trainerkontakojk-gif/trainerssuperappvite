import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, BarChart3, Loader2, TrendingUp, Sparkles, Zap } from "lucide-react";
import { getApi } from "../hooks/useApi";
import type { UsageDelta } from "../lib/usage-snapshot";

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: "ketik" | "pdkt" | "telefun";
  sessionDelta?: UsageDelta | null;
  sessionDeltaPending?: boolean;
}

function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

const MODULE_META: Record<string, { label: string; accent: string; bg: string; border: string }> = {
  ketik: {
    label: "Ketik",
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  pdkt: {
    label: "PDKT",
    accent: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-100",
  },
  telefun: {
    label: "Telefun",
    accent: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
  },
};

export function UsageModal({
  isOpen,
  onClose,
  module,
  sessionDelta,
  sessionDeltaPending,
}: UsageModalProps) {
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostIdr: number;
    simulationCostIdr: number;
    reviewCostIdr: number;
    periodLabel?: string;
    year?: number;
    month?: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsage = async () => {
      setLoading(true);
      try {
        const data = await getApi<any>(
          `/ai/usage/summary?module=${module}`,
        );
        setUsage(data);
      } catch (error) {
        console.error(`[UsageModal:${module}] Failed to fetch usage:`, error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [isOpen, module]);

  if (!isOpen) return null;

  const meta = MODULE_META[module];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];

  const periodLabel =
    usage?.periodLabel ||
    (usage?.year && usage?.month
      ? `${months[usage.month - 1]} ${usage.year}`
      : "");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md rounded-[2rem] overflow-hidden flex flex-col max-h-[86vh] shadow-2xl shadow-black/10 bg-card border border-border/50"
      >
        <header className="px-5 py-4 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center border ${meta.border}`}>
              <BarChart3 className={`w-5 h-5 ${meta.accent}`} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                Usage Bulan Ini
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                Modul {meta.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-foreground/5 rounded-xl transition-all border border-transparent hover:border-foreground/10"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className={`w-8 h-8 ${meta.accent} animate-spin mb-4`} />
              <p className="text-sm font-bold text-muted-foreground">
                Memuat data usage...
              </p>
            </div>
          ) : usage ? (
            <>
              <div className="text-center mb-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {periodLabel}
                </p>
              </div>

              {(sessionDelta || sessionDeltaPending) && (
                <div className={`${meta.bg}/30 border ${meta.border} rounded-xl p-4 mb-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className={`w-4 h-4 ${meta.accent}`} />
                    <p className={`text-xs font-black uppercase tracking-widest ${meta.accent}`}>
                      Kenaikan setelah sesi terakhir
                    </p>
                  </div>
                  <p className="text-xl font-black text-foreground">
                    {sessionDelta
                      ? `+${formatIdr(sessionDelta.costIdr)}`
                      : "\u2014"}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {sessionDelta && sessionDelta.totalTokens > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        +{formatTokenCount(sessionDelta.totalTokens)} token
                      </span>
                    )}
                    {sessionDelta && sessionDelta.totalCalls > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        +{sessionDelta.totalCalls} call
                      </span>
                    )}
                    {sessionDeltaPending && !sessionDelta && (
                      <span className="text-[10px] font-bold text-amber-600">
                        masih diproses
                      </span>
                    )}
                  </div>
                  {sessionDelta && (sessionDelta.simulationCostIdr > 0 || sessionDelta.reviewCostIdr > 0) && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-current/10">
                      {sessionDelta.simulationCostIdr > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <Zap className="w-3 h-3" />
                          Simulasi +{formatIdr(sessionDelta.simulationCostIdr)}
                        </span>
                      )}
                      {sessionDelta.reviewCostIdr > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <Sparkles className="w-3 h-3" />
                          Penilaian AI +{formatIdr(sessionDelta.reviewCostIdr)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className={`${meta.bg}/30 rounded-xl p-4 col-span-2 border ${meta.border}`}>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${meta.accent} mb-1`}>
                    Estimasi Biaya Bulan Ini
                  </div>
                  <div className={`text-3xl font-black ${meta.accent}`}>
                    {formatIdr(usage.totalCostIdr)}
                  </div>
                </div>
                <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Biaya Simulasi
                    </span>
                  </div>
                  <div className="text-lg font-black text-emerald-600">
                    {(usage.simulationCostIdr ?? 0) > 0 ? formatIdr(usage.simulationCostIdr) : "-"}
                  </div>
                  <p className="text-[10px] text-emerald-600/60 mt-0.5">
                    Chat, email, panggilan suara
                  </p>
                </div>
                <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                      Biaya Penilaian AI
                    </span>
                  </div>
                  <div className="text-lg font-black text-amber-600">
                    {(usage.reviewCostIdr ?? 0) > 0 ? formatIdr(usage.reviewCostIdr) : "-"}
                  </div>
                  <p className="text-[10px] text-amber-600/60 mt-0.5">
                    Evaluasi, coaching, analisis suara
                  </p>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Total Tokens
                  </div>
                  <div className="text-xl font-black">
                    {formatTokenCount(usage.totalTokens)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Call AI
                  </div>
                  <div className="text-xl font-black">{usage.totalCalls}</div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Input Tokens
                  </div>
                  <div className="text-base font-bold text-muted-foreground">
                    {formatTokenCount(usage.totalInputTokens)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Output Tokens
                  </div>
                  <div className="text-base font-bold text-muted-foreground">
                    {formatTokenCount(usage.totalOutputTokens)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <BarChart3 className="w-12 h-12 text-foreground/10 mb-4" />
              <p className="text-sm font-bold text-muted-foreground italic">
                Belum ada data usage untuk bulan ini.
              </p>
            </div>
          )}
        </div>

        <footer className="px-5 sm:px-6 py-4 border-t text-center shrink-0">
          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em]">
            Estimasi biaya berdasarkan penggunaan token AI
          </p>
        </footer>
      </motion.div>
    </div>
  );
}
