import { useCallback, useRef, useState, type ReactNode } from "react";
import { BarChart3, RotateCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { Skeleton } from "../../../components/ui/skeleton";
import { fetchUsageSummary } from "../../../lib/usage-summary";
import {
  type UsageBreakdown,
  type UsageDelta,
  type UsageSnapshot,
} from "../../../lib/usage-snapshot";

/** Nama jenis panggilan AI PDKT dalam bahasa peserta; kunci dari `ai-usage-categories`. */
const PDKT_ITEM_LABELS: Record<string, string> = {
  pdkt_create_email: "Membuat email kasus",
  pdkt_template: "Membuat template email",
  pdkt_image_generation: "Membuat lampiran",
  pdkt_review: "Menelaah balasan",
};

const CATEGORY_LABELS: Record<keyof UsageBreakdown, string> = {
  simulation: "Simulasi",
  review: "Penilaian AI",
  uncategorized: "Lainnya",
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

function toRows(usage: UsageSnapshot): UsageRow[] {
  const items = usage.breakdownItems?.length
    ? usage.breakdownItems.map((item) => ({
        key: item.key,
        label: PDKT_ITEM_LABELS[item.key] ?? item.label,
        calls: item.calls,
        costIdr: item.costIdr,
      }))
    : (Object.keys(CATEGORY_LABELS) as (keyof UsageBreakdown)[]).map((key) => ({
        key,
        label: CATEGORY_LABELS[key],
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
  triggerClassName?: string;
  /** Isi tambahan di tombol pemicu, mis. lencana kenaikan sesi terakhir. */
  triggerBadge?: ReactNode;
  sessionDelta?: UsageDelta | null;
  sessionDeltaPending?: boolean;
}

export function UsagePopover({
  triggerClassName,
  triggerBadge,
  sessionDelta,
  sessionDeltaPending,
}: UsagePopoverProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: "loading" });
    const usage = await fetchUsageSummary("pdkt");
    if (request !== requestRef.current) return;
    setState(usage ? { status: "ready", usage } : { status: "error" });
  }, []);

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
              <span className="font-mono text-[28px] leading-[34px] font-bold tabular-nums text-foreground">
                {formatIdr(state.usage.totalCostIdr)}
              </span>
              <span className="text-xs text-muted-foreground">
                {state.usage.totalCalls} panggilan
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

          {state.status === "ready" && <UsageRows usage={state.usage} />}
        </div>

        {(sessionDeltaPending || hasDelta(sessionDelta)) && (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-foreground/80">
            {hasDelta(sessionDelta) ? (
              <>
                Sesi terakhir menambah{" "}
                <strong className="font-semibold text-foreground">
                  {formatIdr(sessionDelta.costIdr)}
                </strong>{" "}
                ({sessionDelta.totalCalls} panggilan AI).
              </>
            ) : (
              "Pemakaian sesi terakhir masih dihitung."
            )}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Estimasi dari jumlah token AI.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UsageRows({ usage }: { usage: UsageSnapshot }) {
  const rows = toRows(usage);
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
              <span className="text-foreground/80">{row.label}</span>
              <span className="font-mono font-bold tabular-nums text-foreground">
                {formatIdr(row.costIdr)}
              </span>
            </span>
            <span aria-hidden="true" className="h-1.5 rounded-full bg-muted">
              <span
                className="block h-1.5 rounded-full bg-module-pdkt"
                style={{ width: `${share}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
