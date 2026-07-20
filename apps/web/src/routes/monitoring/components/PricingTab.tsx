import { useEffect, useState } from "react";
import { aiClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { PricingRow } from "./PricingRow";
import { mapError } from "../utils/formatting";
import type { PricingEntry as ApiPricingEntry } from "../../../lib/api";

export type PricingEntry = ApiPricingEntry;

export function buildPricingUpdatePayload(entry: PricingEntry) {
  return {
    model_id: entry.model_id,
    input_price_usd_per_million: entry.input_price_usd_per_million,
    output_price_usd_per_million: entry.output_price_usd_per_million,
    input_text_price_usd_per_million:
      entry.input_text_price_usd_per_million,
    cached_input_text_price_usd_per_million:
      entry.cached_input_text_price_usd_per_million,
    input_audio_price_usd_per_million:
      entry.input_audio_price_usd_per_million,
    cached_input_audio_price_usd_per_million:
      entry.cached_input_audio_price_usd_per_million,
    output_text_price_usd_per_million:
      entry.output_text_price_usd_per_million,
    output_audio_price_usd_per_million:
      entry.output_audio_price_usd_per_million,
  };
}

interface PricingTabProps {
  pricing: PricingEntry[];
  billingRate: number;
  onBillingRateChange: (rate: number) => void;
  onRefresh: () => void;
}

export function PricingTab({
  pricing,
  billingRate,
  onBillingRateChange,
  onRefresh,
}: PricingTabProps) {
  const [localRate, setLocalRate] = useState(billingRate);

  useEffect(() => {
    setLocalRate(billingRate);
  }, [billingRate]);

  const handleSavePricing = async (entry: PricingEntry) => {
    try {
      await unwrapResponse(
        await aiClient["monitoring/pricing"].$put({
          json: buildPricingUpdatePayload(entry),
        }),
      );
      notify.success("Harga berhasil disimpan.");
      onRefresh();
    } catch (err) {
      notify.error("Gagal menyimpan harga.", mapError(err));
    }
  };

  const handleSaveBilling = async () => {
    try {
      await unwrapResponse(
        await aiClient["monitoring/billing"].$post({
          json: { usd_to_idr_rate: localRate },
        }),
      );
      onBillingRateChange(localRate);
      notify.success("Kurs berhasil disimpan.");
    } catch (err) {
      notify.error("Gagal menyimpan kurs.", mapError(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Billing / Kurs Editor */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
          <h2 className="text-xs font-semibold tracking-tight text-foreground">
            Kurs USD ke IDR
          </h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 max-w-sm">
            <input
              type="number"
              value={localRate}
              onChange={(e) => setLocalRate(Number(e.target.value))}
              className="h-9 w-40 px-3 bg-background border border-border rounded-md text-xs font-semibold outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-all"
              min={1}
            />
            <button
              onClick={handleSaveBilling}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center"
            >
              Simpan Kurs
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-3 font-medium">
            Kurs aktif: <span className="text-foreground font-semibold">Rp {localRate.toLocaleString()}</span> per USD
          </p>
        </div>
      </div>

      {/* Pricing Editor */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-3.5 border-b border-border/50 bg-muted/20">
          <h2 className="text-xs font-semibold tracking-tight text-foreground">
            Harga per Model (USD / 1M tokens)
          </h2>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                Model
              </th>
              <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">
                Provider
              </th>
              <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                Input ($/jt)
              </th>
              <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                Output ($/jt)
              </th>
              <th className="px-6 py-3.5 text-center font-semibold text-muted-foreground uppercase tracking-wider">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {pricing.map((p) => (
              <PricingRow key={p.model_id} entry={p} onSave={handleSavePricing} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
