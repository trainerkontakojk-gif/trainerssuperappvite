import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Pencil, Ticket, Search } from "lucide-react";
import NilaiBadge from "./NilaiBadge";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

interface TemuanItem {
  id: string;
  month: number;
  year: number;
  indicatorName: string;
  category: string;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
}

interface Props {
  items: TemuanItem[];
  loading?: boolean;
  deletingId?: string | null;
  canEdit?: boolean;
  onEdit: (item: TemuanItem) => void;
  onDelete: (id: string) => void;
}

export default function AgentTemuanTab({ items, loading, deletingId, canEdit, onEdit, onDelete }: Props) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const grouped = items.reduce<Record<string, TemuanItem[]>>((acc, item) => {
    const key = `${item.month}-${item.year}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const [ma, ya] = a.split("-").map(Number);
    const [mb, yb] = b.split("-").map(Number);
    return yb - ya || mb - ma;
  });

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl border border-dashed">
        <Ticket className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Tidak ada data audit</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
      {sortedKeys.map((key) => {
        const [month, year] = key.split("-").map(Number);
        const monthItems = grouped[key];
        const isOpen = openMonths.has(key);

        // Group by ticket within month
        const byTicket = monthItems.reduce<Record<string, TemuanItem[]>>((acc, item) => {
          const t = item.no_tiket ?? "Tanpa Tiket";
          if (!acc[t]) acc[t] = [];
          acc[t].push(item);
          return acc;
        }, {});

        return (
          <div key={key} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <button onClick={() => toggleMonth(key)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <span className="text-sm font-bold">{MONTHS_SHORT[month - 1]} {year}</span>
                <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full font-semibold">{monthItems.length} temuan</span>
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-border/50 border-t border-border/50">
                {Object.entries(byTicket).map(([ticket, ticketItems]) => (
                  <div key={ticket} className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                      <Ticket className="w-3.5 h-3.5" />
                      <span className="uppercase tracking-wider">{ticket}</span>
                    </div>
                    {ticketItems.map((item) => {
                      const isDeleting = deletingId === item.id;
                      return (
                        <div key={item.id} className="pl-4 border-l-2 border-border space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <NilaiBadge nilai={item.nilai} size="sm" />
                              <span className="text-sm font-semibold truncate">{item.indicatorName}</span>
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                item.category === "critical" ? "bg-rose-500/10 text-rose-600" : "bg-blue-500/10 text-blue-600"
                              }`}>
                                {item.category === "critical" ? "Critical" : "Non-Critical"}
                              </span>
                            </div>
                            {canEdit && !isDeleting && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => onEdit(item)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => onDelete(item.id)} className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-muted-foreground hover:text-rose-600 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            {isDeleting && <span className="text-xs text-muted-foreground animate-pulse">Menghapus...</span>}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="p-2.5 rounded-xl bg-muted/20 border border-border/50">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Ketidaksesuaian</p>
                              <p className="text-xs">{item.ketidaksesuaian ?? "-"}</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-muted/20 border border-border/50">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Sebaiknya</p>
                              <p className="text-xs">{item.sebaiknya ?? "-"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
