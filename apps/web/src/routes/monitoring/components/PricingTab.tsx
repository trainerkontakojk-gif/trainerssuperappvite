import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { aiClient, unwrapResponse } from "../../../lib/api";
import type { PricingEntry as ApiPricingEntry } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { ConfirmDialog } from "../../dashboard/components/management/ConfirmDialog";
import { formatPricingDate, mapError } from "../utils/formatting";
import {
  PricingEditDialog,
  type PricingSaveRequest,
} from "./PricingEditDialog";
import { isHistoricalPricing, PricingRow } from "./PricingRow";

export type PricingEntry = ApiPricingEntry;

/** PUT body: only the rates, never display-only fields from GET. */
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

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  unknown: "Lainnya",
};
const COLUMN_COUNT = 7;

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
  const [editing, setEditing] = useState<PricingEntry | null>(null);
  const [cancelling, setCancelling] = useState<PricingEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  useEffect(() => {
    setLocalRate(billingRate);
  }, [billingRate]);

  const { groups, legacy } = useMemo(() => {
    const current = pricing.filter((entry) => !isHistoricalPricing(entry));
    const providerOf = (entry: PricingEntry) => entry.provider || "unknown";
    const providers = [...new Set(current.map(providerOf))];
    return {
      groups: providers.map((provider) => ({
        provider,
        label: PROVIDER_LABELS[provider] ?? provider,
        rows: current.filter((entry) => providerOf(entry) === provider),
      })),
      legacy: pricing.filter(isHistoricalPricing),
    };
  }, [pricing]);

  const handleSavePricing = async ({
    entry,
    effectiveFrom,
  }: PricingSaveRequest) => {
    setBusy(true);
    try {
      await unwrapResponse(
        await aiClient["monitoring/pricing"].$put({
          json: {
            ...buildPricingUpdatePayload(entry),
            ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
          },
        }),
      );
      notify.success(
        effectiveFrom ? "Harga baru dijadwalkan." : "Harga berhasil disimpan.",
      );
      setEditing(null);
      onRefresh();
    } catch (err) {
      notify.error("Gagal menyimpan harga.", mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSchedule = async () => {
    const id = cancelling?.next_price?.id;
    if (!id) return;
    setBusy(true);
    try {
      await unwrapResponse(
        await aiClient["monitoring/pricing/schedule/:id"].$delete({
          param: { id },
        }),
      );
      notify.success("Jadwal harga dibatalkan.");
      setCancelling(null);
      onRefresh();
    } catch (err) {
      notify.error("Gagal membatalkan jadwal.", mapError(err));
    } finally {
      setBusy(false);
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

  const renderRow = (entry: PricingEntry) => (
    <PricingRow
      key={entry.model_id}
      entry={entry}
      onEdit={setEditing}
      onCancelSchedule={setCancelling}
    />
  );

  return (
    <div className="space-y-6" aria-label="Pengaturan harga AI">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <label
          htmlFor="monitoring-billing-rate"
          className="w-36 text-sm font-semibold text-foreground"
        >
          Kurs USD ke IDR
        </label>
        <Input
          id="monitoring-billing-rate"
          type="number"
          value={localRate}
          onChange={(e) => setLocalRate(Number(e.target.value))}
          className="min-h-11 w-36 text-right tabular-nums"
          min={1}
        />
        <Button type="button" onClick={handleSaveBilling} className="min-h-11">
          Simpan kurs
        </Button>
        <p className="text-sm text-muted-foreground">
          Dipakai untuk panggilan AI berikutnya. Biaya yang sudah tercatat tidak
          dihitung ulang.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="pricing-table-title" className="text-sm font-semibold">
            Harga per model
          </h2>
          <span className="text-sm text-muted-foreground">
            USD per 1 juta token
          </span>
        </div>
        <div className="overflow-x-auto">
          <table
            aria-labelledby="pricing-table-title"
            className="w-full min-w-[56rem] text-sm"
          >
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 text-right font-medium">Input</th>
                <th className="px-4 py-2.5 text-right font-medium">Output</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Output gambar
                </th>
                <th className="px-4 py-2.5 font-medium">Harga berikutnya</th>
                <th className="px-4 py-2.5 text-right font-medium">Diubah</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.provider}>
                  <tr className="border-b border-border bg-muted/30">
                    <th
                      colSpan={COLUMN_COUNT}
                      scope="colgroup"
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map(renderRow)}
                </Fragment>
              ))}
              {legacy.length > 0 ? (
                <tr className="border-b border-border bg-muted/30">
                  <td colSpan={COLUMN_COUNT} className="px-2 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={showLegacy}
                      onClick={() => setShowLegacy((open) => !open)}
                      className="min-h-11 gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={`size-4 transition-transform ${showLegacy ? "rotate-90" : ""}`}
                      />
                      Model lama, hanya untuk riwayat ({legacy.length})
                    </Button>
                  </td>
                </tr>
              ) : null}
              {showLegacy ? legacy.map(renderRow) : null}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-sm text-muted-foreground">
        Harga output gambar diatur di kode dan hanya ditampilkan di sini. Model
        yang tidak ada di daftar tidak bisa disimpan.
      </p>

      <PricingEditDialog
        entry={editing}
        saving={busy}
        onClose={() => setEditing(null)}
        onSave={handleSavePricing}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setCancelling(null);
        }}
        title="Batalkan jadwal harga?"
        description={
          cancelling?.next_price
            ? `Harga ${cancelling.model_name} mulai ${formatPricingDate(cancelling.next_price.effective_from)} tidak akan dipakai. Harga sekarang tetap berlaku.`
            : ""
        }
        confirmLabel="Ya, batalkan"
        pending={busy}
        onConfirm={handleCancelSchedule}
      />
    </div>
  );
}
