import { Check, Pencil, Trash2 } from "lucide-react";
import { NILAI_LABELS } from "../../lib/scoring";

export interface TemuanItem {
  id: string;
  indicator_id: string;
  nilai: number;
  ketidaksesuaian?: string | null;
  sebaiknya?: string | null;
  no_tiket?: string | null;
  [key: string]: unknown;
}

export interface TemuanGroup {
  key: string;
  label: string | null;
  items: TemuanItem[];
}

export interface TemuanGroupCardProps {
  group: TemuanGroup;
  gIdx: number;
  indicatorLabelMap: Map<string, string>;
  categoryMap: Map<string, string>;
  editingId: string | null;
  editNilai: number;
  editKetidaksesuaian: string;
  editSebaiknya: string;
  deletingId: string | null;
  canEdit: boolean;
  onStartEdit: (item: TemuanItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
  setEditNilai: (v: number) => void;
  setEditKetidaksesuaian: (v: string) => void;
  setEditSebaiknya: (v: string) => void;
}

const NILAI_OPTIONS = [
  { v: 0, label: "0", active: "bg-rose-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 1, label: "1", active: "bg-orange-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 2, label: "2", active: "bg-amber-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 3, label: "3", active: "bg-green-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
];

const NILAI_BADGE: Record<number, string> = {
  0: "bg-rose-500", 1: "bg-orange-500", 2: "bg-amber-500", 3: "bg-green-500",
};

const NILAI_LABEL_COLOR: Record<number, string> = {
  0: "text-red-500", 1: "text-orange-500", 2: "text-amber-500", 3: "text-green-500",
};

export default function TemuanGroupCard({
  group, gIdx, indicatorLabelMap, categoryMap, editingId, editNilai,
  editKetidaksesuaian, editSebaiknya, deletingId, canEdit,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  setEditNilai, setEditKetidaksesuaian, setEditSebaiknya,
}: TemuanGroupCardProps) {
  return (
    <article className="min-w-0 border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      {/* Session header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-foreground/[0.02] border-b border-border">
        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-black text-[10px]">
          {gIdx + 1}
        </div>
        {group.label ? (
          <span className="text-xs font-mono font-bold text-primary">{group.label}</span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Tanpa no. tiket</span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto font-bold uppercase tracking-wider">
          {group.items.length} temuan
        </span>
      </div>

      <div className="divide-y divide-border">
        {group.items.map((item) => {
          const isEditing = editingId === item.id;
          const cat = categoryMap.get(item.indicator_id);
          const isCritical = cat === "critical";
          return (
            <div key={item.id} className="p-5">
              {isEditing ? (
                <div className="mt-0 p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-4">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Edit Temuan</p>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground mb-2 block uppercase tracking-wider">Nilai</label>
                    <div className="grid grid-cols-4 gap-2">
                      {NILAI_OPTIONS.map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setEditNilai(opt.v)}
                          className={`py-2 rounded-xl border-2 transition-all text-center ${editNilai === opt.v ? opt.active : opt.inactive}`}
                        >
                          <p className="text-base font-black">{opt.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground mb-2 block uppercase tracking-wider">Ketidaksesuaian</label>
                      <textarea
                        value={editKetidaksesuaian}
                        onChange={(e) => setEditKetidaksesuaian(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground mb-2 block uppercase tracking-wider">Sebaiknya</label>
                      <textarea
                        value={editSebaiknya}
                        onChange={(e) => setEditSebaiknya(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onSaveEdit(item.id)}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="px-4 py-2.5 bg-foreground/5 text-muted-foreground rounded-xl font-bold text-xs"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm text-foreground/90">
                        {indicatorLabelMap.get(item.indicator_id) ?? item.indicator_id.slice(0, 8)}
                      </span>
                      {cat && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCritical ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
                          {isCritical ? "Critical" : "Non-Critical"}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {item.ketidaksesuaian && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">Ketidaksesuaian: </span>
                          {item.ketidaksesuaian}
                        </p>
                      )}
                      {item.sebaiknya && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">Sebaiknya: </span>
                          {item.sebaiknya}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white ${NILAI_BADGE[item.nilai]}`}>
                        {item.nilai}
                      </div>
                      <p className={`text-[9px] font-bold uppercase mt-1 ${NILAI_LABEL_COLOR[item.nilai]}`}>
                        {NILAI_LABELS[item.nilai]}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onStartEdit(item)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            deletingId === item.id
                              ? "text-red-500 bg-red-500/10"
                              : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          }`}
                          title={deletingId === item.id ? "Klik lagi untuk konfirmasi" : "Hapus"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
