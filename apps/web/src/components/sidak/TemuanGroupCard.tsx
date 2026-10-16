import { Check, Pencil, Trash2 } from "lucide-react";
import { NILAI_LABELS } from "../../lib/scoring";

export interface TemuanItem {
  id: string;
  indicator_id: string;
  nilai: number;
  ketidaksesuaian?: string | null;
  sebaiknya?: string | null;
  no_tiket?: string | null;
  tanggal_layanan?: string | null;
  tanggal_sampel?: string | null;
  [key: string]: unknown;
}

export interface TemuanGroup {
  key: string;
  label: string | null;
  items: TemuanItem[];
  /** 100 − skor sesi tiket ini; `null` bila parameter/bobot belum dimuat. */
  deduction?: number | null;
}

export interface TemuanGroupCardProps {
  group: TemuanGroup;
  indicatorLabelMap: Map<string, string>;
  categoryMap: Map<string, string>;
  editingId: string | null;
  editNilai: number;
  editKetidaksesuaian: string;
  editSebaiknya: string;
  editTanggalLayanan: string;
  editTanggalSampel: string;
  deletingId: string | null;
  canEdit: boolean;
  onStartEdit: (item: TemuanItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (item: TemuanItem, label: string) => void;
  setEditNilai: (v: number) => void;
  setEditKetidaksesuaian: (v: string) => void;
  setEditSebaiknya: (v: string) => void;
  setEditTanggalLayanan: (v: string) => void;
  setEditTanggalSampel: (v: string) => void;
}

const NILAI_OPTIONS = [
  { v: 0, label: "0", active: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 1, label: "1", active: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 2, label: "2", active: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
  { v: 3, label: "3", active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", inactive: "bg-background border-border text-muted-foreground hover:bg-muted" },
];

const NILAI_BADGE_STYLE: Record<number, string> = {
  0: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  1: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  2: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  3: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
};

const NILAI_LABEL_COLOR: Record<number, string> = {
  0: "text-rose-700 dark:text-rose-400", 1: "text-orange-700 dark:text-orange-400", 2: "text-amber-700 dark:text-amber-400", 3: "text-emerald-700 dark:text-emerald-400",
};

const SERVICE_DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `YYYY-MM-DD` → "6 Jan 2026"; nilai lain ditampilkan apa adanya. */
function formatServiceDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return SERVICE_DATE_FORMAT.format(
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))),
  );
}

