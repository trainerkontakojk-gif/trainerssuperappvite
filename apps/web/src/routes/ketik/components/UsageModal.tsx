import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, BarChart3, Loader2, TrendingUp } from "lucide-react";

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  module?: "ketik" | "pdkt" | "telefun";
  sessionDelta?: {
    costIdr: number;
    totalTokens: number;
    totalCalls: number;
  } | null;
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

export function UsageModal({
  isOpen,
  onClose,
  module = "ketik",
  sessionDelta,
  sessionDeltaPending,
}: UsageModalProps) {
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    total_cost_idr: number;
    periodLabel: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchUsage = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch(`/api/v1/ai/usage/summary?module=${module}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json.success) setUsage(json.data);
      } catch (error) {
        console.error("[UsageModal] Failed to fetch usage:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [isOpen, module]);

  if (!isOpen) return null;

  const moduleLabel =
    module === "ketik" ? "Ketik" : module === "pdkt" ? "PDKT" : "Telefun";

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
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                Usage Bulan Ini
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                Modul {moduleLabel}
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
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-sm font-bold text-muted-foreground">
                Memuat data usage...
              </p>
            </div>
          ) : usage ? (
            <>
              <div className="text-center mb-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {usage.periodLabel}
                </p>
              </div>
              {(sessionDelta || sessionDeltaPending) && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest text-primary">
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
                    {sessionDeltaPending && (
                      <span className="text-[10px] font-bold text-amber-600">
                        masih diproses
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/20">
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                    Estimasi Biaya Bulan Ini
                  </div>
                  <div className="text-3xl font-black text-primary">
                    {formatIdr(usage.total_cost_idr)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Total Tokens
                  </div>
                  <div className="text-xl font-black">
                    {formatTokenCount(usage.total_tokens)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Call AI
                  </div>
                  <div className="text-xl font-black">{usage.total_calls}</div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Input Tokens
                  </div>
                  <div className="text-base font-bold text-muted-foreground">
                    {formatTokenCount(usage.total_input_tokens)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Output Tokens
                  </div>
                  <div className="text-base font-bold text-muted-foreground">
                    {formatTokenCount(usage.total_output_tokens)}
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
