import { Fragment, useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { PricingEntry } from "./PricingTab";

const REALTIME_RATE_FIELDS = [
  ["input_text_price_usd_per_million", "Text input"],
  ["cached_input_text_price_usd_per_million", "Cached text input"],
  ["input_audio_price_usd_per_million", "Audio input"],
  ["cached_input_audio_price_usd_per_million", "Cached audio input"],
  ["output_text_price_usd_per_million", "Text output"],
  ["output_audio_price_usd_per_million", "Audio output"],
] as const;

type RealtimeRateField = (typeof REALTIME_RATE_FIELDS)[number][0];

function createDraft(entry: PricingEntry): PricingEntry {
  return { ...entry };
}

export function PricingRow({
  entry,
  onSave,
}: {
  entry: PricingEntry;
  onSave: (entry: PricingEntry) => void;
}) {
  const [draft, setDraft] = useState(() => createDraft(entry));
  const [editing, setEditing] = useState(false);
  const isRealtime = entry.pricing_mode === "realtime";
  const isHistorical =
    entry.historical === true ||
    entry.editable === false ||
    entry.model_id.startsWith("gpt-realtime-");

  useEffect(() => {
    if (!editing) setDraft(createDraft(entry));
  }, [editing, entry]);

  const updateRate = (field: RealtimeRateField, value: number) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const cancel = () => {
    setDraft(createDraft(entry));
    setEditing(false);
  };

  const save = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <Fragment>
      <tr className="hover:bg-foreground/[0.015] transition-colors">
        <td className="px-6 py-3.5">
          <span className="font-semibold text-foreground text-sm">
            {entry.model_name}
          </span>
          <span className="text-muted-foreground/60 ml-2 text-[10px] font-mono">
            {entry.model_id}
          </span>
          {isRealtime ? (
            <span className="ml-2 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
              {isHistorical ? "Riwayat (read-only)" : "6 rate"}
            </span>
          ) : null}
        </td>
        <td className="px-6 py-3.5">
          <span className="inline-flex rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground">
            {entry.provider}
          </span>
        </td>
        <td className="px-6 py-3.5 text-right">
          {editing && !isRealtime ? (
            <RateInput
              label={`${entry.model_name} input`}
              value={draft.input_price_usd_per_million}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  input_price_usd_per_million: value,
                }))
              }
            />
          ) : (
            <span className="font-semibold text-foreground">
              {entry.input_price_usd_per_million}
            </span>
          )}
        </td>
        <td className="px-6 py-3.5 text-right">
          {editing && !isRealtime ? (
            <RateInput
              label={`${entry.model_name} output`}
              value={draft.output_price_usd_per_million}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  output_price_usd_per_million: value,
                }))
              }
            />
          ) : (
            <span className="font-semibold text-foreground">
              {entry.output_price_usd_per_million}
            </span>
          )}
        </td>
        <td className="px-6 py-3.5 text-center">
          {editing && !isHistorical ? (
            <div className="flex justify-center gap-1.5">
              <Button
                type="button"
                onClick={save}
                className="min-h-11 px-3 text-[11px]"
              >
                Simpan
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                className="min-h-11 px-3 text-[11px]"
              >
                Batal
              </Button>
            </div>
          ) : isHistorical ? null : (
            <Button
              type="button"
              variant="secondary"
              aria-expanded={isRealtime ? editing : undefined}
              aria-controls={
                isRealtime
                  ? `pricing-rate-details-${entry.model_id}`
                  : undefined
              }
              onClick={() => setEditing(true)}
              className="min-h-11 px-3 text-[11px]"
            >
              Edit
            </Button>
          )}
        </td>
      </tr>
      {isRealtime && editing && !isHistorical ? (
        <tr
          id={`pricing-rate-details-${entry.model_id}`}
          className="bg-muted/15"
        >
          <td colSpan={5} className="px-6 pb-5 pt-2">
            <fieldset>
              <legend className="mb-3 text-xs font-semibold text-foreground">
                Rate modality dan cached (USD / 1M token)
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {REALTIME_RATE_FIELDS.map(([field, label]) => (
                  <label key={field} className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      {label}
                    </span>
                    <RateInput
                      label={`${entry.model_name} ${label}`}
                      value={draft[field] ?? 0}
                      onChange={(value) => updateRate(field, value)}
                      fullWidth
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function RateInput({
  label,
  value,
  onChange,
  fullWidth = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  fullWidth?: boolean;
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`min-h-11 rounded-lg border-input bg-background px-2 text-right text-xs font-semibold ${fullWidth ? "w-full" : "w-24"}`}
    />
  );
}
