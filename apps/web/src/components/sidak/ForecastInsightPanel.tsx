import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  SidakBatchForecastSnapshot,
  SidakForecastSummary,
} from "@trainers/types";
import {
  parseForecastInsightText,
  type ForecastInsightListItem,
  type ForecastInsightSection,
} from "./forecast-insight-parser";

interface Props {
  forecastResult: SidakBatchForecastSnapshot;
  summary: SidakForecastSummary;
  horizonMonths: number;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function confidenceLabel(confidence: SidakForecastSummary["confidence"]) {
  if (confidence === "high") return "Tinggi";
  if (confidence === "medium") return "Sedang";
  return "Rendah";
}
function confidenceBadgeClass(confidence: SidakForecastSummary["confidence"]) {
  if (confidence === "high") {
    return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
  }
  if (confidence === "medium") {
    return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
  }
  return "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400";
}


function directionMeta(direction: SidakForecastSummary["direction"]) {
  if (direction === "down") {
    return {
      label: "Menurun",
      icon: TrendingDown,
      valueTone: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (direction === "up") {
    return {
      label: "Meningkat",
      icon: TrendingUp,
      valueTone: "text-rose-600 dark:text-rose-400",
    };
  }
  return {
    label: "Stabil",
    icon: Activity,
    valueTone: "text-fg",
  };
}

function changeToneClass(tone: ForecastInsightListItem["tone"]) {
  if (tone === "risk") return "border-l-rose-500";
  if (tone === "positive") return "border-l-emerald-500";
  return "border-l-border";
}

function ListItemRow({ item }: { item: ForecastInsightListItem }) {
  return (
    <li
      className={`border-l-2 py-2 pl-3 text-sm leading-6 text-fg2 ${changeToneClass(item.tone)}`}
    >
      {renderInlineMarkdown(item.text)}
    </li>
  );
}

function SectionBlock({ section }: { section: ForecastInsightSection }) {
  if (section.kind === "disclaimer") {
    return (
      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-fg3">
          {section.title}
        </p>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mt-2 text-sm leading-6 text-fg3 text-justify">
            {renderInlineMarkdown(paragraph)}
          </p>
        ))}
      </div>
    );
  }

  if (section.kind === "actions" && section.actions.length > 0) {
    return (
      <div className="space-y-3">
        <h4 className="font-outfit text-sm font-bold tracking-tight text-fg">
          {section.title}
        </h4>
        <ol className="space-y-4">
          {section.actions.map((action) => (
            <li
              key={action.index}
              className="border-l-2 border-border pl-4"
            >
              <p className="text-sm font-semibold text-fg">
                <span className="mr-2 tabular-nums text-fg3">
                  {action.index}.
                </span>
                {action.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-fg2 text-justify">{action.body}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (section.kind === "parameters" && section.subsections.length > 0) {
    return (
      <div className="space-y-4">
        <h4 className="font-outfit text-sm font-bold tracking-tight text-fg">
          {section.title}
        </h4>
        <div className="grid gap-6 md:grid-cols-2">
          {section.subsections.map((subsection) => (
            <div key={subsection.title}>
              <p className="text-xs font-medium uppercase tracking-wide text-fg3">
                {subsection.title}
              </p>
              <ul className="mt-2 divide-y divide-border">
                {subsection.items.map((item) => (
                  <ListItemRow key={item.text} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="font-outfit text-sm font-bold tracking-tight text-fg">
        {section.title}
      </h4>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-6 text-fg2 text-justify">
          {renderInlineMarkdown(paragraph)}
        </p>
      ))}
    </div>
  );
}

function MetricCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg3">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function ForecastInsightPanel({
  forecastResult,
  summary,
  horizonMonths,
}: Props) {
  const direction = directionMeta(summary.direction);
  const DirectionIcon = direction.icon;
  const parsed =
    forecastResult.insight.status === "generated" && forecastResult.insight.text
      ? parseForecastInsightText(forecastResult.insight.text)
      : null;

  const projectedTone =
    summary.projectedChange > 0
      ? "text-rose-600 dark:text-rose-400"
      : summary.projectedChange < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-fg";

  return (
    <section
      data-testid="forecast-insight-panel"
      className="mt-8 rounded-2xl border border-border bg-surface animate-in fade-in slide-in-from-top-4 duration-500"
      aria-labelledby="forecast-insight-title"
    >
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3
                id="forecast-insight-title"
                className="font-outfit text-base font-bold tracking-tight text-fg"
              >
                Insight Forecast
              </h3>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${confidenceBadgeClass(summary.confidence)}`}>
                Confidence {confidenceLabel(summary.confidence)}
              </span>
            </div>
            <p className="mt-1 text-sm text-fg3">
              {forecastResult.cache.status === "hit"
                ? "Snapshot tersimpan"
                : "Snapshot diperbarui"}
              {" · "}
              Horizon {horizonMonths} bulan
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCell label="Arah Tren">
            <p
              className={`flex items-center gap-2 text-sm font-semibold ${direction.valueTone}`}
            >
              <DirectionIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{direction.label}</span>
            </p>
          </MetricCell>
          <MetricCell label="Proyeksi Perubahan">
            <p className={`text-sm font-semibold tabular-nums ${projectedTone}`}>
              {summary.projectedChange > 0 ? "+" : ""}
              {summary.projectedChange}
              {summary.projectedChangePercent != null
                ? ` (${summary.projectedChangePercent > 0 ? "+" : ""}${summary.projectedChangePercent}%)`
                : " (N/A)"}
            </p>
          </MetricCell>
          <MetricCell label="Metode">
            <p className="text-sm font-semibold text-fg">Regresi Linear</p>
            <p className="mt-0.5 text-sm text-fg3">
              {summary.sourcePointCount} titik data
            </p>
          </MetricCell>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        {parsed?.intro && (
          <p className="text-sm leading-6 text-fg2">{parsed.intro}</p>
        )}

        {forecastResult.insight.status === "generated" && parsed ? (
          parsed.sections.map((section) => (
            <SectionBlock key={section.title} section={section} />
          ))
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-fg2">
            <AlertCircle className="h-4 w-4 shrink-0 text-fg3" aria-hidden="true" />
            Insight naratif tidak tersedia saat ini.
          </div>
        )}
      </div>
    </section>
  );
}
