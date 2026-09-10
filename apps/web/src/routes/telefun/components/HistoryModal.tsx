import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { getTelefunScoringStatusLabel } from "../types";
import { notify } from "../../../lib/toast";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";

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
    "Peserta",
    "Pelaksana",
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
    formatSimulationSubjectLabel(record.simulationSubject, {
      includeParticipantDetails: true,
    }),
    (record as any).userEmail ?? (record as any).userId ?? "",
  ]);

  const escapeCsv = (val: string) => {
    let v = String(val);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
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

const SCORING_STATUS_ICONS: Record<
  NonNullable<ReturnType<typeof getTelefunScoringStatusLabel>>["tone"],
  React.ReactNode
> = {
  waiting: <Clock className="h-3 w-3 text-amber-500" aria-hidden />,
  processing: (
    <HistoryIcon
      className="h-3 w-3 text-sky-500 animate-pulse motion-reduce:animate-none"
      aria-hidden
    />
  ),
  retryable: <Clock className="h-3 w-3 text-amber-500" aria-hidden />,
  failed: <Trash2 className="h-3 w-3 text-red-500" aria-hidden />,
  ready: <Eye className="h-3 w-3 text-emerald-500" aria-hidden />,
};

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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const getFocusableElements = () => {
      if (!dialogRef.current) return [] as HTMLElement[];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        event.shiftKey &&
        (!active || active === first || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (!active || active === last || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

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
        const json = await unwrapResponse(
          await telefunClient.recording[":id"].$get({
            param: { id: record.id },
          }),
        );
        if ((json as any)?.url) {
          downloadUrl = (json as any).url;
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
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCloseRef.current();
            }}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="telefun-history-title"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="relative w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] max-h-dvh"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-b border-border shrink-0 bg-foreground/[0.02]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <HistoryIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2
                    id="telefun-history-title"
                    className="text-2xl font-bold tracking-tight text-foreground"
                  >
                    Riwayat Panggilan
                  </h2>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
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
                      className="min-h-11 min-w-11 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all border border-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      title="Ekspor ke CSV"
                      aria-label="Ekspor riwayat panggilan ke CSV"
                    >
                      <FileDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isClearing}
                      className="min-h-11 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {isClearing ? "Menghapus..." : "Hapus Semua"}
                    </button>
                  </>
                )}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onCloseRef.current()}
                  className="min-h-11 min-w-11 p-2 hover:bg-foreground/5 rounded-full transition-colors border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label="Tutup riwayat panggilan"
                >
                  <X
                    className="w-6 h-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-20 bg-foreground/5 rounded-full flex items-center justify-center mb-6 border border-border">
                    <Clock className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    Belum Ada Rekaman
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto font-light">
                    Selesaikan simulasi panggilan pertama Anda untuk melihat
                    rekaman di sini.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {sortedHistory.map((rec) => {
                    const scoringLabel = getTelefunScoringStatusLabel(rec);
                    return (
                      <motion.div
                        key={rec.id}
                        whileHover={
                          shouldReduceMotion
                            ? undefined
                            : {
                                scale: 1.01,
                                backgroundColor: "rgba(var(--foreground),0.03)",
                              }
                        }
                        className="group relative bg-foreground/[0.02] border border-border rounded-3xl p-5 transition-all"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-emerald-500/5 rounded-2xl flex items-center justify-center border border-emerald-500/10">
                              <Phone className="w-6 h-6 text-emerald-600/60 dark:text-emerald-400/60" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-foreground leading-tight">
                                {rec.scenarioTitle}
                              </h4>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                                {rec.consumerName} · {formatDate(rec.date)}
                                {rec.configuredDuration
                                  ? ` · Limit: ${rec.configuredDuration}m`
                                  : ""}
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                Target: {formatSimulationSubjectLabel(rec.simulationSubject, { includeParticipantDetails: true })}
                              </p>
                              {scoringLabel && (
                                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                                  {SCORING_STATUS_ICONS[scoringLabel.tone]}
                                  <span>{scoringLabel.text}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {onReviewSession && (
                              <button
                                type="button"
                                onClick={() => onReviewSession(rec)}
                                className="min-h-11 min-w-11 p-3 bg-foreground/5 hover:bg-foreground/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                title="Lihat Detail"
                                aria-label={`Lihat detail ${rec.scenarioTitle}`}
                              >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownload(rec)}
                              disabled={downloadingId === rec.id}
                              className="min-h-11 min-w-11 p-3 bg-foreground/5 hover:bg-foreground/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-border transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              title="Unduh Rekaman"
                              aria-label={`Unduh rekaman ${rec.scenarioTitle}`}
                            >
                              {downloadingId === rec.id ? (
                                <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin motion-reduce:animate-none" />
                              ) : (
                                <Download
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(rec.id)}
                              disabled={processingId === rec.id}
                              className="min-h-11 min-w-11 p-3 bg-red-500/5 hover:bg-red-500/10 text-red-500 rounded-xl border border-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              title="Hapus"
                              aria-label={`Hapus ${rec.scenarioTitle}`}
                            >
                              {processingId === rec.id ? (
                                <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin motion-reduce:animate-none" />
                              ) : (
                                <Trash2
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
