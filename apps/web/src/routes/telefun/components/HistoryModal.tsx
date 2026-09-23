import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Clock, History as HistoryIcon, FileDown } from "lucide-react";
import type { CallRecord } from "../types";
import { getTelefunScoringStatusLabel } from "../types";
import { notify } from "../../../lib/toast";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

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

function formatHistoryTarget(record: CallRecord): string {
  return formatSimulationSubjectLabel(record.simulationSubject, {
    includeParticipantDetails: false,
  });
}

function shouldShowHistoryTarget(record: CallRecord, targetLabel: string) {
  if (!record.simulationSubject) return true;
  if (targetLabel === "Target tidak tercatat — sesi lama") return true;
  if (targetLabel.includes("record peserta tidak lagi tersedia")) return true;
  return targetLabel !== record.consumerName;
}

function formatHistoryDuration(record: CallRecord): string {
  const actualDuration = formatDuration(record.duration);
  return record.configuredDuration
    ? `${actualDuration} · batas ${record.configuredDuration} menit`
    : actualDuration;
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

const SCORING_STATUS_TEXT_CLASSES: Record<
  NonNullable<ReturnType<typeof getTelefunScoringStatusLabel>>["tone"],
  string
> = {
  waiting: "text-muted-foreground",
  processing: "text-muted-foreground",
  retryable: "text-muted-foreground",
  failed: "text-destructive",
  ready: "text-module-telefun",
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCloseRef.current();
            }}
            className="absolute inset-0 bg-background/80"
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
            className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card sm:max-h-[calc(100dvh-3rem)]"
          >
            {/* Header */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                <HistoryIcon
                  className="mt-1 h-5 w-5 shrink-0 text-module-telefun"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2
                    id="telefun-history-title"
                    className="font-heading text-xl font-bold leading-tight text-foreground sm:text-2xl"
                  >
                    Riwayat Panggilan
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {history.length} rekaman tersimpan
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {history.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => exportToCSV(history)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      title="Ekspor ke CSV"
                      aria-label="Ekspor riwayat panggilan ke CSV"
                    >
                      <FileDown
                        className="h-4 w-4 text-module-telefun"
                        aria-hidden="true"
                      />
                      <span>Ekspor CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isClearing}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                    >
                      {isClearing ? "Menghapus..." : "Hapus semua"}
                    </button>
                  </>
                )}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onCloseRef.current()}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 scrollbar-hide sm:px-6">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Clock
                    className="mb-4 h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="text-lg font-semibold text-foreground">
                    Belum Ada Rekaman
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Selesaikan simulasi panggilan pertama Anda untuk melihat
                    rekaman di sini.
                  </p>
                </div>
              ) : (
                <ul
                  aria-label="Daftar riwayat panggilan"
                  className="divide-y divide-border"
                >
                  {sortedHistory.map((rec) => {
                    const scoringLabel = getTelefunScoringStatusLabel(rec);
                    const targetLabel = formatHistoryTarget(rec);
                    const isDownloading = downloadingId === rec.id;
                    const isProcessing = processingId === rec.id;
                    return (
                      <li
                        key={rec.id}
                        className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h4 className="font-heading text-base font-semibold leading-tight text-foreground">
                              {rec.scenarioTitle}
                            </h4>
                            {scoringLabel && (
                              <span
                                className={`text-sm font-medium ${SCORING_STATUS_TEXT_CLASSES[scoringLabel.tone]}`}
                              >
                                {scoringLabel.text}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <span>{rec.consumerName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDate(rec.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatHistoryDuration(rec)}</span>
                          </p>
                          {shouldShowHistoryTarget(rec, targetLabel) && (
                            <p className="mt-2 break-words text-sm text-muted-foreground">
                              Target: {targetLabel}
                            </p>
                          )}
                        </div>

                        <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                          {onReviewSession && (
                            <Button
                              type="button"
                              variant="link"
                              size="lg"
                              onClick={() => onReviewSession(rec)}
                              className="min-h-[44px] px-2 font-semibold text-module-telefun"
                              aria-label={`Lihat detail ${rec.scenarioTitle}`}
                            >
                              Lihat detail
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="lg"
                                  className="min-h-[44px] px-2 text-muted-foreground hover:text-foreground"
                                  aria-label={
                                    isDownloading
                                      ? `Mengunduh rekaman ${rec.scenarioTitle}`
                                      : isProcessing
                                        ? `Menghapus ${rec.scenarioTitle}`
                                        : `Aksi lainnya untuk ${rec.scenarioTitle}`
                                  }
                                  disabled={isDownloading || isProcessing}
                                />
                              }
                            >
                              {isDownloading
                                ? "Mengunduh..."
                                : isProcessing
                                  ? "Menghapus..."
                                  : "Lainnya"}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              positionerClassName="z-[210]"
                              className="w-44"
                            >
                              <DropdownMenuItem
                                disabled={isDownloading}
                                onClick={() => void handleDownload(rec)}
                                className="min-h-[44px]"
                              >
                                {isDownloading
                                  ? "Mengunduh..."
                                  : "Unduh rekaman"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isProcessing}
                                onClick={() => void handleDelete(rec.id)}
                                variant="destructive"
                                className="min-h-[44px]"
                              >
                                {isProcessing
                                  ? "Menghapus..."
                                  : "Hapus riwayat"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
