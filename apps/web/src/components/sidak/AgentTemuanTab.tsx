import { useState } from "react";
import { 
  BarChart2, ShieldCheck, Pencil, Trash2, Loader2, 
  AlertCircle, ChevronDown, ChevronUp, Ticket 
} from "lucide-react";

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
        <h4 className="text-lg font-black text-slate-400 uppercase tracking-tight">Tidak ada data audit</h4>
        <p className="text-sm text-slate-500 mt-2">Belum ditemukan data temuan untuk konteks layanan atau tahun yang dipilih.</p>
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
          <div key={key} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <button
              type="button"
              onClick={() => toggleMonth(key)}
              className="w-full px-6 py-5 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-primary shadow-sm">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="text-base font-black tracking-tight text-slate-900 dark:text-white uppercase">{monthLabel}</h4>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{monthItems.length} Temuan • {Object.keys(tickets).length} Tiket</p>
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {isOpen && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                {Object.entries(tickets).map(([ticketKey, ticket], ticketIndex) => (
                  <div key={ticketKey} className="p-6 space-y-6 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">{ticketIndex + 1}</div>
                        <Ticket className="w-4 h-4 text-slate-400" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">No Tiket</span>
                          <span className="text-[11px] font-black font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            {ticket.label}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{ticket.items.length} PARAMETER</span>
                    </div>

                    <div className="space-y-8 pl-2">
                      {ticket.items.map((t) => {
                        const isCritical = t.category === 'critical';
                        
                        return (
                          <div key={t.id} className="flex gap-6 items-start relative group/item">
                            <NilaiBadge nilai={t.nilai} />
                            <div className="flex-1 min-w-0 space-y-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${isCritical ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                      {t.category}
                                    </span>
                                  </div>
                                  <h5 className="text-base font-black text-slate-900 dark:text-white leading-snug">{t.indicatorName}</h5>
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

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50">
                                  <div className="flex items-center gap-1.5 mb-2 text-slate-500">
                                    <AlertCircle className="w-3 h-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Ketidaksesuaian</span>
                                  </div>
                                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                    {t.ketidaksesuaian || '—'}
                                  </p>
                                </div>
                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                                  <div className="flex items-center gap-1.5 mb-2 text-primary">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Rekomendasi</span>
                                  </div>
                                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-bold italic">
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
