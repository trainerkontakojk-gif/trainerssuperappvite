import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import SidakDashboardPanel from "./SidakDashboardPanel";

interface Agent {
  agentId: string;
  nama: string;
  batch: string;
  tim?: string;
  defects: number;
  score: number;
  hasCritical?: boolean;
}

interface Props {
  agents: Agent[];
  serviceType?: string;
  selectedYear?: number;
}

export default function TopAgentsTable({
  agents,
  serviceType,
  selectedYear,
}: Props) {
  const rankingParams = new URLSearchParams();
  if (serviceType) rankingParams.set("service_type", serviceType);
  if (selectedYear) rankingParams.set("year", String(selectedYear));
  const rankingQuery = rankingParams.toString();
  const rankingUrl = rankingQuery
    ? `/sidak/ranking?${rankingQuery}`
    : "/sidak/ranking";
  const visible = agents.slice(0, 5);
  const maxDefects = Math.max(1, ...visible.map((agent) => agent.defects));

  return (
    <SidakDashboardPanel
      id="sidak-top-agents-title"
      title="Agen dengan temuan terbanyak"
      description="Prioritas coaching pada filter aktif"
    >
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Belum ada agen dengan temuan pada filter ini.
        </p>
      ) : (
        <ol className="-mx-2 mb-3 divide-y divide-border">
          {visible.map((agent, index) => (
            <li key={agent.agentId}>
              <Link
                to="/sidak/agents/$id"
                params={{ id: agent.agentId }}
                className="group grid min-h-[44px] grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">
                    {agent.nama}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {agent.tim || agent.batch}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      Skor {agent.score.toFixed(1)}%
                    </span>
                    {agent.hasCritical && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-rose-700 dark:text-rose-400">
                          Ada temuan kritikal
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-2 block h-1 overflow-hidden rounded-full bg-fg2/15"
                  >
                    <span
                      className="block h-full rounded-full bg-foreground/70"
                      style={{
                        width: `${(agent.defects / maxDefects) * 100}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-outfit text-lg leading-none font-bold text-foreground tabular-nums">
                    {agent.defects}
                  </span>
                  <span className="text-xs text-muted-foreground">temuan</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-auto border-t border-border pt-3">
        <Link
          to={rankingUrl as any}
          className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Lihat semua ranking
          <ArrowRight aria-hidden="true" className="size-4 text-fg2" />
        </Link>
      </div>
    </SidakDashboardPanel>
  );
}
