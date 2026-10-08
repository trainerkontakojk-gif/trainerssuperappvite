import type { RuleVersion } from "@trainers/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RULE_STATUS_DOT, ruleVersionStatusLabel } from "../constants";

interface CommonProps {
  versions: RuleVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getPeriodLabel: (periodId: string) => string;
}

const createdFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function createdLabel(version: RuleVersion): string {
  return createdFormat.format(new Date(version.created_at));
}

/** Riwayat versi sebagai kolom kiri (≥lg). Satu baris = satu tombol utuh. */
export function RuleVersionList({
  versions,
  loading,
  selectedId,
  onSelect,
  getPeriodLabel,
}: CommonProps & { loading: boolean }) {
  return (
    <nav
      aria-label="Riwayat versi"
      className="hidden min-w-0 self-start rounded-lg border border-border bg-surface lg:block"
    >
      <h2 className="border-b border-border px-3 py-3 text-sm font-medium text-foreground">
        Riwayat versi
      </h2>
      {loading ? (
        <div className="space-y-2 p-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[56px] w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {versions.map((version) => {
            const selected = version.id === selectedId;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(version.id)}
                  className={`flex min-h-[44px] w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? "bg-muted" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-foreground">
                      v{version.version_number}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${RULE_STATUS_DOT[version.status]}`}
                      />
                      {ruleVersionStatusLabel(version.status)}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    Efektif {getPeriodLabel(version.effective_period_id)} · Dibuat{" "}
                    {createdLabel(version)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** Pilihan versi di mobile (<lg): menggantikan sidebar. */
export function RuleVersionSelect({
  versions,
  selectedId,
  onSelect,
  getPeriodLabel,
}: CommonProps) {
  const items = versions.map((version) => ({
    value: version.id,
    label: `v${version.version_number} · ${ruleVersionStatusLabel(version.status)} · Efektif ${getPeriodLabel(version.effective_period_id)}`,
  }));
  return (
    <div className="min-w-0 lg:hidden">
      <Label
        htmlFor="rule-version-select"
        className="mb-1.5 text-xs font-medium text-muted-foreground"
      >
        Versi
      </Label>
      <Select
        items={items}
        value={selectedId}
        onValueChange={(value) => {
          if (value !== null) onSelect(value);
        }}
      >
        <SelectTrigger
          id="rule-version-select"
          aria-label="Versi"
          className="!h-[44px] w-full min-w-0 rounded-lg border-border bg-background px-3 text-sm text-foreground hover:bg-muted/60"
        >
          <SelectValue placeholder="Pilih versi" />
        </SelectTrigger>
        <SelectContent align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
