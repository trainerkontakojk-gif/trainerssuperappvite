import { useCallback, useRef, useState, type ReactNode } from "react";
import { BarChart3, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Button } from "../ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/popover";
import { Skeleton } from "../ui/skeleton";
import { fetchUsageSummary } from "../../lib/usage-summary";
import {
  type UsageBreakdown,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";

export type UsagePopoverModule = "pdkt" | "ketik";

interface ModuleCopy {
  /** Nama jenis permintaan AI dalam bahasa peserta; kunci dari `ai-usage-categories`. */
  items: Record<string, string>;
  categories: Record<keyof UsageBreakdown, string>;
  /** Unit kegiatan yang biayanya dilaporkan, mis. "Balasan terakhir". */
  latest: string;
  bar: string;
}

const MODULE_COPY: Record<UsagePopoverModule, ModuleCopy> = {
  pdkt: {
    items: {
      pdkt_create_email: "Membuat email konsumen",
      pdkt_template: "Menyiapkan email skenario",
      pdkt_image_generation: "Membuat lampiran",
      pdkt_review: "Menelaah balasan",
    },
    categories: {
      simulation: "Pembuatan email",
      review: "Telaah balasan",
      uncategorized: "Lainnya",
    },
    latest: "Balasan terakhir",
    bar: "bg-module-pdkt",
  },
  ketik: {
    items: {
      ketik_consumer_response: "Simulasi chat",
      ketik_review: "Penilaian AI",
    },
    categories: {
      simulation: "Simulasi chat",
      review: "Penilaian AI",
      uncategorized: "Lainnya",
    },
    latest: "Sesi terakhir",
    bar: "bg-module-ketik",
  },
};

interface UsageRow {
  key: string;
  label: string;
  calls: number;
  costIdr: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; usage: UsageSnapshot };

function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function toRows(usage: UsageSnapshot, copy: ModuleCopy): UsageRow[] {
  const items = usage.breakdownItems?.length
    ? usage.breakdownItems.map((item) => ({
        key: item.key,
        label: copy.items[item.key] ?? item.label,
        calls: item.calls,
        costIdr: item.costIdr,
      }))
    : (Object.keys(copy.categories) as (keyof UsageBreakdown)[]).map((key) => ({
        key,
        label: copy.categories[key],
        calls: usage.breakdown?.[key]?.calls ?? 0,
        costIdr: usage.breakdown?.[key]?.costIdr ?? 0,
      }));
  return items
    .filter((row) => row.calls > 0 || row.costIdr > 0)
    .sort((a, b) => b.costIdr - a.costIdr);
}

function hasDelta(delta: UsageDelta | null | undefined): delta is UsageDelta {
  return Boolean(
    delta &&
    (delta.costIdr > 0 || delta.totalTokens > 0 || delta.totalCalls > 0),
  );
}

interface UsagePopoverProps {
  module: UsagePopoverModule;
  triggerClassName?: string;
  /** Isi tambahan di tombol pemicu, mis. lencana kenaikan sesi terakhir. */
  triggerBadge?: ReactNode;
  sessionDelta?: UsageDelta | null;
  sessionDeltaPending?: boolean;
}

/** Ringkasan pemakaian AI bulan ini untuk satu modul latihan. */
export function UsagePopover({
  module,
  triggerClassName,
  triggerBadge,
  sessionDelta,
  sessionDeltaPending,
}: UsagePopoverProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestRef = useRef(0);
  const copy = MODULE_COPY[module];

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: "loading" });
    const usage = await fetchUsageSummary(module);
    if (request !== requestRef.current) return;
    setState(usage ? { status: "ready", usage } : { status: "error" });
  }, [module]);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={triggerClassName}
          />
        }
      >
        <BarChart3 data-icon="inline-start" />
        Pemakaian AI
        {triggerBadge}
      </PopoverTrigger>
      <PopoverContent className="flex w-[min(360px,calc(100vw-32px))] flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <PopoverTitle>
            Pemakaian AI ·{" "}
            {state.status === "ready" && state.usage.periodLabel
              ? state.usage.periodLabel
              : "Bulan ini"}
          </PopoverTitle>
          {state.status === "ready" && (
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[28px] leading-[34px] font-bold tabular-nums text-foreground">
                {formatIdr(state.usage.totalCostIdr)}
              </span>
              <span className="text-xs text-muted-foreground">
                {state.usage.totalCalls} permintaan AI
              </span>
            </p>
          )}
        </div>

        <div aria-live="polite" className="flex flex-col gap-4">
          {state.status === "loading" && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <span className="sr-only">Memuat data pemakaian…</span>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-start gap-3 text-sm">
              <p className="text-foreground">
                Data pemakaian belum bisa dimuat.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => void load()}
              >
                <RotateCcw data-icon="inline-start" />
                Coba lagi
              </Button>
            </div>
          )}

          {state.status === "ready" && (
            <UsageRows usage={state.usage} copy={copy} />
          )}
        </div>

        {(sessionDeltaPending || hasDelta(sessionDelta)) && (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-fg2">
            {hasDelta(sessionDelta) ? (
              <>
                {copy.latest} memakai{" "}
                <strong className="font-semibold text-foreground">
                  {formatIdr(sessionDelta.costIdr)}
                </strong>{" "}
                ({sessionDelta.totalCalls} permintaan AI).
              </>
            ) : (
              `Pemakaian ${copy.latest.toLowerCase()} masih dihitung…`
            )}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Perkiraan biaya dari pemakaian AI.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UsageRows({
  usage,
  copy,
}: {
  usage: UsageSnapshot;
  copy: ModuleCopy;
}) {
  const rows = toRows(usage, copy);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada pemakaian AI bulan ini.
      </p>
    );
  }

  const totalCost = rows.reduce((sum, row) => sum + row.costIdr, 0);
  return (
    <ul className="flex flex-col gap-2.5 text-xs">
      {rows.map((row) => {
        const share = totalCost > 0 ? (row.costIdr / totalCost) * 100 : 0;
        return (
          <li key={row.key} className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-3">
              <span className="text-fg2">{row.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatIdr(row.costIdr)}
              </span>
            </span>
            <span aria-hidden="true" className="h-1.5 rounded-full bg-muted">
              <span
                className={cn("block h-1.5 rounded-full", copy.bar)}
                style={{ width: `${share}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
