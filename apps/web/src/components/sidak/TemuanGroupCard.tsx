import { Check, Pencil, Trash2, X } from "lucide-react";
import NilaiBadge from "./NilaiBadge";

interface TemuanItem {
  id: string;
  indicator_id: string;
  nilai: number;
  ketidaksesuaian?: string | null;
  sebaiknya?: string | null;
  no_tiket?: string | null;
  [key: string]: unknown;
}

interface Props {
  group: { key: string; label: string | null; items: TemuanItem[] };
  indicatorLabelMap: Map<string, string>;
  editingId: string | null;
  editNilai: number;
  editKetidaksesuaian: string;
  editSebaiknya: string;
  deletingId: string | null;
  onStartEdit: (item: TemuanItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
  setEditNilai: (v: number) => void;
  setEditKetidaksesuaian: (v: string) => void;
  setEditSebaiknya: (v: string) => void;
}

const NILAI_OPTIONS = [
  { v: 0, label: "0", sub: "Sangat Tidak Sesuai", active: "bg-rose-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 1, label: "1", sub: "Tidak Sesuai", active: "bg-orange-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 2, label: "2", sub: "Perlu Perbaikan", active: "bg-amber-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
  { v: 3, label: "3", sub: "Sesuai", active: "bg-green-500 text-white border-transparent", inactive: "bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500" },
];

export default function TemuanGroupCard({
  group, indicatorLabelMap, editingId, editNilai, editKetidaksesuaian, editSebaiknya, deletingId,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  setEditNilai, setEditKetidaksesuaian, setEditSebaiknya,
}: Props) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card/50">
      {group.label && (
        <div className="px-4 py-2.5 bg-foreground/5 border-b border-border text-xs font-bold tracking-wider text-muted-foreground">
          Tiket: {group.label}
        </div>
      )}
      <div className="divide-y divide-border">
        {group.items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="p-4">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-20">
                      Nilai:
                    </span>
                    <div className="flex gap-1.5">
                      {NILAI_OPTIONS.map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setEditNilai(opt.v)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                            editNilai === opt.v ? opt.active : opt.inactive
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-muted-foreground block mb-1">
                      Ketidaksesuaian:
                    </span>
                    <textarea
                      value={editKetidaksesuaian}
                      onChange={(e) => setEditKetidaksesuaian(e.target.value)}
                      className="w-full border border-border rounded-xl p-2.5 text-sm bg-card resize-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-muted-foreground block mb-1">
                      Sebaiknya:
                    </span>
                    <textarea
                      value={editSebaiknya}
                      onChange={(e) => setEditSebaiknya(e.target.value)}
                      className="w-full border border-border rounded-xl p-2.5 text-sm bg-card resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onSaveEdit(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90"
                    >
                      <Check className="w-3.5 h-3.5" /> Simpan
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground/10 text-foreground rounded-lg text-xs font-bold hover:bg-foreground/20"
                    >
                      <X className="w-3.5 h-3.5" /> Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground/90">
                        {indicatorLabelMap.get(item.indicator_id) ?? item.indicator_id.slice(0, 8)}
                      </span>
                      <NilaiBadge nilai={item.nilai} size="sm" />
                    </div>
                    {item.ketidaksesuaian && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">KT:</span>{" "}
                        {item.ketidaksesuaian}
                      </p>
                    )}
                    {item.sebaiknya && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">SB:</span>{" "}
                        {item.sebaiknya}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartEdit(item)}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deletingId === item.id
                          ? "text-red-500 bg-red-500/10"
                          : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      }`}
                      title={deletingId === item.id ? "Klik lagi untuk konfirmasi" : "Hapus"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
