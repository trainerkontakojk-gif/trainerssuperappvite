import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import type { ScoringMode } from "@trainers/types";
import type { IndicatorFormState } from "../types";
import { parseIndicatorCategory } from "../utils";

interface EditIndicatorModalProps {
  initialForm: IndicatorFormState;
  scoringMode: ScoringMode;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: IndicatorFormState) => Promise<void>;
}

export function EditIndicatorModal({
  initialForm,
  scoringMode,
  saving,
  onClose,
  onSubmit,
}: EditIndicatorModalProps) {
  const [form, setForm] = useState<IndicatorFormState>(initialForm);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full max-w-lg rounded-2xl p-8 border border-border space-y-6"
      >
        <h2 className="font-outfit text-xl font-bold text-foreground flex items-center gap-3">
          <Pencil className="w-5 h-5 text-muted-foreground" /> Edit Parameter
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Nama Parameter</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Kategori</label>
              <select
                value={form.category}
                disabled={scoringMode === "no_category"}
                onChange={(e) => setForm({ ...form, category: parseIndicatorCategory(e.target.value) })}
                className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground cursor-pointer disabled:opacity-50"
              >
                <option value="non_critical">Non-Critical</option>
                <option value="critical">Critical</option>
                {scoringMode === "no_category" && <option value="none">Semua Parameter</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Bobot (%)</label>
              <input
                type="number"
                value={form.bobot}
                onChange={(e) => setForm({ ...form, bobot: e.target.value })}
                className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder="0"
                className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Urutan (sort_order)</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                placeholder="0"
                className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, has_na: !form.has_na })}
            className="flex items-center gap-3 py-1 cursor-pointer"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bisa N/A</span>
            <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-all ${form.has_na ? "bg-foreground" : "bg-muted"}`}>
              <div className={`w-4 h-4 bg-background rounded-full transition-transform ${form.has_na ? "translate-x-4" : ""}`} />
            </div>
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(form)}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-3 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
          >
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-transparent border border-border hover:bg-muted text-muted-foreground rounded-xl text-xs font-semibold uppercase tracking-wide transition"
          >
            Batal
          </button>
        </div>
      </motion.div>
    </div>
  );
}
