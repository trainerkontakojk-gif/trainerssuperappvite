import { Check, History, Pencil, Clock } from "lucide-react";
import type { RuleVersion } from "@trainers/types";

interface PublishRulePanelProps {
  selectedVersion: RuleVersion;
  getPeriodLabel: (periodId: string) => string;
  setShowAddForm: (show: boolean) => void;
}

export function PublishRulePanel({
  selectedVersion,
  getPeriodLabel,
  setShowAddForm,
}: PublishRulePanelProps) {
  if (selectedVersion.status === "published") {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-2xl p-6 flex items-start gap-4">
        <div className="w-10 h-10 bg-background border border-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Check className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
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
      <div className="bg-muted/50 border border-border rounded-2xl p-6 flex items-start gap-4">
        <div className="w-10 h-10 bg-background border border-border rounded-lg flex items-center justify-center flex-shrink-0">
          <History className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground/80">
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
    <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-6 flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-background border border-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Pencil className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-amber-700 dark:text-amber-400">
            Draft Rules v{selectedVersion.version_number}
          </h2>
          <p className="text-sm text-amber-600/80 font-medium leading-relaxed mt-1">
            Anda dapat mengubah parameter dan bobot pada draft ini. Publish draft ini untuk menjadikannya rule efektif mulai bulan tertentu.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-3.5 h-3.5 text-amber-650" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Target: {getPeriodLabel(selectedVersion.effective_period_id)}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={() => setShowAddForm(true)}
        className="px-4 py-2 bg-foreground hover:opacity-90 text-background rounded-lg text-[10px] font-semibold uppercase tracking-wide shrink-0 transition"
      >
        Tambah Parameter
      </button>
    </div>
  );
}
