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

      <div className="space-y-1.5">
        {agents.slice(0, 5).map((agent, i) => (
          <Link
            key={agent.agentId}
            to="/sidak/agents/$id"
            params={{ id: agent.agentId }}
            className="group flex items-center gap-2.5 rounded-[1.15rem] border border-border/60 bg-background px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:border-border hover:bg-muted/20 hover:shadow-sm"
          >
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-black text-muted-foreground transition-colors group-hover:text-foreground">
              #{String(i + 1).padStart(2, "0")}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {agent.nama}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="truncate text-muted-foreground">
                  {agent.tim || agent.batch}
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="font-bold text-blue-500">
                  Skor: {agent.score.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[15px] font-black leading-none text-red-500 tabular-nums">
                {agent.defects}
              </div>
              <div className="mt-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Temuan
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
