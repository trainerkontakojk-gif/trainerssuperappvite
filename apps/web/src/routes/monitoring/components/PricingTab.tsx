import { useState } from "react";
import { putApi, postApi } from "../../../hooks/useApi";
import { notify } from "../../../lib/toast";
import { PricingRow } from "./PricingRow";
import { mapError } from "../utils/formatting";

export type PricingEntry = {
  model_id: string;
  model_name: string;
  provider: string;
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
};

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

  const handleSavePricing = async (entry: PricingEntry) => {
    try {
      await putApi("/ai/monitoring/pricing", entry);
      notify.success("Harga berhasil disimpan.");
      onRefresh();
    } catch (err) {
      notify.error("Gagal menyimpan harga.", mapError(err));
    }
  };

  const handleSaveBilling = async () => {
    try {
      await postApi("/ai/monitoring/billing", {
        usd_to_idr_rate: localRate,
      });
      onBillingRateChange(localRate);
      notify.success("Kurs berhasil disimpan.");
    } catch (err) {
      notify.error("Gagal menyimpan kurs.", mapError(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Billing / Kurs Editor */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
          <h2 className="text-sm font-black tracking-tight">
            Kurs USD ke IDR
          </h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 max-w-sm">
            <input
              type="number"
              value={localRate}
              onChange={(e) => setLocalRate(Number(e.target.value))}
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              min={1}
            />
            <button
              onClick={handleSaveBilling}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
            >
              Simpan
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Kurs aktif: Rp {localRate.toLocaleString()} per USD
          </p>
        </div>
      </div>

      {/* Pricing Editor */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border bg-foreground/[0.02]">
          <h2 className="text-sm font-black tracking-tight">
            Harga per Model (USD / 1M tokens)
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-foreground/[0.02] border-b border-border">
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                Model
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                Provider
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                Input ($/jt)
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest opacity-40">
                Output ($/jt)
              </th>
              <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest opacity-40">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pricing.map((p) => (
              <PricingRow key={p.model_id} entry={p} onSave={handleSavePricing} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
