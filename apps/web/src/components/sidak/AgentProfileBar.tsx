import { Download, Plus, Users, Calendar, Briefcase, Clock } from "lucide-react";

interface Props {
  nama: string;
  tim: string;
  batchName: string;
  jabatan: string | null;
  bergabungDate: string | null;
  fotoUrl: string | null;
  role: string;
  onExport: () => void;
  onInputAudit: () => void;
}

function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  return years > 0 ? `${years} thn ${months} bln` : `${months} bln`;
}

export default function AgentProfileBar({
  nama,
  tim,
  batchName,
  jabatan,
  bergabungDate,
  fotoUrl,
  role,
  onExport,
  onInputAudit,
}: Props) {
  const initial = nama.charAt(0).toUpperCase();
  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const masaKerja = computeTenure(bergabungDate);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="relative z-10 flex flex-col items-center justify-between gap-6 text-center md:flex-row md:items-end md:text-left">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-end">
          {/* Avatar with clean border */}
          <div className="h-24 w-24 shrink-0 rounded-2xl border border-border p-1 bg-surface">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(1rem-4px)] bg-background">
              {fotoUrl ? (
                <img src={fotoUrl} alt={nama} className="h-full w-full object-cover" />
              ) : (
                <div className="text-4xl font-black uppercase text-primary/20">{initial}</div>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-3 pb-1">
            <h2 className="truncate font-outfit text-3xl font-black leading-tight tracking-tight text-foreground">{nama}</h2>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-muted-foreground md:justify-start">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> {tim}
              </div>
              <span className="hidden text-muted-foreground/30 sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> {batchName}
              </div>
              <span className="hidden text-muted-foreground/30 sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> {jabatan || "Agent"}
              </div>
              <span className="hidden text-muted-foreground/30 sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {masaKerja}
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-3 md:mt-0 md:w-auto sm:flex-row">
          <button
            onClick={onExport}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 text-[11px] font-semibold uppercase tracking-wide text-foreground transition-all hover:bg-muted active:scale-95 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            UNDUH LAPORAN
          </button>
          {isStaff && (
            <button
              onClick={onInputAudit}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-[11px] font-semibold uppercase tracking-wide text-background transition-all hover:opacity-90 active:scale-95 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              INPUT AUDIT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
