import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  FileText, Database, Sparkles, ArrowRight, ChevronLeft,
  AlertTriangle,
} from "lucide-react";

export default function SidakReportsLanding() {
  const [showWarning, setShowWarning] = useState(false);
  const acknowledged = typeof sessionStorage !== "undefined"
    && sessionStorage.getItem("sidak-ai-report-acknowledged") === "true";

  const handleAiClick = () => {
    if (acknowledged) {
      window.location.href = "/sidak/reports-ai";
    } else {
      setShowWarning(true);
    }
  };

  const handleContinueAi = () => {
    sessionStorage.setItem("sidak-ai-report-acknowledged", "true");
    setShowWarning(false);
    window.location.href = "/sidak/reports-ai";
  };

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="relative z-20 flex shrink-0 flex-col items-start justify-between gap-4 border-b border-border/50 bg-background/80 px-4 py-4 backdrop-blur-xl sm:h-28 sm:flex-row sm:items-center sm:px-6 sm:py-0 lg:px-10">
        <div>
          <Link
            to="/sidak/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
          >
            <ChevronLeft className="h-3 w-3" /> Dashboard SIDAK
          </Link>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <FileText className="h-3 w-3" /> SIDAK
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">
            Menu Laporan
          </h1>
          <p className="mt-1 text-xs text-foreground/50">
            Pilih jenis laporan yang ingin Anda akses.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          {/* Laporan Data Card */}
          <motion.div
            whileHover={{ y: -5 }}
            className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 p-8 backdrop-blur-sm transition-all hover:bg-card/60"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10 border border-blue-500/20 text-blue-500">
              <Database className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Laporan Data
            </h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
              Akses laporan berbasis database. Filter parameter QA, periode, dan
              layanan untuk mendapatkan tabel data mentah dan temuan operasional
              secara instan.
            </p>
            <div className="mt-8">
              <Link
                to="/sidak/reports-data"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-foreground text-background px-6 text-xs font-black uppercase tracking-widest transition-all hover:opacity-90 group-hover:gap-3"
              >
                Masuk ke Workspace <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Laporan AI Card */}
          <motion.div
            whileHover={{ y: -5 }}
            onClick={handleAiClick}
            className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 p-8 backdrop-blur-sm transition-all hover:bg-card/60 cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 relative">
              <Sparkles className="h-8 w-8" />
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                AI
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Laporan AI
            </h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
              Laporan otomatis bertenaga AI. Pilih model, filter data, dan dapatkan
              laporan dalam format HTML, DOCX, atau PDF.
            </p>
            <div className="mt-8">
              <span className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500/20 text-amber-500 px-6 text-xs font-black uppercase tracking-widest transition-all group-hover:gap-3">
                Masuk ke Workspace <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* AI Warning Modal */}
      <AnimatePresence>
        {showWarning && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
            onClick={() => setShowWarning(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-md mx-4 rounded-[2rem] p-8 border border-border shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-black text-foreground text-center mb-3">
                Akses Terbatas & Notifikasi Biaya
              </h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed mb-8">
                Fitur Laporan AI masih dalam tahap pengembangan dan merupakan
                layanan berbayar berdasarkan token AI yang digunakan. Pastikan
                Anda memiliki anggaran yang cukup sebelum melanjutkan.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleContinueAi}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-all"
                >
                  Tetap Lanjutkan
                </button>
                <button
                  onClick={() => setShowWarning(false)}
                  className="w-full py-4 bg-foreground/5 hover:bg-foreground/10 text-foreground rounded-2xl font-bold text-sm transition-all"
                >
                  Kembali
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
