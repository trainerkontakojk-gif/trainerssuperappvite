import { Check, History, Pencil, Clock } from "lucide-react";
import type { RuleVersion } from "@trainers/types";

interface PublishRulePanelProps {
  selectedVersion: RuleVersion;
  getPeriodLabel: (periodId: string) => string;
  setShowAddForm: (show: boolean) => void;
  newThreshold?: string;
  setNewThreshold?: (val: string) => void;
  newSortOrder?: string;
  setNewSortOrder?: (val: string) => void;
}

export function PublishRulePanel({
  selectedVersion,
  getPeriodLabel,
  setShowAddForm,
  newThreshold,
  setNewThreshold,
  newSortOrder,
  setNewSortOrder,
}: PublishRulePanelProps) {
  if (selectedVersion.status === "published") {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex items-start gap-4">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Check className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-emerald-700 dark:text-emerald-400">
            Versi Aktif (Published) v{selectedVersion.version_number}
          </h2>
          <p className="text-sm text-emerald-600/80 font-medium leading-relaxed mt-1">
            Versi ini bersifat <strong>immutable</strong> dan digunakan untuk kalkulasi periode{" "}
            <strong>{getPeriodLabel(selectedVersion.effective_period_id)}</strong> dan seterusnya hingga ada versi baru.
          </p>
        </div>
      </div>
    );
  }

  if (selectedVersion.status === "superseded") {
    return (
      <div className="bg-muted border border-border rounded-3xl p-6 flex items-start gap-4">
        <div className="w-12 h-12 bg-foreground/5 rounded-2xl flex items-center justify-center flex-shrink-0">
          <History className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-black text-foreground/80">
            Versi Lama (Superseded) v{selectedVersion.version_number}
          </h2>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed mt-1">
            Versi ini telah digantikan oleh versi yang lebih baru. Data historis yang menggunakan versi ini tetap dipertahankan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Pencil className="w-6 h-6 text-amber-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-amber-700 dark:text-amber-400">
            Draft Rules v{selectedVersion.version_number}
          </h2>
          <p className="text-sm text-amber-600/80 font-medium leading-relaxed mt-1">
            Anda dapat mengubah parameter dan bobot pada draft ini. Publish draft ini untuk menjadikannya rule efektif mulai bulan tertentu.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-3 h-3 text-amber-600" />
            <span className="text-[10px] font-black uppercase text-amber-700">
              Target: {getPeriodLabel(selectedVersion.effective_period_id)}
            </span>
          </div>
        </div>
      </div>
      {setNewThreshold && setNewSortOrder && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Threshold</label>
            <input
              type="number"
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-muted-foreground px-1">Urutan (sort_order)</label>
            <input
              type="number"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none"
            />
          </div>
        </div>
      )}
      <button
        onClick={() => setShowAddForm(true)}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition"
      >
        Tambah Parameter
      </button>
    </div>
  );
}
