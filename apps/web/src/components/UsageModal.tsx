import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, BarChart3, Loader2, TrendingUp, Sparkles, Zap } from "lucide-react";
import {
  type UsageBreakdown,
  type UsageBreakdownItem,
  type UsageSnapshot,
  type UsageDelta,
  type UsageBreakdownDisplayItem,
} from "../lib/usage-snapshot";
import { fetchUsageSummary, type UsageModule } from "../lib/usage-summary";

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: UsageModule;
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

function UsageBreakdownRows({
  breakdown,
  isDelta = false,
}: {
  breakdown?: UsageBreakdown | null;
  isDelta?: boolean;
}) {
  if (!breakdown) return null;

  const categories = [
    {
      key: "simulation",
      label: "Simulasi",
      icon: Zap,
      color: "text-emerald-600",
    },
    {
      key: "review",
      label: "Penilaian AI",
      icon: Sparkles,
      color: "text-amber-600",
    },
    {
      key: "uncategorized",
      label: "Lainnya",
      icon: BarChart3,
      color: "text-muted-foreground",
    },
  ] as const;

  const prefix = isDelta ? "+" : "";
  const isVisible = (item: UsageBreakdownItem) =>
    item.calls > 0 || item.totalTokens > 0 || item.costIdr > 0;

  return (
    <div className="space-y-1.5 mt-2 pt-2 border-t border-current/10">
      {categories.map(({ key, label, icon: Icon, color }) => {
        const item = breakdown[key];
        if (!item || !isVisible(item)) {
          return null;
        }

        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${color}`} />
              <span className={`text-[10px] font-bold ${color}`}>{label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-foreground">
                {prefix}{formatIdr(item.costIdr)}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {prefix}{formatTokenCount(item.totalTokens)} tkn | {prefix}
                {item.calls} call
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UsageBreakdownItemRows({
  items,
  isDelta = false,
}: {
  items?: UsageBreakdownDisplayItem[] | null;
  isDelta?: boolean;
}) {
  const visibleItems = (items || []).filter(
    (item) => item.calls > 0 || item.totalTokens > 0 || item.costIdr > 0,
  );
  if (visibleItems.length === 0) return null;

  const prefix = isDelta ? "+" : "";
  return (
    <div className="space-y-1.5 mt-2 pt-2 border-t border-current/10">
      {visibleItems.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-foreground">
              {prefix}{formatIdr(item.costIdr)}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {prefix}{formatTokenCount(item.totalTokens)} tkn | {prefix}{item.calls} call
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsageModal({
  isOpen,
  onClose,
  module,
  sessionDelta,
  sessionDeltaPending,
}: UsageModalProps) {
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsage = async () => {
      setLoading(true);
      try {
        const data = await fetchUsageSummary(module);
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
            <div
              className={`w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center border ${meta.border}`}
            >
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
                  {usage.periodLabel || "Bulan Ini"}
                </p>
              </div>

              {(sessionDelta || sessionDeltaPending) && (
                <div
                  className={`${meta.bg}/30 border ${meta.border} rounded-xl p-4 mb-4`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className={`w-4 h-4 ${meta.accent}`} />
                    <p
                      className={`text-xs font-black uppercase tracking-widest ${meta.accent}`}
                    >
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
                  {sessionDelta && sessionDelta.breakdownItems && sessionDelta.breakdownItems.length > 0 ? (
                    <UsageBreakdownItemRows items={sessionDelta.breakdownItems} isDelta />
                  ) : sessionDelta ? (
                    <UsageBreakdownRows breakdown={sessionDelta.breakdown} isDelta />
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`${meta.bg}/30 rounded-xl p-4 col-span-2 border ${meta.border}`}
                >
                  <div
                    className={`text-[10px] font-black uppercase tracking-widest ${meta.accent} mb-1`}
                  >
                    Estimasi Biaya Bulan Ini
                  </div>
                  <div className={`text-3xl font-black ${meta.accent}`}>
                    {formatIdr(usage.totalCostIdr)}
                  </div>
                  {usage.breakdownItems && usage.breakdownItems.length > 0 ? (
                    <UsageBreakdownItemRows items={usage.breakdownItems} />
                  ) : usage.breakdown ? (
                    <UsageBreakdownRows breakdown={usage.breakdown} />
                  ) : null}
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
                    {formatTokenCount(usage.totalInputTokens || 0)}
                  </div>
                </div>
                <div className="bg-foreground/[0.02] rounded-xl p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Output Tokens
                  </div>
                  <div className="text-base font-bold text-muted-foreground">
                    {formatTokenCount(usage.totalOutputTokens || 0)}
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
