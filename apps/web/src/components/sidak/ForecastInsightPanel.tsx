import type { ReactNode } from "react";
import { Activity, AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import type {
  SidakBatchForecastSnapshot,
  SidakForecastSummary,
} from "@trainers/types";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function confidenceBadgeClass(confidence: SidakForecastSummary["confidence"]) {
  if (confidence === "high") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (confidence === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
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
  if (tone === "risk") {
    return "border-rose-500/30 bg-rose-500/5";
  }
  if (tone === "positive") {
    return "border-emerald-500/30 bg-emerald-500/5";
  }
  return "border-border bg-background";
}

function changeDotClass(tone: ForecastInsightListItem["tone"]) {
  if (tone === "risk") return "bg-rose-600 dark:bg-rose-400";
  if (tone === "positive") return "bg-emerald-600 dark:bg-emerald-400";
  return "bg-muted-foreground";
}

function ListItemRow({ item }: { item: ForecastInsightListItem }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-6 text-foreground",
        changeToneClass(item.tone),
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          changeDotClass(item.tone),
        )}
      />
      <span className="min-w-0">{renderInlineMarkdown(item.text)}</span>
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
        <ol className="grid gap-3">
          {section.actions.map((action) => (
            <li
              key={action.index}
              className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
            >
              <Badge
                variant="secondary"
                className="mt-0.5 size-6 shrink-0 justify-center px-0 tabular-nums"
              >
                {action.index}
              </Badge>
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
            <div
              key={subsection.title}
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {subsection.title}
              </p>
              <ul className="mt-2 grid gap-2">
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
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
      ? "text-rose-700 dark:text-rose-400"
      : summary.projectedChange < 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";

  return (
    <Card
      data-testid="forecast-insight-panel"
      className="border border-border bg-card py-0 ring-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300"
      aria-labelledby="forecast-insight-title"
    >
      <CardHeader className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle
            id="forecast-insight-title"
            className="font-heading text-base font-semibold tracking-tight"
          >
            Insight Forecast
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(confidenceBadgeClass(summary.confidence))}
          >
            Confidence {confidenceLabel(summary.confidence)}
          </Badge>
        </div>
        <CardDescription>
          {forecastResult.cache.status === "hit"
            ? "Snapshot tersimpan"
            : "Snapshot diperbarui"}{" "}
          {" · "} Horizon {horizonMonths} bulan
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCell label="Arah tren">
            <p
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                direction.valueTone,
              )}
            >
              <DirectionIcon aria-hidden="true" />
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
        </div>

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
      </CardContent>
    </Card>
  );
}