function formatDeduction(value: number): string {
  if (value < 0.05) return "Tanpa potongan";
  return `−${value.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

export default function TemuanGroupCard({
  group, indicatorLabelMap, categoryMap, editingId, editNilai,
  editKetidaksesuaian, editSebaiknya, editTanggalLayanan, editTanggalSampel,
  deletingId, canEdit,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  setEditNilai, setEditKetidaksesuaian, setEditSebaiknya,
  setEditTanggalLayanan, setEditTanggalSampel,
}: TemuanGroupCardProps) {
  // Tanggal layanan tiket diambil dari temuan pertama yang mengisinya.
  const firstServiceDate = group.items.find(
    (item) => item.tanggal_layanan,
  )?.tanggal_layanan;
  const serviceDate = firstServiceDate
    ? formatServiceDate(firstServiceDate)
    : null;
  return (
    <li className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/20 px-4 py-2.5">
        <h3 className="min-w-0 text-sm">
          {group.label ? (
            <span className="font-mono font-semibold text-foreground">
              {group.label}
            </span>
          ) : (
            <span className="italic text-muted-foreground">Tanpa no. tiket</span>
          )}
          <span className="text-xs text-muted-foreground">
            {serviceDate ? ` · ${serviceDate}` : ""} · {group.items.length}{" "}
            temuan
          </span>
        </h3>
        {group.deduction != null ? (
          <span
            aria-label="Potongan skor sesi"
            className={`text-sm font-semibold tabular-nums ${group.deduction > 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}
          >
            {formatDeduction(group.deduction)}
          </span>
        ) : null}
      </header>

      <div className="divide-y divide-border">
        {group.items.map((item) => {
          const isEditing = editingId === item.id;
          const cat = categoryMap.get(item.indicator_id);
          const isCritical = cat === "critical";
          const label =
            indicatorLabelMap.get(item.indicator_id) ??
            item.indicator_id.slice(0, 8);
          return (
            <div key={item.id} className="px-4 py-3">
              {isEditing ? (
                <div className="mt-0 p-4 rounded-xl bg-background/50 border border-border space-y-4">
                  <p className="text-xs font-semibold text-foreground tracking-wide">Edit temuan</p>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block tracking-wide">Nilai</label>
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
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block tracking-wide">Ketidaksesuaian</label>
                      <textarea
                        value={editKetidaksesuaian}
                        onChange={(e) => setEditKetidaksesuaian(e.target.value)}
                        rows={2}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block tracking-wide">Sebaiknya</label>
                      <textarea
                        value={editSebaiknya}
                        onChange={(e) => setEditSebaiknya(e.target.value)}
                        rows={2}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground resize-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`edit-tanggal-layanan-${item.id}`}
                        className="text-xs font-semibold text-muted-foreground mb-1.5 block tracking-wide"
                      >
                        Tanggal layanan
                      </label>
                      <input
                        id={`edit-tanggal-layanan-${item.id}`}
                        type="date"
                        value={editTanggalLayanan}
                        onChange={(e) => setEditTanggalLayanan(e.target.value)}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`edit-tanggal-sampel-${item.id}`}
                        className="text-xs font-semibold text-muted-foreground mb-1.5 block tracking-wide"
                      >
                        Tanggal sampel
                      </label>
                      <input
                        id={`edit-tanggal-sampel-${item.id}`}
                        type="date"
                        value={editTanggalSampel}
                        onChange={(e) => setEditTanggalSampel(e.target.value)}
                        className="w-full bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-foreground text-foreground"
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
                <div className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto] md:items-start">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {label}
                    </p>
                    {cat ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${isCritical ? "bg-rose-500" : "bg-sky-500"}`}
                        />
                        {isCritical ? "Kritikal" : "Non-kritikal"}
                      </p>
                    ) : null}
                    {/*
                      Tanggal selalu ditampilkan, termasuk saat kosong. Kalau
                      hanya dirender ketika terisi, pengguna tidak bisa
                      membedakan "belum diisi" dari "sudah diisi lalu terhapus".
                    */}
                    <p className="text-xs text-muted-foreground">
                      Tanggal layanan: {item.tanggal_layanan || "Belum diisi"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tanggal sampel: {item.tanggal_sampel || "Belum diisi"}
                    </p>
                  </div>
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/70 md:sr-only">
                      Ketidaksesuaian:{" "}
                    </span>
                    {item.ketidaksesuaian || "—"}
                  </p>
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/70 md:sr-only">
                      Sebaiknya:{" "}
                    </span>
                    {item.sebaiknya || "—"}
                  </p>
                  <div className="flex items-start gap-3">
                    <div className="text-center">
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-semibold ${NILAI_BADGE_STYLE[item.nilai]}`}>
                        {item.nilai}
                      </div>
                      <p className={`text-xs font-semibold mt-1 ${NILAI_LABEL_COLOR[item.nilai]}`}>
                        {NILAI_LABELS[item.nilai]}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onStartEdit(item)}
                          aria-label={`Ubah temuan ${label}`}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil aria-hidden="true" className="w-4 h-4" />
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item, label)}
                          disabled={deletingId === item.id}
                          aria-label={`Hapus temuan ${label}`}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50 dark:hover:text-rose-400"
                        >
                          <Trash2 aria-hidden="true" className="w-4 h-4" />
                          Hapus
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
    </li>
  );
}
