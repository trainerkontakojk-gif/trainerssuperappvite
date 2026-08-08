import { useState } from "react";
import { 
  BarChart2, ShieldCheck, Pencil, Trash2, Loader2, 
  AlertCircle, ChevronDown, ChevronUp, Ticket 
} from "lucide-react";
import { titleize } from "../../lib/humanize";

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

function NilaiBadge({ nilai }: { nilai: number }) {
  const variants: Record<0 | 1 | 2 | 3, { bg: string; text: string; label: string }> = {
    3: { bg: 'bg-emerald-500', text: 'text-emerald-500', label: 'SESUAI' },
    2: { bg: 'bg-blue-500',    text: 'text-blue-500',    label: 'PERBAIKAN' },
    1: { bg: 'bg-amber-500',   text: 'text-amber-500',   label: 'TIDAK SESUAI' },
    0: { bg: 'bg-rose-500',    text: 'text-rose-500',    label: 'KRITIS' }
  };
  const v = variants[nilai as 0 | 1 | 2 | 3] ?? variants[0];
  
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className={`w-10 h-10 rounded-xl ${v.bg} flex items-center justify-center text-white text-lg font-black shadow-sm`}>
        {nilai}
      </div>
      <span className={`text-[7px] font-black tracking-widest ${v.text}`}>{v.label}</span>
    </div>
  );
}

const MONTHS_FULL = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

export default function AgentTemuanTab({ items, loading, deletingId, canEdit, onEdit, onDelete }: Props) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-16 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-5 text-slate-300">
          <Ticket className="w-8 h-8" />
        </div>
        <h4 className="text-lg font-black text-slate-400 tracking-tight">Belum ada temuan</h4>
        <p className="text-sm text-slate-500 mt-2">Belum ada temuan untuk layanan atau tahun yang dipilih.</p>
      </div>
    );
  }

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
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className={`space-y-4 transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
      {sortedKeys.map((key) => {
        const [month, year] = key.split("-").map(Number);
        const monthItems = grouped[key];
        const isOpen = openMonths.has(key);

        const tickets: Record<string, { label: string; items: TemuanItem[] }> = {};
        monthItems.forEach(t => {
          const rawTicket = (t.no_tiket ?? '').trim();
          const ticketKey = rawTicket ? rawTicket.toUpperCase() : `audit-${t.id}`;
          if (!tickets[ticketKey]) {
            tickets[ticketKey] = {
              label: rawTicket ? rawTicket.toUpperCase() : 'AUDIT INTERNAL',
              items: []
            };
          }
          tickets[ticketKey].items.push(t);
        });

        const monthLabel = `${MONTHS_FULL[month - 1]} ${year}`;

        return (
          <div key={key} className="border-b border-border pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
            <button
              type="button"
              onClick={() => toggleMonth(key)}
              className="w-full px-4 py-4 rounded-2xl flex items-center justify-between group transition-all hover:bg-muted/40"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-transparent text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                  <BarChart2 className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <h4 className="text-base font-black tracking-tight text-foreground transition-colors">{titleize(monthLabel)}</h4>
                  <p className="text-[10px] font-bold text-muted-foreground tracking-widest">{monthItems.length} temuan · {Object.keys(tickets).length} tiket</p>
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition-colors group-hover:bg-background">
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {isOpen && (
              <div className="space-y-8 pt-4">
                {Object.entries(tickets).map(([ticketKey, ticket], ticketIndex) => (
                  <div key={ticketKey} className="space-y-6">
                    <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black italic text-muted-foreground/40 w-6">#{ticketIndex + 1}</span>
                        <Ticket className="w-4 h-4 text-muted-foreground" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black text-muted-foreground/60 tracking-[0.18em]">No. Tiket</span>
                          <span className="text-[11px] font-black font-mono text-foreground tracking-wider">
                            {ticket.label}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground tracking-[0.2em]">{ticket.items.length} parameter</span>
                    </div>

                    <div className="space-y-8 pl-9">
                      {ticket.items.map((t) => {
                        const isCritical = t.category === 'critical';
                        
                        return (
                          <div key={t.id} className="flex gap-6 items-start relative group/item">
                            <div className="flex flex-col items-center gap-1 shrink-0 w-12 pt-1">
                              <span className="text-xl font-black text-foreground">{t.nilai}</span>
                              <span className="text-[8px] font-bold text-muted-foreground tracking-widest">Poin</span>
                            </div>
                            
                            <div className="flex-1 min-w-0 space-y-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest ${isCritical ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                      {isCritical ? "Kritis" : "Non-kritis"}
                                    </span>
                                  </div>
                                  <h5 className="text-base font-black text-foreground leading-snug">{t.indicatorName}</h5>
                                </div>

                                {canEdit && (
                                  <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <button onClick={() => onEdit(t)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => onDelete(t.id)} disabled={deletingId === t.id} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg transition-colors">
                                      {deletingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <AlertCircle className="w-3 h-3" />
                                    <span className="text-[9px] font-bold tracking-widest">Ketidaksesuaian</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                    {t.ketidaksesuaian || '—'}
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1.5 text-primary">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span className="text-[9px] font-bold tracking-widest">Rekomendasi</span>
                                  </div>
                                  <p className="text-xs text-foreground leading-relaxed font-bold italic">
                                    {t.sebaiknya || '—'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
