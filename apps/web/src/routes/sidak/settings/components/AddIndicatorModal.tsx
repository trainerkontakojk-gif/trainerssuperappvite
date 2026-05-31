import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { ScoringMode } from "@trainers/types";
import type { IndicatorFormState } from "../types";
import { createEmptyIndicatorForm, parseIndicatorCategory } from "../utils";

interface AddIndicatorModalProps {
  scoringMode: ScoringMode;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: IndicatorFormState) => Promise<void>;
}

export function AddIndicatorModal({
  scoringMode,
  saving,
  onClose,
  onSubmit,
}: AddIndicatorModalProps) {
  const [form, setForm] = useState<IndicatorFormState>(createEmptyIndicatorForm());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl space-y-6"
      >
        <h2 className="text-xl font-black text-foreground uppercase tracking-widest flex items-center gap-3">
          <Plus className="w-6 h-6 text-primary" /> Tambah Parameter
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Nama Parameter</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Masukkan nama parameter..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Kategori</label>
              <select
                value={form.category}
                disabled={scoringMode === "no_category"}
                onChange={(e) => setForm({ ...form, category: parseIndicatorCategory(e.target.value) })}
                className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none disabled:opacity-50"
              >
                <option value="non_critical">Non-Critical</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Bobot (%)</label>
              <input
                type="number"
                value={form.bobot}
                onChange={(e) => setForm({ ...form, bobot: e.target.value })}
                className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Urutan (sort_order)</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => setForm({ ...form, has_na: !form.has_na })}
            className={`flex items-center justify-between w-full p-4 rounded-2xl border transition-all ${
              form.has_na ? "bg-primary/10 border-primary/30" : "bg-foreground/5 border-border"
            }`}
          >
            <span className="text-xs font-black uppercase tracking-widest opacity-70">Bisa N/A</span>
            <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-all ${form.has_na ? "bg-primary" : "bg-foreground/20"}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${form.has_na ? "translate-x-4" : ""}`} />
            </div>
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(form)}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Tambah Parameter"}
          </button>
          <button onClick={onClose} className="px-8 py-4 bg-foreground/5 text-muted-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-foreground/10 transition">
            Batal
          </button>
        </div>
      </motion.div>
    </div>
  );
}
