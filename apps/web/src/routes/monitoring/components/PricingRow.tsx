import { Fragment, useEffect, useState } from "react";
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
              <button
                type="button"
                onClick={save}
                className="h-8 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={cancel}
                className="h-8 rounded-md bg-muted px-3 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80"
              >
                Batal
              </button>
            </div>
          ) : isHistorical ? null : (
            <button
              type="button"
              aria-expanded={isRealtime ? false : undefined}
              onClick={() => setEditing(true)}
              className="h-8 rounded-md bg-secondary px-3 text-[11px] font-semibold text-foreground hover:bg-secondary/80"
            >
              Edit
            </button>
          )}
        </td>
      </tr>
      {isRealtime && editing && !isHistorical ? (
        <tr className="bg-muted/15">
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
    <input
      aria-label={label}
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`h-8 rounded-md border border-border bg-background px-2 text-right text-xs font-semibold outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary/30 ${fullWidth ? "w-full" : "w-24"}`}
    />
  );
}
