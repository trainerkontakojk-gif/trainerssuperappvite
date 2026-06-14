import { Plus } from "lucide-react";
import type { AccessScopeOptions } from "@trainers/types";

type RuleType = "tim" | "service_type" | "batch_name" | "peserta_id";

interface RuleBuilderFormProps {
  scopeOptions: AccessScopeOptions | null;
  ruleType: RuleType;
  onRuleTypeChange: (val: RuleType) => void;
  ruleValue: string;
  onRuleValueChange: (val: string) => void;
  filterTeam: string;
  onFilterTeamChange: (val: string) => void;
  addingRule: boolean;
  onSubmit: (e: React.FormEvent) => void;
  getRuleValueLabel: (type: string, val: string) => string;
  ruleValueOptions: string[];
}

export function RuleBuilderForm({
  scopeOptions,
  ruleType,
  onRuleTypeChange,
  ruleValue,
  onRuleValueChange,
  filterTeam,
  onFilterTeamChange,
  addingRule,
  onSubmit,
  getRuleValueLabel,
  ruleValueOptions,
}: RuleBuilderFormProps) {
  if (!scopeOptions) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-5"
    >
      <div>
        <h5 className="text-[11px] font-bold text-primary uppercase tracking-[0.2em]">
          Tambah Aturan Baru
        </h5>
        <p className="text-xs text-muted-foreground mt-1">
          Kombinasikan kriteria untuk mempersempit skup data yang dapat diakses.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-[200px_1fr_auto]">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
            Tipe Aturan
          </label>
          <select
            value={ruleType}
            onChange={(e) => onRuleTypeChange(e.target.value as RuleType)}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
          >
            <option value="tim">Team</option>
            <option value="service_type">Service</option>
            <option value="peserta_id">Specific Agent</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
            {ruleType === "tim" ? "Pilih Team" : ruleType === "service_type" ? "Pilih Service" : "Pilih Name"}
          </label>
          {ruleType === "peserta_id" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={filterTeam}
                onChange={(e) => onFilterTeamChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
              >
                <option value="">Pilih Team terlebih dahulu</option>
                {(scopeOptions?.teams || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={ruleValue}
                onChange={(e) => onRuleValueChange(e.target.value)}
                disabled={!filterTeam}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {filterTeam
                    ? "Pilih Name"
                    : "Pilih Team terlebih dahulu"}
                </option>
                {ruleValueOptions.map((id) => (
                  <option key={id} value={id}>
                    {getRuleValueLabel("peserta_id", id)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={ruleValue}
              onChange={(e) => onRuleValueChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
            >
              <option value="">Pilih nilai...</option>
              {ruleType === "tim"
                ? (scopeOptions?.teams || []).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))
                : (scopeOptions?.services || []).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
            </select>
          )}
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={addingRule || !ruleValue}
            className="w-full sm:w-auto h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {addingRule ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Tambah Aturan
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium ml-1 italic">
        <div className="h-1 w-1 rounded-full bg-primary/40" />
        {ruleType === "peserta_id"
          ? "Aturan 'Specific Agent' memerlukan pemilihan Team untuk membatasi daftar nama yang ditampilkan."
          : "Pilih salah satu kriteria di atas untuk membatasi akses data Leader."}
      </div>
    </form>
  );
}
