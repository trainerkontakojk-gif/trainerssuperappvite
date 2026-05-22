import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Trash2,
  Phone,
  Clock,
  Download,
  History as HistoryIcon,
  Eye,
  FileDown,
} from "lucide-react";
import type { CallRecord } from "../types";
import { notify } from "../../../lib/toast";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: CallRecord[];
  onDeleteSession: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onReviewSession?: (record: CallRecord) => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function exportToCSV(history: CallRecord[]) {
  const headers = [
    "Tanggal",
    "Skenario",
    "Nama Konsumen",
    "Durasi",
    "Skor",
    "Feedback",
    "URL Rekaman",
  ];
  const rows = history.map((record) => [
    formatDate(record.date),
    record.scenarioTitle,
    record.consumerName,
    record.configuredDuration
      ? `${record.configuredDuration}m (aktual: ${formatDuration(record.duration)})`
      : formatDuration(record.duration),
    record.score ?? "-",
    (record.feedback ?? "").replace(/\n/g, " "),
    record.url,
  ]);

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(String(cell))).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `telefun_history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onDeleteSession,
  onClearHistory,
  onReviewSession,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [history],
  );

  const handleDelete = async (id: string) => {
    setProcessingId(id);
    try {
      await onDeleteSession(id);
      notify.success("Riwayat berhasil dihapus");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Gagal menghapus riwayat.",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus semua riwayat?")) return;
    setIsClearing(true);
    try {
      await onClearHistory();
      notify.success("Semua riwayat berhasil dihapus");
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "Gagal menghapus semua riwayat.",
      );
    } finally {
      setIsClearing(false);
    }
  };

  const handleDownload = async (record: CallRecord) => {
    try {
      setDownloadingId(record.id);
      let downloadUrl = record.url;

      if (!downloadUrl && (record.recordingPath || record.agentRecordingPath)) {
        const token =
          localStorage.getItem("auth_token") ??
          localStorage.getItem("supabase_token");
        const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";
        const res = await fetch(`${API_BASE}/telefun/recording/${record.id}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json();
        if (json?.success && json.url) {
          downloadUrl = json.url;
        }
      }

      if (downloadUrl) {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `Telefun_${record.consumerName}_${record.id}.webm`;
        a.target = "_blank";
        a.click();
        return;
      }

      notify.error("Rekaman tidak tersedia untuk diunduh.");
    } catch {
      notify.error("Gagal mengunduh rekaman.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between border-b border-slate-950/10 bg-slate-950/[0.02] p-6 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <HistoryIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Riwayat Panggilan
                  </h2>
                  <p className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-white/40">
                    {history.length} Rekaman Tersimpan
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {history.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => exportToCSV(history)}
                      className="rounded-xl border border-emerald-500/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400"
                      title="Ekspor ke CSV"
                    >
                      <FileDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isClearing}
                      className="rounded-xl border border-red-500/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isClearing ? "Menghapus..." : "Hapus Semua"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-950/10 p-2 transition hover:bg-slate-950/5 dark:border-white/10 dark:hover:bg-white/5"
                >
                  <X className="h-6 w-6 text-slate-500 dark:text-white/55" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {sortedHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-slate-950/10 bg-slate-950/[0.03] dark:border-white/10 dark:bg-white/5">
                    <Clock className="h-10 w-10 text-slate-400 dark:text-white/35" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                    Belum Ada Rekaman
                  </h3>
                  <p className="mx-auto max-w-xs text-sm text-slate-500 dark:text-white/55">
                    Selesaikan simulasi panggilan pertama Anda untuk melihat
                    rekaman di sini.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {sortedHistory.map((record) => (
                    <motion.div
                      key={record.id}
                      whileHover={{
                        scale: 1.01,
                        backgroundColor: "rgba(0,0,0,0.03)",
                      }}
                      className="group relative rounded-3xl border border-slate-950/10 bg-slate-950/[0.02] p-5 transition-all dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/5">
                            <Phone className="h-6 w-6 text-emerald-600/60 dark:text-emerald-400/60" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold leading-tight text-slate-900 dark:text-white">
                              {record.scenarioTitle}
                            </h4>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/40">
                              {record.consumerName} · {formatDate(record.date)}
                              {record.configuredDuration
                                ? ` · Limit: ${record.configuredDuration}m`
                                : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {onReviewSession && (
                            <button
                              type="button"
                              onClick={() => onReviewSession(record)}
                              className="rounded-xl border border-slate-950/10 bg-white p-3 text-emerald-600 transition hover:bg-slate-950/5 dark:border-white/10 dark:bg-slate-950/20 dark:text-emerald-400 dark:hover:bg-white/5"
                              title="Lihat Detail"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(record)}
                            disabled={downloadingId === record.id}
                            className="rounded-xl border border-slate-950/10 bg-white p-3 text-emerald-600 transition hover:bg-slate-950/5 disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/20 dark:text-emerald-400 dark:hover:bg-white/5"
                            title="Unduh Rekaman"
                          >
                            {downloadingId === record.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(record.id)}
                            disabled={processingId === record.id}
                            className="rounded-xl border border-red-500/10 bg-red-500/5 p-3 text-red-500 transition hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Hapus"
                          >
                            {processingId === record.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
