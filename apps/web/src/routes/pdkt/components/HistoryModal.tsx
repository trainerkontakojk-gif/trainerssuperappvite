import React, { useEffect, useRef } from "react";
import {
  X,
  Trash2,
  Calendar,
  Clock,
  History as HistoryIcon,
  Eye,
  User,
  Tag,
  Loader2,
  AlertTriangle,
  Download,
} from "lucide-react";
import type {
  PdktScenario,
  PdktConsumerType,
  PdktMailboxItem,
  SimulationSubjectSnapshot,
} from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";

export interface SessionHistory {
  id: string;
  timestamp: string | Date;
  user_id?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  config: {
    scenarios: PdktScenario[];
    consumerType: PdktConsumerType;
    writingStyleMode?: "realistic" | "training";
  };
  emails: PdktMailboxItem[];
  evaluation: any;
  evaluationStatus:
    | "not_started"
    | "pending"
    | "completed"
    | "processing"
    | "failed";
  evaluationError?: string | null;
  timeTaken?: number | null;
  simulationSubject?: SimulationSubjectSnapshot | null;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function downloadHistory(history: SessionHistory[]): void {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const rows = [
    [
      "Waktu",
      "Subjek email",
      "Target",
      "Batch",
      "Tim",
      "Pelaksana",
      "Role",
      "Status",
      "Skor",
    ],
    ...history.map((session) => {
      const subject = session.simulationSubject;
      return [
        new Date(session.timestamp).toISOString(),
        session.emails.at(-1)?.subject ?? "",
        formatSimulationSubjectLabel(subject),
        subject?.type === "participant" ? (subject.batchName ?? "") : "",
        subject?.type === "participant" ? (subject.team ?? "") : "",
        session.user_email ?? "",
        session.user_role ?? "",
        session.evaluationStatus,
        session.evaluation?.score ?? "",
      ];
    }),
  ];
  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\n")],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pdkt-history-${Date.now()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: SessionHistory[];
  onSelectSession: (session: SessionHistory) => void;
  onDeleteSession: (id: string) => void;
  onClearHistory: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelectSession,
  onDeleteSession,
  onClearHistory,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

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
      ).filter((element) => !element.closest("[hidden]"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const dialog = dialogRef.current;
      if (focusableElements.length === 0 || !dialog) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        event.shiftKey &&
        (!active || active === first || !dialog.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (!active || active === last || !dialog.contains(active))
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Dialog Shell */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-3xl bg-[var(--surface)] rounded-2xl overflow-hidden border border-[var(--border)] flex flex-col h-[85vh] max-h-dvh transition-all transform scale-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdkt-history-title"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--module-pdkt-bg)] flex items-center justify-center border border-[var(--border)]">
              <HistoryIcon className="w-5 h-5 text-[var(--module-pdkt)]" />
            </div>
            <div>
              <h3
                id="pdkt-history-title"
                className="text-sm font-bold text-[var(--fg)]"
              >
                Riwayat Simulasi PDKT
              </h3>
              <p className="text-[10px] text-[var(--fg2)] mt-0.5 uppercase tracking-widest font-semibold">
                {history.length} Sesi PDKT Tersimpan
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {history.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => downloadHistory(history)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--fg2)] transition-all hover:bg-[var(--bg)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
                  aria-label="Unduh riwayat PDKT CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "Apakah Anda yakin ingin menghapus semua riwayat?",
                      )
                    )
                      onClearHistory();
                  }}
                  className="min-h-11 rounded-lg border border-red-500/20 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-red-700 transition-all hover:bg-red-500/10 hover:border-red-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-300"
                >
                  Hapus Semua
                </button>
              </>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => onCloseRef.current()}
              className="min-h-11 min-w-11 rounded-xl p-2 text-[var(--fg2)] transition-all hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
              aria-label="Tutup riwayat PDKT"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 bg-[var(--bg)]">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-[var(--bg)] rounded-full flex items-center justify-center mb-4 border border-[var(--border)]">
                <Clock className="w-8 h-8 text-[var(--fg3)]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--fg)]">
                Belum Ada Riwayat
              </h3>
              <p className="text-[var(--fg2)] text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                Selesaikan simulasi pertama Anda untuk melihat riwayatnya di
                sini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((session) => {
                const score = session.evaluation?.score || 0;
                const scoreColor =
                  score >= 80
                    ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                    : score >= 60
                      ? "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20"
                      : "text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/20";

                const statusBadge =
                  session.evaluationStatus === "processing" ||
                  session.evaluationStatus === "pending"
                    ? "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/20"
                    : session.evaluationStatus === "failed"
                      ? "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20"
                      : scoreColor;

                const lastEmail = session.emails[session.emails.length - 1];
                const emailSubject = lastEmail?.subject || "Tanpa Subjek";
                const simulationSubject = session.simulationSubject;
                const subjectLabel = formatSimulationSubjectLabel(simulationSubject);

                return (
                  <article
                    key={session.id}
                    className="relative group bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 transition-all hover:border-[var(--module-pdkt)] overflow-hidden flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div
                            className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 ${statusBadge}`}
                          >
                            {session.evaluationStatus === "processing" ||
                            session.evaluationStatus === "pending" ? (
                              <>
                                <Loader2 className="w-2.5 h-2.5 animate-spin motion-reduce:animate-none" />
                                Evaluasi
                              </>
                            ) : session.evaluationStatus === "failed" ? (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Gagal
                              </>
                            ) : session.evaluationStatus === "completed" ? (
                              <>Skor: {score}</>
                            ) : (
                              <>Belum dinilai</>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-[var(--fg3)] font-medium">
                            <Calendar className="w-3 h-3 shrink-0" />
                            {new Date(session.timestamp).toLocaleDateString(
                              "id-ID",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                            <span className="mx-1">•</span>
                            {new Date(session.timestamp).toLocaleTimeString(
                              "id-ID",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </div>
                        </div>
                        <h4 className="text-xs font-bold leading-tight transition-colors line-clamp-1 text-[var(--fg)] pr-24 sm:pr-12">
                          <button
                            type="button"
                            onClick={() => onSelectSession(session)}
                            className="block max-w-full truncate text-left text-[var(--fg)] hover:text-[var(--module-pdkt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
                          >
                            {emailSubject}
                          </button>
                        </h4>
                      </div>

                      <div className="absolute right-4 top-4 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => onSelectSession(session)}
                          className="min-h-11 min-w-11 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 text-[var(--fg2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
                          title="Lihat Detail"
                          aria-label={`Lihat detail ${emailSubject}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSession(session.id)}
                          className="min-h-11 min-w-11 rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-700 transition-colors hover:bg-red-500/20 hover:text-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-300 dark:hover:text-red-200"
                          title="Hapus"
                          aria-label={`Hapus ${emailSubject}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div
                      className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[var(--border)] min-w-0"
                      aria-label="Ringkasan sesi"
                    >
                      <div className="flex items-center gap-1 text-[9px] text-[var(--fg2)] bg-[var(--bg)] px-2 py-0.5 rounded-full border border-[var(--border)] max-w-[150px] shrink-0">
                        <User className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">
                          {session.config.consumerType.name}
                        </span>
                      </div>
                      {session.config.scenarios.slice(0, 2).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1 text-[9px] text-[var(--fg2)] bg-[var(--bg)] px-2 py-0.5 rounded-full border border-[var(--border)] max-w-[150px] shrink-0"
                        >
                          <Tag className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </div>
                      ))}
                      {session.config.scenarios.length > 2 && (
                        <div className="text-[9px] text-[var(--fg3)] font-semibold px-1 py-0.5 shrink-0">
                          +{session.config.scenarios.length - 2} lainnya
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[9px] text-[var(--fg2)] bg-[var(--bg)] px-2 py-0.5 rounded-full border border-[var(--border)] max-w-[220px] shrink-0">
                        <User className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">Target: {subjectLabel}</span>
                      </div>
                      {simulationSubject?.type === "participant" && (
                        <>
                          {simulationSubject.batchName && (
                            <span className="text-[9px] text-[var(--fg2)]">
                              Batch: {simulationSubject.batchName}
                            </span>
                          )}
                          {simulationSubject.team && (
                            <span className="text-[9px] text-[var(--fg2)]">
                              Tim: {simulationSubject.team}
                            </span>
                          )}
                        </>
                      )}
                      {(session.user_email || session.user_role) && (
                        <span className="text-[9px] text-[var(--fg2)]">
                          Pelaksana: {session.user_email || "-"}
                          {session.user_role ? ` · ${session.user_role}` : ""}
                        </span>
                      )}
                      {session.evaluationStatus === "failed" &&
                        session.evaluationError && (
                          <div className="text-[9px] text-red-700 dark:text-red-300 font-semibold max-w-xs truncate shrink-0">
                            {session.evaluationError}
                          </div>
                        )}
                      {session.timeTaken != null && (
                        <div className="flex items-center gap-1 text-[9px] text-[var(--fg2)] bg-[var(--bg)] px-2 py-0.5 rounded-full border border-[var(--border)] ml-auto shrink-0">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {Math.floor(session.timeTaken / 60)}m{" "}
                          {session.timeTaken % 60}s
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
