import { useId } from "react";
import { Plus } from "lucide-react";
import type { AccessScopeOptions } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";

type RuleType = "tim" | "service_type" | "batch_name" | "peserta_id";

interface TeamRuleOptionGroup {
  team: string;
  options: {
    value: string;
    label: string;
    kind: "team" | "batch";
  }[];
}

interface RuleBuilderFormProps {
  scopeOptions: AccessScopeOptions | null;
  ruleType: RuleType;
  onRuleTypeChange: (val: RuleType) => void;
  ruleValue: string;
  onRuleValueChange: (val: string) => void;
  filterTeam: string;
  onFilterTeamChange: (val: string) => void;
  teamRuleOptionGroups: TeamRuleOptionGroup[];
  addingRule: boolean;
  onSubmit: (e: React.FormEvent) => void;
  getRuleValueLabel: (type: string, val: string) => string;
  ruleValueOptions: string[];
}

// `<select>` native dipertahankan karena butuh `<optgroup>` untuk tim → batch.
const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 dark:bg-input/30";

const HINTS: Record<RuleType, string> = {
  tim: "Pilih tim untuk semua subfolder-nya, atau satu subfolder (batch) di bawahnya.",
  service_type: "Leader melihat semua peserta pada layanan ini.",
  peserta_id: "Pilih tim dulu untuk menampilkan daftar agen.",
  batch_name: "",
};

export function RuleBuilderForm({
  scopeOptions,
  ruleType,
  onRuleTypeChange,
  ruleValue,
  onRuleValueChange,
  filterTeam,
  onFilterTeamChange,
  teamRuleOptionGroups,
  addingRule,
  onSubmit,
  getRuleValueLabel,
  ruleValueOptions,
}: RuleBuilderFormProps) {
  const typeId = useId();
  const valueId = useId();
  const teamId = useId();
  const hintId = useId();

  if (!scopeOptions) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 border-t border-border pt-5"
      aria-label="Tambah aturan"
    >
      <h3 className="text-sm font-semibold text-foreground">Tambah aturan</h3>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={typeId} className="text-xs text-muted-foreground">
            Jenis
          </Label>
          <select
            id={typeId}
            value={ruleType}
            onChange={(e) => onRuleTypeChange(e.target.value as RuleType)}
            className={SELECT_CLASS}
          >
            <option value="tim">Tim</option>
            <option value="service_type">Layanan</option>
            <option value="peserta_id">Agen tertentu</option>
          </select>
        </div>

        {ruleType === "peserta_id" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={teamId} className="text-xs text-muted-foreground">
                Tim
              </Label>
              <select
                id={teamId}
                value={filterTeam}
                onChange={(e) => onFilterTeamChange(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Pilih tim</option>
                {scopeOptions.teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor={valueId}
                className="text-xs text-muted-foreground"
              >
                Agen
              </Label>
              <select
                id={valueId}
                value={ruleValue}
                onChange={(e) => onRuleValueChange(e.target.value)}
                disabled={!filterTeam}
                aria-describedby={hintId}
                className={SELECT_CLASS}
              >
                <option value="">
                  {filterTeam ? "Pilih agen" : "Pilih tim dulu"}
                </option>
                {ruleValueOptions.map((id) => (
                  <option key={id} value={id}>
                    {getRuleValueLabel("peserta_id", id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={valueId} className="text-xs text-muted-foreground">
              {ruleType === "tim" ? "Tim atau batch" : "Layanan"}
            </Label>
            <select
              id={valueId}
              value={ruleValue}
              onChange={(e) => onRuleValueChange(e.target.value)}
              aria-describedby={hintId}
              className={SELECT_CLASS}
            >
              <option value="">Pilih nilai</option>
              {ruleType === "tim"
                ? teamRuleOptionGroups.map((group) => (
                    <optgroup key={group.team} label={group.team}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : scopeOptions.services.map((service) => (
                    <option key={service.value} value={service.value}>
                      {service.label}
                    </option>
                  ))}
            </select>
          </div>
        )}

        <Button
          type="submit"
          className="h-11 sm:h-9"
          disabled={addingRule || !ruleValue}
        >
          <Plus aria-hidden="true" />
          Tambah
        </Button>
      </div>

      <p id={hintId} className="text-xs text-muted-foreground">
        {HINTS[ruleType]}
      </p>
    </form>
  );
}
