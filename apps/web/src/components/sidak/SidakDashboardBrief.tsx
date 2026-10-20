import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { DashboardInsights, DashboardInsightTone } from "@trainers/types";
import { useAuthStore } from "../../store/authStore";
import { isCapabilityAllowed } from "../../lib/app-config";
import { sidakRankingUrl } from "../../lib/sidak-ranking-url";
import { buttonVariants } from "../ui/button";
import { FocusAgentList } from "./FocusAgentsDisclosure";

/** Agents listed without an extra click; the rest sit behind a disclosure. */
const VISIBLE_AGENTS = 3;

const HEADLINE_TONE: Record<DashboardInsightTone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-rose-700 dark:text-rose-400",
  neutral: "text-foreground",
};

const CHIP_TONE: Record<Exclude<DashboardInsightTone, "neutral">, string> = {
  good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  bad: "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
};

/** Tone is always carried by a word, never by colour alone. */
function ToneChip({
  tone,
  labels,
}: {
  tone: DashboardInsightTone;
  labels: { good: string; bad: string; icon: "trend" | "target" };
}) {
  if (tone === "neutral") return null;
  const Icon =
    labels.icon === "target"
      ? tone === "good"
        ? CircleCheck
        : CircleAlert
      : tone === "good"
        ? TrendingDown
        : TrendingUp;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_TONE[tone]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {labels[tone]}
    </span>
  );
}

function Step({
  index,
  title,
  className = "",
  children,
}: {
  index: number;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fg2 uppercase">
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded-full border border-border text-[11px] tabular-nums"
        >
          {index}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Headline({
  text,
  tone,
  chip,
}: {
  text: string;
  tone: DashboardInsightTone;
  chip?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {chip}
      <p
        className={`font-outfit text-lg leading-snug font-semibold text-balance break-words ${HEADLINE_TONE[tone]}`}
      >
        {text}
      </p>
    </div>
  );
}

const detailClass = "mt-1.5 text-sm leading-relaxed text-fg2 text-pretty";

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
  const agents =
    nowWhat.action === "coach_focus_agents"
      ? (focusParameter?.agents ?? [])
      : [];
  const visible = agents.slice(0, VISIBLE_AGENTS);
  const rest = agents.slice(VISIBLE_AGENTS);
  const canOpenTna =
    nowWhat.action === "coach_focus_agents" &&
    isCapabilityAllowed(role, "tna.read");

  return (
    <section
      aria-labelledby="sidak-brief-title"
      className="rounded-xl border border-border bg-surface-elevated"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2
          id="sidak-brief-title"
          className="font-outfit text-base font-semibold text-foreground"
        >
          Kesimpulan
        </h2>
        {insights.latestLabel && insights.previousLabel && (
          <p className="text-xs text-fg2">
            {insights.latestLabel} dibanding {insights.previousLabel}
          </p>
        )}
      </div>
      <div className="grid min-w-0 divide-y divide-border @[880px]/dashboard:grid-cols-[1fr_1fr_1.15fr] @[880px]/dashboard:divide-x @[880px]/dashboard:divide-y-0">
        <Step index={1} title="Apa yang terjadi">
          <Headline
            text={what.headline}
            tone={what.tone}
            chip={
              <ToneChip
                tone={what.tone}
                labels={{ good: "Membaik", bad: "Memburuk", icon: "trend" }}
              />
            }
          />
          <p className={detailClass}>{what.text}</p>
        </Step>
        <Step index={2} title="Artinya">
          <Headline
            text={soWhat.headline}
            tone={soWhat.tone}
            chip={
              <ToneChip
                tone={soWhat.tone}
                labels={{
                  good: "Sesuai target",
                  bad: "Perlu perhatian",
                  icon: "target",
                }}
              />
            }
          />
          <p className={detailClass}>{soWhat.text}</p>
        </Step>
        <Step
          index={3}
          title="Lakukan ini"
          className="rounded-b-xl bg-muted/40 @[880px]/dashboard:rounded-r-xl @[880px]/dashboard:rounded-bl-none"
        >
          <Headline text={nowWhat.headline} tone="neutral" />
          <p className={detailClass}>{nowWhat.text}</p>
          {visible.length > 0 && (
            <FocusAgentList agents={visible} className="mt-3 -mx-2" />
          )}
          {rest.length > 0 && (
            <details className="mt-1 min-w-0">
              <summary className="flex min-h-[44px] w-fit cursor-pointer items-center rounded-md px-2 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Lihat {rest.length} agen lainnya
              </summary>
              <FocusAgentList
                agents={rest}
                label="Agen prioritas lainnya"
                className="-mx-2"
              />
            </details>
          )}
          {(canOpenTna || nowWhat.action === "open_ranking") && (
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {canOpenTna && (
                <Link
                  to={"/tna" as string}
                  className={buttonVariants({ className: "min-h-[44px]" })}
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
                    className: "min-h-[44px]",
                  })}
                >
                  Lihat ranking
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </Step>
      </div>
    </section>
  );
}
