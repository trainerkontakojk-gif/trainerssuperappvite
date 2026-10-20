import { Link } from "@tanstack/react-router";
import type { DashboardInsightAgent } from "@trainers/types";

/** Linked agent rows: name, team and findings for the focus parameter. */
export function FocusAgentList({
  agents,
  label = "Agen prioritas coaching",
  className = "",
}: {
  agents: DashboardInsightAgent[];
  label?: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={`divide-y divide-border ${className}`}>
      {agents.map((agent) => (
        <li key={agent.agentId}>
          <Link
            to="/sidak/agents/$id"
            params={{ id: agent.agentId }}
            className="flex min-h-[44px] flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md px-2 py-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 break-words">
              <span className="font-medium">{agent.nama}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {agent.tim || "Tim belum diisi"}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums">
              {agent.count.toLocaleString("id-ID")} temuan
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Native disclosure: keyboard support and expanded state without custom focus management. */
export default function FocusAgentsDisclosure({
  agents,
  summary,
}: {
  agents: DashboardInsightAgent[];
  summary?: string;
}) {
  if (agents.length === 0) return null;
  return (
    <details className="mt-3 min-w-0">
      <summary className="w-fit max-w-full min-h-[44px] cursor-pointer rounded-md border border-border px-3 py-2 text-sm leading-6 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {summary ?? `Lihat ${agents.length} agen`}
      </summary>
      <FocusAgentList agents={agents} className="mt-2" />
    </details>
  );
}
