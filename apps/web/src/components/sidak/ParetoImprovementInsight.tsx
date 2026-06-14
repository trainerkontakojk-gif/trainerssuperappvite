import type { ReactNode } from "react";
import type { ParetoImprovementInsightModel } from "./pareto-view-model";

interface Props {
  insight: ParetoImprovementInsightModel | null;
  serviceLabel?: string;
}

function Emphasis({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-fg">{children}</span>;
}

export default function ParetoImprovementInsight({
  insight,
  serviceLabel,
}: Props) {
  if (!insight) return null;

  const visibleFocusItems = insight.focusItems.slice(0, 3);
  const remainingCount = Math.max(
    0,
    insight.focusItems.length - visibleFocusItems.length,
  );
  const isSingleDominant = insight.focusItems.length === 1;
  const serviceSuffix = serviceLabel ? ` pada layanan ${serviceLabel}` : "";

  return (
    <section
      aria-labelledby="pareto-insight-title"
      data-testid="pareto-improvement-insight"
      className="mt-4 rounded-2xl border border-border bg-surface px-5 py-4"
    >
      <h3
        id="pareto-insight-title"
        className="font-outfit text-sm font-bold tracking-tight text-fg"
      >
        Insight Fokus Perbaikan
      </h3>

      <p className="mt-2 text-sm leading-6 text-fg2 break-words">
        {isSingleDominant ? (
          <>
            Prioritaskan{" "}
            <Emphasis>&ldquo;{insight.primary.name}&rdquo;</Emphasis>. Parameter
            ini sendiri menyumbang{" "}
            <Emphasis>{insight.primary.share}%</Emphasis> temuan
            {serviceSuffix}, berdasarkan data Pareto.
          </>
        ) : (
          <>
            Prioritaskan{" "}
            <Emphasis>&ldquo;{insight.primary.name}&rdquo;</Emphasis>. Parameter
            ini menyumbang{" "}
            <Emphasis>
              {insight.primary.count} dari {insight.totalCount} temuan
            </Emphasis>{" "}
            ({insight.primary.share}%). Fokus pada{" "}
            <Emphasis>{insight.focusItems.length} parameter teratas</Emphasis>{" "}
            untuk menangani <Emphasis>{insight.focusShare}% temuan</Emphasis>
            {serviceSuffix}, berdasarkan data Pareto.
          </>
        )}
      </p>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-fg3">
          Parameter prioritas
        </p>
        <ul className="mt-2 space-y-2">
          {visibleFocusItems.map((item) => (
            <li
              key={item.name}
              className="border-l-2 border-border py-1 pl-3 text-sm leading-6 text-fg break-words"
            >
              {item.name}
            </li>
          ))}
        </ul>
        {remainingCount > 0 && (
          <p className="mt-2 text-sm text-fg3">
            +{remainingCount} parameter lainnya
          </p>
        )}
      </div>
    </section>
  );
}
