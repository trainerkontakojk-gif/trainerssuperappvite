import { Link } from "@tanstack/react-router";
import type { DashboardInsights, DashboardInsightTone } from "@trainers/types";
import { useAuthStore } from "../../store/authStore";
import { isCapabilityAllowed } from "../../lib/app-config";
import { sidakRankingUrl } from "../../lib/sidak-ranking-url";
import { buttonVariants } from "../ui/button";
import FocusAgentsDisclosure from "./FocusAgentsDisclosure";

const TONE: Record<DashboardInsightTone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-rose-700 dark:text-rose-400",
  neutral: "text-foreground",
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
  return (
    <section
      aria-labelledby="sidak-brief-title"
      className="rounded-xl border border-border bg-surface-elevated"
    >
      <h2 id="sidak-brief-title" className="sr-only">
        Kesimpulan
      </h2>
      <div className="grid min-w-0 divide-y divide-border @[880px]/dashboard:grid-cols-3 @[880px]/dashboard:divide-x @[880px]/dashboard:divide-y-0">
        {[
          { title: "Apa yang terjadi", ...insights.what },
          { title: "Artinya", ...insights.soWhat },
        ].map((part) => (
          <div key={part.title} className="min-w-0 p-4 sm:p-5">
            <h3 className="font-outfit text-base font-semibold text-foreground">
              {part.title}
            </h3>
            <p
              className={`mt-2 text-sm leading-relaxed break-words ${TONE[part.tone]}`}
            >
              {part.text}
            </p>
          </div>
        ))}
        <div className="min-w-0 p-4 sm:p-5">
          <h3 className="font-outfit text-base font-semibold text-foreground">
            Lakukan ini
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {insights.nowWhat.text}
          </p>
          {insights.nowWhat.action === "coach_focus_agents" &&
            insights.focusParameter && (
              <>
                <FocusAgentsDisclosure
                  agents={insights.focusParameter.agents}
                />
                {isCapabilityAllowed(role, "tna.read") && (
                  <Link
                    to={"/tna" as string}
                    className={buttonVariants({
                      variant: "outline",
                      className: "mt-3 min-h-[44px]",
                    })}
                  >
                    Buka TNA
                  </Link>
                )}
              </>
            )}
          {insights.nowWhat.action === "open_ranking" && (
            <Link
              to={sidakRankingUrl(serviceType, selectedYear)}
              className={buttonVariants({
                variant: "outline",
                className: "mt-3 min-h-[44px]",
              })}
            >
              Lihat ranking
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
