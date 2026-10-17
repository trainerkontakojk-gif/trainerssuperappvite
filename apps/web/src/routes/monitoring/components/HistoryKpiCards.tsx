import { Mail, MessageSquare, Phone, PenTool } from "lucide-react";
import { Card } from "../../../components/ui/card";

interface HistoryKpiCardsProps {
  moduleCounts: { all: number; ketik: number; pdkt: number; telefun: number };
}

/** Session totals: all modules, then KETIK, PDKT and Telefun. */
export function HistoryKpiCards({ moduleCounts }: HistoryKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Total Sesi */}
      <Card className="flex items-center gap-4 border-border bg-card p-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10 text-primary">
          <MessageSquare size={20} aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
            Total Sesi
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {moduleCounts.all.toLocaleString("id-ID")}
          </p>
        </div>
      </Card>

      {/* Card 2: KETIK */}
      <Card className="flex items-center gap-4 border-border bg-card p-6">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--module-ketik-bg)",
            color: "var(--module-ketik)",
          }}
        >
          <PenTool size={20} aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block uppercase">
            ketik
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {moduleCounts.ketik.toLocaleString("id-ID")}
          </p>
        </div>
      </Card>

      {/* Card 3: PDKT */}
      <Card className="flex items-center gap-4 border-border bg-card p-6">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--module-pdkt-bg)",
            color: "var(--module-pdkt)",
          }}
        >
          <Mail size={20} aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block uppercase">
            pdkt
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {moduleCounts.pdkt.toLocaleString("id-ID")}
          </p>
        </div>
      </Card>

      {/* Card 4: Telefun */}
      <Card className="flex items-center gap-4 border-border bg-card p-6">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--module-telefun-bg)",
            color: "var(--module-telefun)",
          }}
        >
          <Phone size={20} aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block capitalize">
            telefun
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {moduleCounts.telefun.toLocaleString("id-ID")}
          </p>
        </div>
      </Card>
    </div>
  );
}
