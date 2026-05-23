import { Calendar, ChevronDown, ArrowLeftRight } from "lucide-react";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};

interface Props {
  selectedYear: number;
  availableYears: number[];
  onYearChange: (y: number) => void;
  selectedService: string;
  availableServices: string[];
  onServiceChange: (s: string) => void;
  trendStartMonth: number;
  trendEndMonth: number;
  onTrendRangeChange: (s: number, e: number) => void;
  role: string;
  teams: { id: string; name: string }[];
  selectedTeam: string;
  onTeamChange: (t: string) => void;
  agentsInTeam: { id: string; nama: string }[];
  selectedAgentId: string;
  onAgentChange: (id: string) => void;
  loadingAgents?: boolean;
}

export default function ContextControlBar({
  selectedYear, availableYears, onYearChange,
  selectedService, availableServices, onServiceChange,
  trendStartMonth, trendEndMonth, onTrendRangeChange,
  role, teams, selectedTeam, onTeamChange,
  agentsInTeam, selectedAgentId, onAgentChange, loadingAgents,
}: Props) {
  const isStaff = role === "trainer" || role === "admin" || role === "leader";

  return (
    <div className="bg-background/80 border-b border-border/40 shadow-sm relative z-40 backdrop-blur-md py-3">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-center lg:justify-start">
          <div className="flex items-center gap-3">
            {/* Year Selector */}
            <div className="relative group/year">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground group-focus-within/year:text-primary transition-colors" />
              </div>
              <select
                value={selectedYear}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="h-9 pl-9 pr-8 bg-muted/50 border border-border/60 rounded-lg text-[11px] font-black focus:ring-1 focus:ring-primary outline-none appearance-none cursor-pointer hover:bg-muted transition-all"
              >
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>

            {/* Service Type Pills */}
            <div className="flex items-center gap-1 p-1 bg-muted/50 border border-border/60 rounded-lg">
              {availableServices.map((svc) => (
                <button
                  key={svc}
                  onClick={() => onServiceChange(svc)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectedService === svc
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {SERVICE_LABELS[svc] || svc}
                </button>
              ))}
            </div>
          </div>

          {/* Trend Range */}
          <div className="flex items-center gap-2 h-9 px-3 bg-muted/50 border border-border/60 rounded-lg">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Trend</span>
            <div className="flex items-center gap-1">
              <select
                value={trendStartMonth}
                onChange={(e) => onTrendRangeChange(Number(e.target.value), trendEndMonth)}
                className="bg-transparent text-[11px] font-black outline-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} disabled={i + 1 > trendEndMonth}>{m.slice(0, 3)}</option>
                ))}
              </select>
              <span className="text-muted-foreground font-bold px-1">&rarr;</span>
              <select
                value={trendEndMonth}
                onChange={(e) => onTrendRangeChange(trendStartMonth, Number(e.target.value))}
                className="bg-transparent text-[11px] font-black outline-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} disabled={i + 1 < trendStartMonth}>{m.slice(0, 3)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Team/Agent Switcher (staff only) */}
        {isStaff && (
          <div className="flex items-center gap-2 w-full lg:w-auto justify-center">
            <select
              value={selectedTeam}
              onChange={(e) => onTeamChange(e.target.value)}
              className="h-9 bg-muted/50 border border-border/60 rounded-lg px-3 text-[11px] font-black focus:ring-1 focus:ring-primary outline-none min-w-[120px]"
            >
              <option value="">Folder...</option>
              {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <select
              value={selectedAgentId}
              onChange={(e) => onAgentChange(e.target.value)}
              disabled={loadingAgents}
              className="h-9 bg-muted/50 border border-border/60 rounded-lg px-3 text-[11px] font-black focus:ring-1 focus:ring-primary outline-none min-w-[160px]"
            >
              {loadingAgents ? (
                <option>Memuat...</option>
              ) : (
                agentsInTeam.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)
              )}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
