import type { ReactNode } from "react";
import { Activity, AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import type {
  SidakBatchForecastSnapshot,
  SidakForecastSummary,
} from "@trainers/types";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
        <strong key={index} className="font-semibold text-foreground">
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

function confidenceTextClass(confidence: SidakForecastSummary["confidence"]) {
  if (confidence === "high") {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (confidence === "medium") {
    return "text-amber-700 dark:text-amber-400";
  }
  return "text-rose-700 dark:text-rose-400";
}

function directionMeta(direction: SidakForecastSummary["direction"]) {
  if (direction === "down") {
    return {
      label: "Menurun",
      icon: TrendingDown,
      valueTone: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (direction === "up") {
    return {
      label: "Meningkat",
      icon: TrendingUp,
      valueTone: "text-rose-700 dark:text-rose-400",
    };
  }
  return {
    label: "Stabil",
    icon: Activity,
    valueTone: "text-foreground",
  };
}

function changeToneClass(tone: ForecastInsightListItem["tone"]) {
  if (tone === "risk") return "text-rose-700 dark:text-rose-400";
  if (tone === "positive") return "text-emerald-700 dark:text-emerald-400";
  return "text-foreground";
}

function changeDotClass(tone: ForecastInsightListItem["tone"]) {
  if (tone === "risk") return "bg-rose-600 dark:bg-rose-400";
  if (tone === "positive") return "bg-emerald-600 dark:bg-emerald-400";
  return "bg-muted-foreground";
}

function ListItemRow({ item }: { item: ForecastInsightListItem }) {
  return (
    <li className="flex items-start gap-2 border-t border-border/70 pt-2 text-sm leading-6 text-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          changeDotClass(item.tone),
        )}
      />
      <span className={cn("min-w-0", changeToneClass(item.tone))}>
        {renderInlineMarkdown(item.text)}
      </span>
    </li>
  );
}

function SectionBlock({ section }: { section: ForecastInsightSection }) {
  if (section.kind === "disclaimer") {
    return (
      <Alert className="border-dashed border-border bg-muted/20">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>{section.title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-6">
              {renderInlineMarkdown(paragraph)}
            </p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  if (section.kind === "actions" && section.actions.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <h4 className="font-heading text-sm font-semibold tracking-tight text-foreground">
          {section.title}
        </h4>
        <ol className="divide-y divide-border border-y border-border">
          {section.actions.map((action) => (
            <li key={action.index} className="flex items-start gap-3 py-3">
              <span className="w-5 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {action.index}.
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {action.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {action.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (section.kind === "parameters" && section.subsections.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <h4 className="font-heading text-sm font-semibold tracking-tight text-foreground">
          {section.title}
        </h4>
        <div className="grid gap-4 md:grid-cols-2">
          {section.subsections.map((subsection) => (
            <div key={subsection.title} className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">
                {subsection.title}
              </p>
              <ul className="mt-2">
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
    <div className="flex flex-col gap-2">
      <h4 className="font-heading text-sm font-semibold tracking-tight text-foreground">
        {section.title}
      </h4>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-6 text-muted-foreground">
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
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
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
      ? "text-rose-700 dark:text-rose-400"
      : summary.projectedChange < 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";

  return (
    <section
      data-testid="forecast-insight-panel"
      className="border-y border-border py-4 sm:py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300"
      aria-labelledby="forecast-insight-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 pb-0">
        <div className="min-w-0">
          <h3
            id="forecast-insight-title"
            className="font-heading text-base font-semibold tracking-tight text-foreground"
          >
            Penjelasan proyeksi
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Proyeksi {horizonMonths} bulan
          </p>
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            confidenceTextClass(summary.confidence),
          )}
        >
          Kepercayaan proyeksi: {confidenceLabel(summary.confidence)}
        </span>
      </header>

      <div className="flex flex-col gap-6 pt-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <MetricCell label="Arah temuan">
            <p
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                direction.valueTone,
              )}
            >
              <DirectionIcon aria-hidden="true" className="size-4" />
              <span>{direction.label}</span>
            </p>
          </MetricCell>
          <MetricCell label="Proyeksi perubahan">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                projectedTone,
              )}
            >
              {summary.projectedChange > 0 ? "+" : ""}
              {summary.projectedChange}
              {summary.projectedChangePercent != null
                ? ` (${summary.projectedChangePercent > 0 ? "+" : ""}${summary.projectedChangePercent}%)`
                : " (N/A)"}
            </p>
          </MetricCell>
          <MetricCell label="Metode">
            <p className="text-sm font-semibold text-foreground">
              Regresi Linear
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {summary.sourcePointCount} titik data
            </p>
          </MetricCell>
        </dl>

        {parsed?.intro ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {parsed.intro}
          </p>
        ) : null}

        {forecastResult.insight.status === "generated" && parsed ? (
          parsed.sections.map((section) => (
            <SectionBlock key={section.title} section={section} />
          ))
        ) : (
          <Alert className="border-dashed border-border bg-muted/20">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              Insight naratif tidak tersedia saat ini.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}
