import React, { useState, useEffect } from "react";
import { Search, X, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { ProfilerPeserta } from "@trainers/types";
import { profilerApi } from "../../../lib/profilerService";
import { notify } from "../../../lib/toast";

interface AddMemberPickerProps {
  isOpen: boolean;
  onClose: () => void;
  targetBatch: string;
  onSuccess: (newPeserta: ProfilerPeserta[]) => void;
}

export default function AddMemberPicker({
  isOpen,
  onClose,
  targetBatch,
  onSuccess,
}: AddMemberPickerProps) {
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<ProfilerPeserta[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadPool = async () => {
    setLoading(true);
    try {
      const data = await profilerApi.getGlobalPesertaPool(targetBatch);
      setPool(data || []);
    } catch (err) {
      console.error("Load pool error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPool();
      setSelectedIds([]);
      setSuccess(false);
    }
  }, [isOpen]);

  const filteredPool = pool.filter(
    (p) =>
      p.nama.toLowerCase().includes(search.toLowerCase()) ||
      p.batch_name.toLowerCase().includes(search.toLowerCase()) ||
      p.tim.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      const newPeserta = await profilerApi.copyPesertaToFolder(
        selectedIds,
        targetBatch,
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess(newPeserta as ProfilerPeserta[]);
        onClose();
      }, 1500);
    } catch (err: any) {
      notify.error("Gagal menambahkan anggota: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-border/40 flex flex-col max-h-[85vh]"
      >
        <div className="p-6 bg-gradient-to-br from-violet-600 to-indigo-700 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <UserPlus size={24} />
            Tambah Anggota
          </h3>
          <p className="text-white/70 text-sm mt-1">
            Salin peserta dari folder lain ke {targetBatch}
          </p>

          <div className="mt-6 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari nama, folder, atau tim..."
              className="w-full bg-white/10 border border-white/20 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="animate-spin" size={32} />
              <p>Memuat database peserta...</p>
            </div>
          ) : filteredPool.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>Tidak ada peserta yang ditemukan.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(new Set(filteredPool.map((p) => p.batch_name))).map(
                (batch) => (
                  <div key={batch} className="space-y-2">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2">
                      {batch}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredPool
                        .filter((p) => p.batch_name === batch)
                        .map((peserta) => (
                          <div
                            key={peserta.id}
                            onClick={() => toggleSelect(peserta.id!)}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                              selectedIds.includes(peserta.id!)
                                ? "bg-primary/10 border-primary ring-1 ring-primary"
                                : "bg-accent/30 border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                              {peserta.nama.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate text-sm">
                                {peserta.nama}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate uppercase tracking-tight">
                                {peserta.tim} &bull;{" "}
                                {peserta.jabatan.replace(/_/g, " ")}
                              </p>
                            </div>
                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                selectedIds.includes(peserta.id!)
                                  ? "bg-primary border-primary text-white"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {selectedIds.includes(peserta.id!) && (
                                <UserCheck size={12} />
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/40 bg-accent/20 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedIds.length} peserta dipilih
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-xl"
            >
              Batal
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.length === 0 || saving || success}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-md shadow-primary/10 hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : success ? (
                <UserCheck size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {success
                ? "Berhasil!"
                : `Tambahkan ${selectedIds.length} Anggota`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
