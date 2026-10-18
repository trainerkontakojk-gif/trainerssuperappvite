import { Button } from "../../../components/ui/button";
import type { PricingEntry } from "./PricingTab";
import { formatPricingDate, formatUsdRate } from "../utils/formatting";

/** True when a row is kept only for history and cannot be edited. */
export function isHistoricalPricing(entry: PricingEntry): boolean {
  return (
    entry.historical === true ||
    entry.editable === false ||
    entry.model_id.startsWith("gpt-realtime-")
  );
}

function rate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : formatUsdRate(value);
}

export function PricingRow({
  entry,
  onEdit,
  onCancelSchedule,
}: {
  entry: PricingEntry;
  onEdit: (entry: PricingEntry) => void;
  onCancelSchedule: (entry: PricingEntry) => void;
}) {
  const historical = isHistoricalPricing(entry);
  const realtime = entry.pricing_mode === "realtime";
  const next = entry.next_price;

  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-foreground">
          {entry.model_name}
        </span>{" "}
        <span className="font-mono text-xs text-muted-foreground">
          {entry.model_id}
        </span>
      </td>
      {realtime ? (
        <td colSpan={3} className="px-4 py-3 text-sm text-muted-foreground">
          6 harga terpisah (teks, audio, cache)
        </td>
      ) : (
        <>
          <td className="px-4 py-3 text-right text-sm tabular-nums">
            {rate(entry.input_price_usd_per_million)}
          </td>
          <td className="px-4 py-3 text-right text-sm tabular-nums">
            {rate(entry.output_price_usd_per_million)}
          </td>
          <td className="px-4 py-3 text-right text-sm tabular-nums">
            {rate(entry.image_output_price_usd_per_million)}
          </td>
        </>
      )}
      <td className="px-4 py-3 text-sm">
        {next ? (
          <>
            Mulai {formatPricingDate(next.effective_from)}:{" "}
            <span className="font-semibold tabular-nums">
              {realtime
                ? "6 harga baru"
                : `${formatUsdRate(next.input_price_usd_per_million)} / ${formatUsdRate(next.output_price_usd_per_million)}`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
        {entry.effective_since ? formatPricingDate(entry.effective_since) : "-"}
      </td>
      <td className="px-4 py-3">
        {historical ? null : (
          <div className="flex justify-end gap-2">
            {next ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onCancelSchedule(entry)}
                className="min-h-11 px-3 text-sm"
              >
                Batalkan jadwal
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onEdit(entry)}
              className="min-h-11 px-3 text-sm"
            >
              Ubah
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
