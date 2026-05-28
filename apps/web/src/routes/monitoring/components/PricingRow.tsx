import { useState } from "react";
import type { PricingEntry } from "./PricingTab";

export function PricingRow({
  entry,
  onSave,
}: {
  entry: PricingEntry;
  onSave: (e: PricingEntry) => void;
}) {
  const [input, setInput] = useState(entry.input_price_usd_per_million);
  const [output, setOutput] = useState(entry.output_price_usd_per_million);
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    onSave({
      ...entry,
      input_price_usd_per_million: input,
      output_price_usd_per_million: output,
    });
    setEditing(false);
  };

  return (
    <tr className="hover:bg-foreground/[0.015] transition-colors">
      <td className="px-6 py-3.5">
        <span className="font-semibold text-foreground text-sm">{entry.model_name}</span>
        <span className="text-muted-foreground/60 ml-2 text-[10px] font-mono">
          {entry.model_id}
        </span>
      </td>
      <td className="px-6 py-3.5">
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            entry.provider === "gemini"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
          }`}
        >
          {entry.provider}
        </span>
      </td>
      <td className="px-6 py-3.5 text-right">
        {editing ? (
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(Number(e.target.value))}
            className="h-8 w-24 px-2 bg-background border border-border rounded-md text-right text-xs font-semibold outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-semibold text-foreground">{input}</span>
        )}
      </td>
      <td className="px-6 py-3.5 text-right">
        {editing ? (
          <input
            type="number"
            value={output}
            onChange={(e) => setOutput(Number(e.target.value))}
            className="h-8 w-24 px-2 bg-background border border-border rounded-md text-right text-xs font-semibold outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-semibold text-foreground">{output}</span>
        )}
      </td>
      <td className="px-6 py-3.5 text-center">
        {editing ? (
          <div className="flex gap-1.5 justify-center">
            <button
              onClick={handleSave}
              className="h-8 px-3 bg-primary text-primary-foreground rounded-md text-[11px] font-semibold hover:bg-primary/90 transition-all cursor-pointer"
            >
              Simpan
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-8 px-3 bg-muted text-muted-foreground rounded-md text-[11px] font-semibold hover:bg-muted/80 transition-all cursor-pointer"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="h-8 px-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-md text-[11px] font-semibold transition-all cursor-pointer"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
