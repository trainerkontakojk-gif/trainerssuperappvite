import React, { useState } from "react";
import { X, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import type { ProfilerYear, ProfilerFolder, ProfilerPeserta } from "@trainers/types";
import { profilerApi } from "../../../lib/profilerService";
import { notify } from "../../../lib/toast";

interface DuplicateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: ProfilerFolder | null;
  years: ProfilerYear[];
  onSuccess: (newFolder: ProfilerFolder, newPeserta: ProfilerPeserta[]) => void;
}

export default function DuplicateFolderModal({
  isOpen,
  onClose,
  folder,
  years,
  onSuccess,
}: DuplicateFolderModalProps) {
  const [targetYearId, setTargetYearId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !folder) return null;

  const handleDuplicate = async () => {
    if (!targetYearId || !folder) return;
    setLoading(true);
    try {
      const result = await profilerApi.duplicateFolder(
        folder.id,
        targetYearId,
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess(result.folder, result.participants);
        onClose();
      }, 1500);
    } catch (err: any) {
      notify.error("Gagal menduplikat folder: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const otherYears = years.filter((y) => y.id !== folder.year_id);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-border/40"
      >
        <div className="p-6 border-b border-border/40 flex items-center justify-between bg-accent/20">
          <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Copy size={20} className="text-primary" />
            Duplikat Folder
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
              Folder Asal
            </p>
            <p className="font-semibold text-foreground">{folder.name}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Pilih Tahun Tujuan:
            </p>
            {otherYears.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Tidak ada tahun lain yang tersedia. Silakan tambah tahun baru
                terlebih dahulu.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {otherYears.map((year) => (
                  <label
                    key={year.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      targetYearId === year.id
                        ? "bg-primary/10 border-primary ring-1 ring-primary"
                        : "bg-accent/30 border-border hover:border-primary/50"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {year.label}
                    </span>
                    <input
                      type="radio"
                      name="targetYear"
                      className="accent-primary"
                      checked={targetYearId === year.id}
                      onChange={() => setTargetYearId(year.id)}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border/40 bg-accent/20 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent rounded-xl transition-all border border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            Batal
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!targetYearId || loading || success}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-md shadow-primary/10 hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : success ? (
              <CheckCircle2 size={18} />
            ) : (
              <Copy size={18} />
            )}
            {success ? "Berhasil!" : "Duplikat"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
