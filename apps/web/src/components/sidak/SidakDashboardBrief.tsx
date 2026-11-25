import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { DashboardInsightTone, DashboardInsights } from "@trainers/types";
import { useAuthStore } from "../../store/authStore";
import { isCapabilityAllowed } from "../../lib/app-config";
import { sidakRankingUrl } from "../../lib/sidak-ranking-url";
import { buttonVariants } from "../ui/button";

const VERDICT: Record<DashboardInsightTone, string> = {
  good: "membaik",
  bad: "memburuk",
  neutral: "stabil",
};

const STATUS_DOT: Record<DashboardInsightTone, string> = {
  good: "bg-emerald-600 dark:bg-emerald-400",
  bad: "bg-rose-600 dark:bg-rose-400",
  neutral: "bg-muted-foreground",
};

export default function SidakDashboardBrief({
  insights,
  serviceType,
  selectedYear,
}: {
  insights: DashboardInsights | null;
  serviceType?: string;
  selectedYear?: number;
}) {
  const role = useAuthStore((s) => s.profile?.role);
  if (!insights) return null;

  const { what, soWhat, nowWhat, focusParameter } = insights;
  const coachingFocus =
    nowWhat.action === "coach_focus_agents" ? focusParameter : null;
  const canOpenTna =
    nowWhat.action === "coach_focus_agents" &&
    isCapabilityAllowed(role, "tna.read");
  const lead = insights.latestLabel
    ? `${insights.latestLabel} ${VERDICT[what.tone]}`
    : `Periode terbaru ${VERDICT[what.tone]}`;

  return (
    <section
      aria-labelledby="sidak-brief-title"
      className="rounded-xl border border-border bg-surface-elevated"
    >
      <h2 id="sidak-brief-title" className="sr-only">
        Kesimpulan
      </h2>
      <div className="flex flex-col items-start gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-2">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
          <span className="mr-2 inline-flex items-center gap-2 font-semibold">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${STATUS_DOT[what.tone]}`}
            />
            {lead}:
          </span>{" "}
          <span>{what.headline}.</span>{" "}
          {what.tone === "neutral" && <span>{what.text} </span>}
          <span>{soWhat.text}</span>
          {coachingFocus && (
            <>
              {" "}
              <span>
                Parameter yang paling naik:{" "}
                <strong>{coachingFocus.name}</strong> (+{coachingFocus.change}{" "}
                temuan); {coachingFocus.agents.length} agen dengan temuan{" "}
                {coachingFocus.name}.
              </span>
            </>
          )}
        </p>
        {canOpenTna && (
          <Link
            to={"/tna" as string}
            className={buttonVariants({ className: "min-h-[44px] shrink-0" })}
          >
            Buka TNA
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
        {nowWhat.action === "open_ranking" && (
          <Link
            to={sidakRankingUrl(serviceType, selectedYear)}
            className={buttonVariants({
              variant: "outline",
              className: "min-h-[44px] shrink-0",
            })}
          >
            Lihat ranking
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
