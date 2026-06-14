import { Link } from "@tanstack/react-router";
import QaStatePanel from "./QaStatePanel";

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

export default function TopAgentsTable({ agents, serviceType, selectedYear }: Props) {
  if (!agents || agents.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <QaStatePanel
          type="empty"
          compact
          title="Data agen dengan temuan belum tersedia"
          description="Daftar akan otomatis terisi saat data penilaian tersedia."
          className="max-w-sm"
        />
      </div>
    );
  }

  const rankingParams = new URLSearchParams();
  if (serviceType) rankingParams.set("service", serviceType);
  if (selectedYear) rankingParams.set("year", String(selectedYear));
  const rankingQuery = rankingParams.toString();
  const rankingUrl = rankingQuery
    ? `/sidak/ranking?${rankingQuery}`
    : "/sidak/ranking";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 pb-0.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold tracking-tight text-foreground lg:text-base">
            Top Agen (Temuan)
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Prioritas Coaching & Perbaikan
          </p>
        </div>
        <Link
          to={rankingUrl as any}
          className="shrink-0 text-[11px] font-semibold text-foreground/80 transition-colors hover:text-foreground"
        >
          Lihat Semua
        </Link>
      </div>

      <div className="divide-y divide-border">
        {agents.slice(0, 5).map((agent, i) => (
          <Link
            key={agent.agentId}
            to="/sidak/agents/$id"
            params={{ id: agent.agentId }}
            className="group flex items-center gap-3 py-3 transition-colors hover:text-foreground first:pt-1 last:pb-1"
          >
            <div className="w-5 shrink-0 text-xs font-mono text-muted-foreground transition-colors group-hover:text-foreground">
              {String(i + 1).padStart(2, "0")}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary">
                  {agent.nama}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>
                  {agent.tim || agent.batch}
                </span>
                <span>•</span>
                <span>
                  Skor: {agent.score.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-foreground tabular-nums">
                {agent.defects}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                Temuan
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
