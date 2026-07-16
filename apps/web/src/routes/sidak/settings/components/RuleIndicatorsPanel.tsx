import { Info, GitBranch, Pencil, Trash2 } from "lucide-react";
import type { RuleVersion, QARuleIndicator } from "@trainers/types";
import { CAT_COLOR, CAT_LABEL } from "../constants";

interface RuleIndicatorsPanelProps {
  loadingIndicators: boolean;
  draftIndicators: QARuleIndicator[];
  publishedWhenDraftEmpty: RuleVersion | null | undefined;
  selectedVersion: RuleVersion;
  isDraft: boolean;
  handleCreateDraft: (sourceId?: string) => Promise<void>;
  handleDeleteIndicator: (id: string) => Promise<void>;
  onEditIndicator: (indicator: QARuleIndicator) => void;
}

interface IndicatorRowProps {
  indicator: QARuleIndicator;
  selectedVersion: RuleVersion;
  showEffectiveWeight: boolean;
  isDraft: boolean;
  onEditIndicator: (indicator: QARuleIndicator) => void;
  handleDeleteIndicator: (id: string) => Promise<void>;
}

function IndicatorRow({
  indicator,
  selectedVersion,
  showEffectiveWeight,
  isDraft,
  onEditIndicator,
  handleDeleteIndicator,
}: IndicatorRowProps) {
  const categoryWeight =
    indicator.category === "critical"
      ? selectedVersion.critical_weight
      : selectedVersion.non_critical_weight;
  const effectiveWeight = indicator.bobot * categoryWeight;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="w-14 flex-shrink-0 text-center">
          <span
            className={`inline-flex min-w-12 justify-center rounded-lg border px-2 py-1 text-[10px] font-semibold tabular-nums ${CAT_COLOR[indicator.category] || CAT_COLOR.none}`}
            title={
              showEffectiveWeight
                ? `${Math.round(indicator.bobot * 100)}% dari kategori`
                : "Bobot parameter"
            }
          >
            {Math.round(indicator.bobot * 100)}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {indicator.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${CAT_COLOR[indicator.category] || CAT_COLOR.none}`}
            >
              {CAT_LABEL[indicator.category]
                ? CAT_LABEL[indicator.category].replace(" Error", "")
                : indicator.category}
            </span>
            {showEffectiveWeight && (
              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                Bobot akhir {Math.round(effectiveWeight * 100)}%
              </span>
            )}
            {indicator.has_na && (
              <span className="rounded-md border border-border bg-foreground/5 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                N/A
              </span>
            )}
            {indicator.sort_order != null && indicator.sort_order > 0 && (
              <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
                #{indicator.sort_order}
              </span>
            )}
            {indicator.threshold != null && (
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">
                Th: {indicator.threshold}
              </span>
            )}
            {indicator.legacy_indicator_id && (
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                Linked
              </span>
            )}
          </div>
        </div>
      </div>
      {isDraft && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEditIndicator(indicator)}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Edit ${indicator.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteIndicator(indicator.id)}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            aria-label={`Hapus ${indicator.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function RuleIndicatorsPanel({
  loadingIndicators,
  draftIndicators,
  publishedWhenDraftEmpty,
  selectedVersion,
  isDraft,
  handleCreateDraft,
  handleDeleteIndicator,
  onEditIndicator,
}: RuleIndicatorsPanelProps) {
  const isSlik = selectedVersion.service_type === "slik";
  const categories = (
    [
      [
        "non_critical",
        "Non Critical Error",
        selectedVersion.non_critical_weight,
      ],
      ["critical", "Critical Error", selectedVersion.critical_weight],
    ] as const
  ).map(([category, label, weight]) => ({
    category,
    label,
    weight,
    indicators: draftIndicators.filter((item) => item.category === category),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 px-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Daftar Parameter
          </h3>
          {isSlik && draftIndicators.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Bobot item dinilai di dalam kategori; bobot akhir mengikuti porsi
              Non Critical 40% dan Critical 60%.
            </p>
          )}
        </div>
        {isSlik && draftIndicators.length > 0 && (
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {
              new Set(
                draftIndicators.map(
                  (item) => item.parameter_group || item.name,
                ),
              ).size
            }{" "}
            parameter · {draftIndicators.length} item penilaian
          </span>
        )}
      </div>

      {loadingIndicators ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      ) : draftIndicators.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <Info className="mx-auto h-12 w-12 text-muted-foreground/20" />
          <p className="mt-4 text-sm font-semibold text-muted-foreground">
            Belum ada parameter di versi ini.
          </p>
          {publishedWhenDraftEmpty && (
            <div className="mt-4 inline-flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-xs text-amber-600/80">
                Versi published{" "}
                <span className="font-semibold">
                  v{publishedWhenDraftEmpty.version_number}
                </span>{" "}
                sudah memiliki parameter.
              </p>
              <button
                type="button"
                onClick={() => handleCreateDraft(publishedWhenDraftEmpty.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-background transition hover:opacity-90"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Create Revision dari Published
              </button>
            </div>
          )}
        </div>
      ) : isSlik ? (
        <div className="space-y-4">
          {categories.map((section) => {
            const parentGroups = new Map<string, QARuleIndicator[]>();
            for (const indicator of section.indicators) {
              const parent = indicator.parameter_group || indicator.name;
              const current = parentGroups.get(parent) ?? [];
              current.push(indicator);
              parentGroups.set(parent, current);
            }

            return (
              <section
                key={section.category}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div className="flex items-center justify-between border-b border-border bg-muted/25 px-4 py-3 lg:px-6">
                  <h4 className="text-sm font-semibold text-foreground">
                    {section.label}
                  </h4>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    Porsi akhir {Math.round(section.weight * 100)}%
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {Array.from(parentGroups.entries()).map(
                    ([parent, indicators]) => {
                      const hasSubParameters = indicators.some((indicator) =>
                        Boolean(indicator.parameter_group),
                      );
                      return (
                        <div key={parent}>
                          {hasSubParameters && (
                            <div className="border-b border-border/70 bg-background/40 px-4 py-2.5 lg:px-6">
                              <p className="text-xs font-semibold text-foreground">
                                {parent}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {indicators.length} sub-parameter
                              </p>
                            </div>
                          )}
                          <div className="divide-y divide-border/70">
                            {indicators.map((indicator) => (
                              <IndicatorRow
                                key={indicator.id}
                                indicator={indicator}
                                selectedVersion={selectedVersion}
                                showEffectiveWeight
                                isDraft={isDraft}
                                onEditIndicator={onEditIndicator}
                                handleDeleteIndicator={handleDeleteIndicator}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {draftIndicators.map((indicator) => (
            <IndicatorRow
              key={indicator.id}
              indicator={indicator}
              selectedVersion={selectedVersion}
              showEffectiveWeight={false}
              isDraft={isDraft}
              onEditIndicator={onEditIndicator}
              handleDeleteIndicator={handleDeleteIndicator}
            />
          ))}
        </div>
      )}
    </div>
  );
}
