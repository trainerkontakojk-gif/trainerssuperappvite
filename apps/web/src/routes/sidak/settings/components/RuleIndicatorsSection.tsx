import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import type { QARuleIndicator, RuleVersion } from "@trainers/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CAT_DOT, CAT_LABEL } from "../constants";

interface RuleIndicatorsSectionProps {
  version: RuleVersion;
  indicators: QARuleIndicator[];
  loading: boolean;
  isDraft: boolean;
  /** Versi berlaku yang dapat dijadikan dasar revisi saat draft masih kosong. */
  publishedForRevision: RuleVersion | null;
  onAdd: () => void;
  onEdit: (indicator: QARuleIndicator) => void;
  onDelete: (indicator: QARuleIndicator) => void;
  onCreateRevision: (sourceId: string) => void;
}

const iconButton = "h-[44px] w-[44px] text-muted-foreground hover:text-foreground";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function indicatorMeta(
  indicator: QARuleIndicator,
  finalWeight: number | null,
): string {
  return [
    finalWeight !== null ? `Bobot akhir ${percent(finalWeight)}` : null,
    indicator.has_na ? "N/A diizinkan" : null,
    indicator.sort_order != null && indicator.sort_order > 0
      ? `Urutan #${indicator.sort_order}`
      : null,
    indicator.threshold != null ? `Ambang ${indicator.threshold}` : null,
    indicator.legacy_indicator_id ? "Tertaut ke parameter lama" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function IndicatorRow({
  indicator,
  finalWeight,
  isDraft,
  onEdit,
  onDelete,
}: {
  indicator: QARuleIndicator;
  finalWeight: number | null;
  isDraft: boolean;
  onEdit: (indicator: QARuleIndicator) => void;
  onDelete: (indicator: QARuleIndicator) => void;
}) {
  const meta = indicatorMeta(indicator, finalWeight);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-foreground">
          {indicator.name}
        </p>
        {meta && <p className="text-[12px] text-muted-foreground">{meta}</p>}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
        {percent(indicator.bobot)}
      </span>
      {isDraft && (
        <div className="flex shrink-0">
          <Button
            type="button"
            variant="ghost"
            className={iconButton}
            aria-label={`Edit ${indicator.name}`}
            onClick={() => onEdit(indicator)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`${iconButton} hover:bg-destructive/10 hover:text-destructive`}
            aria-label={`Hapus ${indicator.name}`}
            onClick={() => onDelete(indicator)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      )}
    </li>
  );
}

export function RuleIndicatorsSection({
  version,
  indicators,
  loading,
  isDraft,
  publishedForRevision,
  onAdd,
  onEdit,
  onDelete,
  onCreateRevision,
}: RuleIndicatorsSectionProps) {
  const isSlik = version.service_type === "slik";
  const weighted = version.scoring_mode !== "no_category";
  const categoryWeight = (category: QARuleIndicator["category"]) =>
    category === "critical"
      ? version.critical_weight
      : category === "non_critical"
        ? version.non_critical_weight
        : null;

  const groups = (
    weighted ? (["non_critical", "critical"] as const) : (["none"] as const)
  ).map((category) => ({
    category,
    weight: weighted ? categoryWeight(category) : null,
    items: indicators.filter((item) =>
      weighted ? item.category === category : true,
    ),
  }));

  const parentCount = new Set(
    indicators.map((item) => item.parameter_group || item.name),
  ).size;

  return (
    <section aria-labelledby="parameter-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="parameter-heading"
            className="text-base font-semibold text-foreground"
          >
            Parameter{loading ? "" : ` (${indicators.length})`}
          </h3>
          {isSlik && indicators.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {parentCount} parameter · {indicators.length} item penilaian. Bobot
              item dinilai di dalam kategori; bobot akhir mengikuti porsi
              Non-critical {percent(version.non_critical_weight)} dan Critical{" "}
              {percent(version.critical_weight)}.
            </p>
          )}
        </div>
        {isDraft && (
          <Button type="button" className="h-[44px] px-4" onClick={onAdd}>
            <Plus aria-hidden="true" />
            Tambah parameter
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[48px] w-full" />
          ))}
        </div>
      ) : indicators.length === 0 ? (
        <div className="space-y-3 border-t border-border py-6">
          <p className="text-sm text-muted-foreground">
            Belum ada parameter di versi ini.
          </p>
          {publishedForRevision && (
            <Button
              type="button"
              variant="outline"
              className="h-[44px] px-4"
              onClick={() => onCreateRevision(publishedForRevision.id)}
            >
              <GitBranch aria-hidden="true" />
              Buat revisi dari versi berlaku
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const parents = new Map<string, QARuleIndicator[]>();
            for (const item of group.items) {
              const key = item.parameter_group || "";
              parents.set(key, [...(parents.get(key) ?? []), item]);
            }
            const headingId = `grup-${group.category}`;
            return (
              <section
                key={group.category}
                aria-labelledby={headingId}
                className="border-t border-border pt-3"
              >
                <h4
                  id={headingId}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${CAT_DOT[group.category]}`}
                  />
                  {CAT_LABEL[group.category]}
                  {group.weight !== null && ` · ${percent(group.weight)}`}
                </h4>
                {group.items.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Belum ada parameter di kategori ini.
                  </p>
                ) : (
                  Array.from(parents.entries()).map(([parent, items]) => (
                    <div key={parent || "tanpa-grup"} className="mt-2">
                      {parent && (
                        <p className="mt-2 text-sm font-medium text-muted-foreground">
                          {parent}
                        </p>
                      )}
                      <ul className="divide-y divide-border">
                        {items.map((item) => (
                          <IndicatorRow
                            key={item.id}
                            indicator={item}
                            finalWeight={
                              isSlik && group.weight !== null
                                ? item.bobot * group.weight
                                : null
                            }
                            isDraft={isDraft}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
