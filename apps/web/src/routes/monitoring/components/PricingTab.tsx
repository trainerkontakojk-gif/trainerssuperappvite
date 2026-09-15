import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { aiClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { PricingRow } from "./PricingRow";
import { mapError } from "../utils/formatting";
import type { PricingEntry as ApiPricingEntry } from "../../../lib/api";

export type PricingEntry = ApiPricingEntry & {
  historical?: boolean;
  editable?: boolean;
};

export function buildPricingUpdatePayload(entry: PricingEntry) {
  return {
    model_id: entry.model_id,
    input_price_usd_per_million: entry.input_price_usd_per_million,
    output_price_usd_per_million: entry.output_price_usd_per_million,
    input_text_price_usd_per_million: entry.input_text_price_usd_per_million,
    cached_input_text_price_usd_per_million:
      entry.cached_input_text_price_usd_per_million,
    input_audio_price_usd_per_million: entry.input_audio_price_usd_per_million,
    cached_input_audio_price_usd_per_million:
      entry.cached_input_audio_price_usd_per_million,
    output_text_price_usd_per_million: entry.output_text_price_usd_per_million,
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
    <div className="space-y-6" aria-label="Pengaturan harga AI">
      {/* Billing / Kurs Editor */}
      <Card className="border-border bg-card py-0">
        <CardHeader className="border-b border-border bg-muted/30 px-6 py-4">
          <CardTitle className="text-sm">Kurs USD ke IDR</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 max-w-sm">
            <label htmlFor="monitoring-billing-rate" className="sr-only">
              Kurs USD ke IDR
            </label>
            <Input
              id="monitoring-billing-rate"
              type="number"
              value={localRate}
              onChange={(e) => setLocalRate(Number(e.target.value))}
              className="min-h-11 w-40 rounded-lg text-xs font-semibold"
              min={1}
            />
            <Button
              type="button"
              onClick={handleSaveBilling}
              className="min-h-11 text-xs font-semibold"
            >
              Simpan Kurs
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-3 font-medium">
            Kurs aktif:{" "}
            <span className="text-foreground font-semibold">
              Rp {localRate.toLocaleString()}
            </span>{" "}
            per USD
          </p>
        </CardContent>
      </Card>

      {/* Pricing Editor */}
      <Card className="border-border bg-card py-0">
        <CardHeader className="border-b border-border bg-muted/30 px-6 py-4">
          <CardTitle className="text-sm">
            Harga per Model (USD / 1M tokens)
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Harga model AI</caption>
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
                <PricingRow
                  key={p.model_id}
                  entry={p}
                  onSave={handleSavePricing}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
