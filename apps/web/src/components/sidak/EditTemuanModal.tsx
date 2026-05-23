import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";

interface EditForm {
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
}

interface Props {
  open: boolean;
  indicatorName: string;
  form: EditForm;
  submitting: boolean;
  onFormChange: (field: keyof EditForm, value: any) => void;
  onSave: () => void;
  onClose: () => void;
}

const NILAI_OPTIONS = [
  { value: 3, label: "SESUAI", desc: "Memenuhi ekspektasi", color: "emerald" },
  { value: 2, label: "PERBAIKAN", desc: "Minor issue", color: "blue" },
  { value: 1, label: "TIDAK SESUAI", desc: "Mayor issue", color: "amber" },
  { value: 0, label: "KRITIS", desc: "Critical failure", color: "rose" },
];

export default function EditTemuanModal({ open, indicatorName, form, submitting, onFormChange, onSave, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Edit Temuan</p>
                <h3 className="text-sm font-bold mt-0.5">{indicatorName}</h3>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Nilai Selector */}
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Nilai</p>
                <div className="grid grid-cols-4 gap-2">
                  {NILAI_OPTIONS.map((opt) => {
                    const isActive = form.nilai === opt.value;
                    const colorMap: Record<string, string> = {
                      emerald: "bg-emerald-500 border-emerald-500 text-white",
                      blue: "bg-blue-500 border-blue-500 text-white",
                      amber: "bg-amber-500 border-amber-500 text-white",
                      rose: "bg-rose-500 border-rose-500 text-white",
                    };
                    const inactiveMap: Record<string, string> = {
                      emerald: "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10",
                      blue: "border-blue-500/30 text-blue-600 hover:bg-blue-500/10",
                      amber: "border-amber-500/30 text-amber-600 hover:bg-amber-500/10",
                      rose: "border-rose-500/30 text-rose-600 hover:bg-rose-500/10",
                    };
                    return (
                      <button key={opt.value} onClick={() => onFormChange("nilai", opt.value)}
                        className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all ${
                          isActive ? colorMap[opt.color] : `${inactiveMap[opt.color]} bg-transparent`
                        }`}>
                        <span className="text-lg font-black">{opt.value}</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ketidaksesuaian */}
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Ketidaksesuaian</p>
                <textarea value={form.ketidaksesuaian} onChange={(e) => onFormChange("ketidaksesuaian", e.target.value)}
                  rows={3} placeholder="Deskripsi ketidaksesuaian..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
              </div>

              {/* Sebaiknya */}
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Sebaiknya</p>
                <textarea value={form.sebaiknya} onChange={(e) => onFormChange("sebaiknya", e.target.value)}
                  rows={3} placeholder="Saran perbaikan..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
              <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted transition-colors">
                Batal
              </button>
              <button onClick={onSave} disabled={submitting} className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan Perubahan
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
