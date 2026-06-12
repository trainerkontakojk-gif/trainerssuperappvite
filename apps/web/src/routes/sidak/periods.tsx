import { useApi } from "../../hooks/useApi";
import { sidakClient, unwrapResponse } from "../../lib/api";
import { useState } from "react";
import type { QAPeriod } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, CalendarDays, Check, AlertCircle } from "lucide-react";
import QaStatePanel from "../../components/sidak/QaStatePanel";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

export default function SidakPeriodsPage() {
  const { data: periods, loading, refetch } = useApi<QAPeriod[]>("/sidak/periods");
  const [showForm, setShowForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QAPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleAdd = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await unwrapResponse(await sidakClient.periods.$post({ json: { month: selectedMonth, year: selectedYear } }));
      setShowForm(false);
      refetch();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await unwrapResponse(await sidakClient.periods[":id"].$delete({ param: { id: confirmDelete.id } }));
      setConfirmDelete(null);
      refetch();
    } catch (e: any) {
      setErrorMsg(e.message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const alreadyExists = (periods ?? []).some(
    (p) => p.month === selectedMonth && p.year === selectedYear,
  );

  const grouped: Record<number, QAPeriod[]> = {};
  (periods ?? []).forEach((p) => {
    if (!grouped[p.year]) grouped[p.year] = [];
    grouped[p.year].push(p);
  });

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-6 overflow-y-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <CalendarDays className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-foreground/90">
                Periode Pelaporan
              </h1>
              <p className="text-xs text-muted-foreground">
                Kelola periode audit SIDAK
              </p>
            </div>
          </div>
        </motion.div>

        {/* Messages */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Period Form */}
        <AnimatePresence mode="wait">
          {showForm ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
                <p className="text-sm font-bold text-foreground">
                  Tambah Periode Baru
                </p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-2 font-bold uppercase tracking-wider">
                      Bulan
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MONTHS.map((m, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedMonth(i + 1)}
                          className={`py-2 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                            selectedMonth === i + 1
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                              : "bg-foreground/5 text-muted-foreground border-transparent hover:border-primary/40"
                          }`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-2 font-bold uppercase tracking-wider">
                      Tahun
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {YEAR_OPTIONS.map((y) => (
                        <button
                          key={y}
                          onClick={() => setSelectedYear(y)}
                          className={`py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                            selectedYear === y
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                              : "bg-foreground/5 text-muted-foreground border-transparent hover:border-primary/40"
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                    <div
                      className={`mt-4 px-3 py-2.5 rounded-xl text-center text-xs font-bold border transition-colors ${
                        alreadyExists
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-primary/10 text-primary border-primary/20"
                      }`}
                    >
                      {alreadyExists
                        ? "Sudah ada"
                        : `${MONTHS[selectedMonth - 1]} ${selectedYear}`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAdd}
                    disabled={saving || alreadyExists}
                    className="flex-1 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    {saving ? "Menyimpan..." : "Simpan Periode"}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-6 py-3 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground rounded-2xl text-sm font-bold transition-all"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="add-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowForm(true);
                setErrorMsg(null);
              }}
              className="w-full h-14 flex items-center justify-center gap-2 bg-card border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 rounded-2xl text-sm font-bold text-muted-foreground hover:text-primary transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-foreground/5 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus className="w-4 h-4" />
              </div>
              Tambah Periode Pelaporan
            </motion.button>
          )}
        </AnimatePresence>

        {/* Periods List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((y) => (
              <div key={y} className="space-y-3">
                <div className="h-4 w-24 bg-foreground/5 rounded animate-pulse" />
                <div className="bg-card rounded-3xl border border-border overflow-hidden">
                  {[1, 2, 3].map((p) => (
                    <div key={p} className="h-16 bg-foreground/5 animate-pulse border-t border-border/50" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (periods ?? []).length === 0 ? (
          <QaStatePanel
            type="empty"
            title="Periode pelaporan belum tersedia"
            description="Tambahkan periode pertama agar proses input dan analisis SIDAK bisa dimulai."
            className="text-center"
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([year, items]) => (
                <motion.div
                  key={year}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      TAHUN {year}
                    </p>
                  </div>
                  <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
                    {items
                      .sort((a, b) => b.month - a.month)
                      .map((period, i) => (
                        <div
                          key={period.id}
                          className={`flex items-center gap-4 px-6 py-4 group transition-colors hover:bg-foreground/[0.02] ${
                            i !== 0 ? "border-t border-border/50" : ""
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-black text-primary">
                              {String(period.month).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-foreground">
                              {MONTHS[period.month - 1]}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                              {year}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setErrorMsg(null);
                              setConfirmDelete(period);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </motion.div>
              ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDelete && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-md"
              onClick={() => !deleting && setConfirmDelete(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card w-full max-w-sm rounded-[2rem] p-8 border border-border shadow-2xl overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center">
                    <Trash2 className="w-8 h-8 text-destructive" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-foreground text-center mb-2">
                  Hapus Periode?
                </h3>
                <div className="px-4 py-2 bg-foreground/5 rounded-xl mx-auto w-fit mb-4">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest text-center">
                    {MONTHS[confirmDelete.month - 1]} {confirmDelete.year}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center mb-8 leading-relaxed">
                  Penghapusan tidak dapat dibatalkan. Periode yang sudah memiliki
                  data temuan otomatis tidak dapat dihapus.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full py-4 bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-destructive/20"
                  >
                    {deleting ? "Menghapus..." : "Ya, Hapus Permanen"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    disabled={deleting}
                    className="w-full py-4 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground rounded-2xl font-bold text-sm transition-all"
                  >
                    Batal
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
