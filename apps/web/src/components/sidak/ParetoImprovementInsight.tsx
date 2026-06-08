import { Target } from "lucide-react";
import type { ParetoImprovementInsightModel } from "./pareto-view-model";

interface Props {
  insight: ParetoImprovementInsightModel | null;
  serviceLabel?: string;
}

export default function ParetoImprovementInsight({ insight, serviceLabel }: Props) {
  if (!insight) return null;

  const visibleFocusItems = insight.focusItems.slice(0, 3);
  const remainingCount = Math.max(0, insight.focusItems.length - visibleFocusItems.length);
  const isSingleDominant = insight.focusItems.length === 1;
  const serviceSuffix = serviceLabel ? ` pada layanan ${serviceLabel}` : "";

  return (
    <section
      aria-labelledby="pareto-insight-title"
      className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
          <Target className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3
            id="pareto-insight-title"
            className="text-sm font-semibold text-foreground"
          >
            Insight Fokus Perbaikan
          </h3>

          <p className="text-sm leading-6 text-muted-foreground break-words">
            {isSingleDominant ? (
              <>
                Prioritaskan{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{insight.primary.name}&rdquo;
                </span>
                . Parameter ini sendiri menyumbang{" "}
                <span className="font-semibold text-foreground">
                  {insight.primary.share}%
                </span>{" "}
                temuan{serviceSuffix}, berdasarkan data Pareto.
              </>
            ) : (
              <>
                Prioritaskan{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{insight.primary.name}&rdquo;
                </span>
                . Parameter ini menyumbang{" "}
                <span className="font-semibold text-foreground">
                  {insight.primary.count} dari {insight.totalCount} temuan
                </span>{" "}
                ({insight.primary.share}%). Fokus pada{" "}
                <span className="font-semibold text-foreground">
                  {insight.focusItems.length} parameter teratas
                </span>{" "}
                untuk menangani{" "}
                <span className="font-semibold text-foreground">
                  {insight.focusShare}% temuan
                </span>
                {serviceSuffix}, berdasarkan data Pareto.
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {visibleFocusItems.map((item) => (
              <span
                key={item.name}
                className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-foreground"
              >
                {item.name}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="text-xs text-muted-foreground">
                +{remainingCount} parameter lainnya
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
