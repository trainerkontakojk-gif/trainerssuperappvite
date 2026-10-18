import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { PricingEntry } from "./PricingTab";

const REALTIME_FIELDS = [
  ["input_text_price_usd_per_million", "Input teks"],
  ["cached_input_text_price_usd_per_million", "Input teks (cache)"],
  ["input_audio_price_usd_per_million", "Input audio"],
  ["cached_input_audio_price_usd_per_million", "Input audio (cache)"],
  ["output_text_price_usd_per_million", "Output teks"],
  ["output_audio_price_usd_per_million", "Output audio"],
] as const;
const SIMPLE_FIELDS = [
  ["input_price_usd_per_million", "Input"],
  ["output_price_usd_per_million", "Output"],
] as const;

type RateField =
  (typeof REALTIME_FIELDS)[number][0] | (typeof SIMPLE_FIELDS)[number][0];

/** Tomorrow in WIB as YYYY-MM-DD: the earliest day a price can be scheduled. */
function tomorrowWib(): string {
  return new Date(Date.now() + 7 * 3_600_000 + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export type PricingSaveRequest = {
  entry: PricingEntry;
  effectiveFrom?: string;
};

export function PricingEditDialog({
  entry,
  saving,
  onClose,
  onSave,
}: {
  entry: PricingEntry | null;
  saving: boolean;
  onClose: () => void;
  onSave: (request: PricingSaveRequest) => void;
}) {
  const [draft, setDraft] = useState<Record<RateField, string>>(
    {} as Record<RateField, string>,
  );
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate] = useState("");

  // Mulai dari harga yang berlaku setiap kali dialog dibuka.
  useEffect(() => {
    if (!entry) return;
    setDraft(
      Object.fromEntries(
        [...SIMPLE_FIELDS, ...REALTIME_FIELDS].map(([field]) => [
          field,
          String(entry[field] ?? 0),
        ]),
      ) as Record<RateField, string>,
    );
    setScheduled(false);
    setDate("");
  }, [entry]);

  if (!entry) return null;
  const fields =
    entry.pricing_mode === "realtime" ? REALTIME_FIELDS : SIMPLE_FIELDS;
  const values = fields.map(([field]) => Number(draft[field]));
  const invalid =
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    fields.some(([field]) => draft[field]?.trim() === "") ||
    (scheduled && date < tomorrowWib());

  const submit = () => {
    const rates = Object.fromEntries(
      fields.map(([field]) => [field, Number(draft[field])]),
    );
    onSave({
      entry: { ...entry, ...rates },
      effectiveFrom: scheduled ? date : undefined,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div className="grid gap-1">
          <DialogTitle className="font-display text-lg font-semibold">
            Ubah harga {entry.model_name}
          </DialogTitle>
          <DialogDescription>USD per 1 juta token</DialogDescription>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.map(([field, label]) => (
            <div key={field} className="grid gap-1.5">
              <Label htmlFor={`pricing-${field}`}>{label}</Label>
              <Input
                id={`pricing-${field}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft[field] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="min-h-11 text-right tabular-nums"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-1.5">
          <span id="pricing-effective-label" className="text-sm font-medium">
            Berlaku
          </span>
          <div
            role="radiogroup"
            aria-labelledby="pricing-effective-label"
            className="inline-flex w-fit gap-1 rounded-lg border border-border p-1"
          >
            {[
              [false, "Sekarang"],
              [true, "Mulai tanggal…"],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={scheduled === value}
                onClick={() => setScheduled(value as boolean)}
                className="min-h-9 rounded-md px-3 text-sm aria-checked:bg-foreground aria-checked:text-background"
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {scheduled ? (
          <div className="grid gap-1.5">
            <Label htmlFor="pricing-effective-date">
              Tanggal mulai (00.00 WIB)
            </Label>
            <Input
              id="pricing-effective-date"
              type="date"
              min={tomorrowWib()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="min-h-11"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
            className="min-h-11"
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={saving || invalid}
            onClick={submit}
            className="min-h-11"
          >
            {scheduled ? "Jadwalkan" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
