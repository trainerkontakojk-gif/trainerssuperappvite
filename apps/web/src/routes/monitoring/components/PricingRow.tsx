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
    <tr className="hover:bg-foreground/[0.02] transition-colors">
      <td className="px-6 py-4">
        <span className="font-bold text-sm">{entry.model_name}</span>
        <span className="text-muted-foreground ml-2 text-[10px] font-mono">
          {entry.model_id}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${
            entry.provider === "gemini"
              ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
          }`}
        >
          {entry.provider}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        {editing ? (
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-background border border-border rounded-lg text-right text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-bold">{input}</span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        {editing ? (
          <input
            type="number"
            value={output}
            onChange={(e) => setOutput(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-background border border-border rounded-lg text-right text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            step={0.01}
          />
        ) : (
          <span className="font-bold">{output}</span>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        {editing ? (
          <div className="flex gap-1.5 justify-center">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            >
              Simpan
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-muted/80 transition-all"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
