import { useState, useEffect } from "react";
import {
  BarChart3,
  ClipboardCheck,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
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

const MODULE_META: Record<
  UsageModule,
  { label: string; accent: string; surface: string }
> = {
  ketik: {
    label: "Ketik",
    accent: "text-module-ketik",
    surface: "border-module-ketik/20 bg-module-ketik/5",
  },
  pdkt: {
    label: "PDKT",
    accent: "text-module-pdkt",
    surface: "border-module-pdkt/20 bg-module-pdkt/5",
  },
  telefun: {
    label: "Telefun",
    accent: "text-module-telefun",
    surface: "border-module-telefun/20 bg-module-telefun/5",
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
    { key: "simulation", label: "Simulasi", icon: Zap },
    { key: "review", label: "Penilaian AI", icon: ClipboardCheck },
    { key: "uncategorized", label: "Lainnya", icon: BarChart3 },
  ] as const;

  const prefix = isDelta ? "+" : "";
  const isVisible = (item: UsageBreakdownItem) =>
    item.calls > 0 || item.totalTokens > 0 || item.costIdr > 0;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {categories.map(({ key, label, icon: Icon }) => {
        const item = breakdown[key];
        if (!item || !isVisible(item)) {
          return null;
        }

        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-right">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {prefix}
                {formatIdr(item.costIdr)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {prefix}
                {formatTokenCount(item.totalTokens)} tkn · {prefix}
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
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {visibleItems.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {item.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {prefix}
              {formatIdr(item.costIdr)}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {prefix}
              {formatTokenCount(item.totalTokens)} tkn · {prefix}
              {item.calls} call
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

  const meta = MODULE_META[module];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[86vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-3 border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${meta.surface}`}
            >
              <BarChart3 className={`size-5 ${meta.accent}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg tracking-tight">
                Pemakaian Bulan Ini
              </DialogTitle>
              <DialogDescription className="text-sm">
                Modul {meta.label}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className={`mb-3 size-7 animate-spin ${meta.accent}`} />
              <p className="text-sm font-medium text-muted-foreground">
                Memuat data pemakaian...
              </p>
            </div>
          ) : usage ? (
            <>
              <div className="flex justify-center">
                <Badge variant="outline" className="text-xs font-medium">
                  {usage.periodLabel || "Bulan Ini"}
                </Badge>
              </div>

              {(sessionDelta || sessionDeltaPending) && (
                <div className={`rounded-xl border p-4 ${meta.surface}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <TrendingUp className={`size-4 ${meta.accent}`} />
                    <p className={`text-sm font-semibold ${meta.accent}`}>
                      Kenaikan setelah sesi terakhir
                    </p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {sessionDelta
                      ? `+${formatIdr(sessionDelta.costIdr)}`
                      : "\u2014"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {sessionDelta && sessionDelta.totalTokens > 0 && (
                      <span>
                        +{formatTokenCount(sessionDelta.totalTokens)} token
                      </span>
                    )}
                    {sessionDelta && sessionDelta.totalCalls > 0 && (
                      <span>+{sessionDelta.totalCalls} call</span>
                    )}
                    {sessionDeltaPending && !sessionDelta && (
                      <span>masih diproses</span>
                    )}
                  </div>
                  {sessionDelta &&
                  sessionDelta.breakdownItems &&
                  sessionDelta.breakdownItems.length > 0 ? (
                    <UsageBreakdownItemRows
                      items={sessionDelta.breakdownItems}
                      isDelta
                    />
                  ) : sessionDelta ? (
                    <UsageBreakdownRows
                      breakdown={sessionDelta.breakdown}
                      isDelta
                    />
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`col-span-2 rounded-xl border p-4 ${meta.surface}`}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    Estimasi Biaya Bulan Ini
                  </p>
                  <p
                    className={`mt-1 text-3xl font-semibold tabular-nums ${meta.accent}`}
                  >
                    {formatIdr(usage.totalCostIdr)}
                  </p>
                  {usage.breakdownItems && usage.breakdownItems.length > 0 ? (
                    <UsageBreakdownItemRows items={usage.breakdownItems} />
                  ) : usage.breakdown ? (
                    <UsageBreakdownRows breakdown={usage.breakdown} />
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Total Tokens
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {formatTokenCount(usage.totalTokens)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Call AI
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {usage.totalCalls}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Input Tokens
                  </p>
                  <p className="mt-1 text-base font-medium tabular-nums text-muted-foreground">
                    {formatTokenCount(usage.totalInputTokens || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Output Tokens
                  </p>
                  <p className="mt-1 text-base font-medium tabular-nums text-muted-foreground">
                    {formatTokenCount(usage.totalOutputTokens || 0)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                Belum ada data pemakaian untuk bulan ini.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-6 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Estimasi biaya berdasarkan penggunaan token AI
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
