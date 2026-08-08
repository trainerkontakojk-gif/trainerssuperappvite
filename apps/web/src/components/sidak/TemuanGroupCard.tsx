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
  { v: 0, label: "0", active: "bg-rose-500/15 text-rose-600 border-rose-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 1, label: "1", active: "bg-orange-500/15 text-orange-600 border-orange-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 2, label: "2", active: "bg-amber-500/15 text-amber-600 border-amber-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 3, label: "3", active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
];

const NILAI_BADGE_STYLE: Record<number, string> = {
  0: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  1: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  2: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  3: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const NILAI_LABEL_COLOR: Record<number, string> = {
  0: "text-rose-500", 1: "text-orange-500", 2: "text-amber-500", 3: "text-emerald-500",
};

export default function TemuanGroupCard({
  group, gIdx, indicatorLabelMap, categoryMap, editingId, editNilai,
  editKetidaksesuaian, editSebaiknya, deletingId, canEdit,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  setEditNilai, setEditKetidaksesuaian, setEditSebaiknya,
}: TemuanGroupCardProps) {
  return (
    <article className="min-w-0 border border-border rounded-xl overflow-hidden bg-surface">
      {/* Session header */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-muted/20 border-b border-border">
        <div className="w-6 h-6 rounded bg-foreground text-background flex items-center justify-center flex-shrink-0 font-semibold text-[10px]">
          {gIdx + 1}
        </div>
        {group.label ? (
          <span className="text-xs font-mono font-semibold text-foreground">{group.label}</span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Tanpa no. tiket</span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto font-semibold tracking-wide">
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
                <div className="mt-0 p-4 rounded-xl bg-background/50 border border-border space-y-4">
                  <p className="text-xs font-semibold text-foreground tracking-wide">Edit temuan</p>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block tracking-wide">Nilai</label>
                    <div className="grid grid-cols-4 gap-2">
                      {NILAI_OPTIONS.map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setEditNilai(opt.v)}
                          className={`py-2 rounded-lg border transition-all text-center ${editNilai === opt.v ? opt.active : opt.inactive}`}
                        >
                          <p className="text-base font-semibold">{opt.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block tracking-wide">Ketidaksesuaian</label>
                      <textarea
                        value={editKetidaksesuaian}
                        onChange={(e) => setEditKetidaksesuaian(e.target.value)}
                        rows={2}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block tracking-wide">Sebaiknya</label>
                      <textarea
                        value={editSebaiknya}
                        onChange={(e) => setEditSebaiknya(e.target.value)}
                        rows={2}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onSaveEdit(item.id)}
                      className="flex-1 py-2 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Simpan
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="px-4 py-2 bg-transparent border border-border hover:bg-muted text-muted-foreground rounded-lg text-xs font-semibold tracking-wide transition"
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
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${isCritical ? "bg-red-500/5 text-red-600 border-red-500/20" : "bg-blue-500/5 text-blue-600 border-blue-500/20"}`}>
                          {isCritical ? "Critical" : "Non-Critical"}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {item.ketidaksesuaian && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground/70">Ketidaksesuaian: </span>
                          {item.ketidaksesuaian}
                        </p>
                      )}
                      {item.sebaiknya && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground/70">Sebaiknya: </span>
                          {item.sebaiknya}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-semibold ${NILAI_BADGE_STYLE[item.nilai]}`}>
                        {item.nilai}
                      </div>
                      <p className={`text-[9px] font-semibold mt-1 ${NILAI_LABEL_COLOR[item.nilai]}`}>
                        {NILAI_LABELS[item.nilai]}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onStartEdit(item)}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
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
