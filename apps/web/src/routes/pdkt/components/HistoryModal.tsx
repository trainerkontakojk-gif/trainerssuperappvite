import React, { useState } from "react";
import {
  X,
  Trash2,
  Calendar,
  Clock,
  History as HistoryIcon,
  Eye,
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
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../../components/ui/empty";

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
  } | null;
  emails: Array<PdktMailboxItem | { subject?: string | null } | null> | null;
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

function getSessionEmails(
  session: SessionHistory,
): Array<{ subject?: unknown }> {
  return Array.isArray(session.emails)
    ? (session.emails.filter(Boolean) as Array<{ subject?: unknown }>)
    : [];
}

function getSessionScenarios(session: SessionHistory): PdktScenario[] {
  const scenarios = (session.config as { scenarios?: unknown } | null)
    ?.scenarios;
  return Array.isArray(scenarios) ? (scenarios as PdktScenario[]) : [];
}

function getSessionConsumerName(session: SessionHistory): string {
  const name = (
    session.config as { consumerType?: { name?: unknown } | null } | null
  )?.consumerType?.name;
  return typeof name === "string" && name.trim() ? name : "Konsumen";
}

function statusBadgeClass(session: SessionHistory): string {
  if (
    session.evaluationStatus === "processing" ||
    session.evaluationStatus === "pending"
  ) {
    return "border-[var(--chart-amber)]/30 text-[var(--chart-amber)]";
  }
  if (session.evaluationStatus === "failed") {
    return "border-destructive/30 text-destructive";
  }
  if (session.evaluationStatus === "completed") {
    return "border-[var(--chart-green)]/30 text-[var(--chart-green)]";
  }
  return "border-border text-muted-foreground";
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
      const emails = getSessionEmails(session);
      return [
        new Date(session.timestamp).toISOString(),
        String(emails.at(-1)?.subject ?? ""),
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
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );

  if (!isOpen) return null;

  return (
    <div ref={setDialogContainer} className="contents">
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          container={dialogContainer}
          aria-labelledby="pdkt-history-title"
          showCloseButton={false}
          className="w-[calc(100vw-2rem)] max-w-3xl sm:max-w-3xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle
                  id="pdkt-history-title"
                  className="text-lg tracking-tight"
                >
                  Riwayat Simulasi PDKT
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {history.length} Sesi PDKT Tersimpan
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {history.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => downloadHistory(history)}
                      className="min-h-11"
                      aria-label="Unduh riwayat PDKT CSV"
                    >
                      <Download data-icon="inline-start" />
                      Export CSV
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        if (
                          confirm(
                            "Apakah Anda yakin ingin menghapus semua riwayat?",
                          )
                        )
                          onClearHistory();
                      }}
                      className="min-h-11"
                    >
                      Hapus Semua
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={onClose}
                  aria-label="Tutup riwayat PDKT"
                >
                  <X data-icon="inline" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {history.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HistoryIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Belum Ada Riwayat</EmptyTitle>
                  <EmptyDescription>
                    Selesaikan simulasi pertama Anda untuk melihat riwayatnya di
                    sini.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {history.map((session) => {
                  const emails = getSessionEmails(session);
                  const scenarios = getSessionScenarios(session);
                  const consumerName = getSessionConsumerName(session);
                  const score =
                    typeof session.evaluation?.score === "number"
                      ? session.evaluation.score
                      : 0;
                  const lastEmail = emails[emails.length - 1];
                  const emailSubject =
                    typeof lastEmail?.subject === "string" &&
                    lastEmail.subject.trim()
                      ? lastEmail.subject
                      : "Tanpa Subjek";
                  const simulationSubject = session.simulationSubject;
                  const subjectLabel =
                    formatSimulationSubjectLabel(simulationSubject);
                  const timestamp = new Date(session.timestamp);

                  return (
                    <li
                      key={session.id}
                      className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Badge
                              variant="outline"
                              className={statusBadgeClass(session)}
                            >
                              {session.evaluationStatus === "processing" ||
                              session.evaluationStatus === "pending" ? (
                                <>
                                  <Loader2
                                    aria-hidden="true"
                                    className="animate-spin motion-reduce:animate-none"
                                    data-icon="inline-start"
                                  />
                                  Evaluasi berjalan
                                </>
                              ) : session.evaluationStatus === "failed" ? (
                                <>
                                  <AlertTriangle
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                  />
                                  Gagal
                                </>
                              ) : session.evaluationStatus === "completed" ? (
                                <>Skor: {score}</>
                              ) : (
                                <>Belum dinilai</>
                              )}
                            </Badge>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar
                                aria-hidden="true"
                                className="size-3.5 shrink-0"
                              />
                              {timestamp.toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                              <span aria-hidden="true">·</span>
                              {timestamp.toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => onSelectSession(session)}
                            className="mt-2 block max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-4 outline-none transition-colors hover:text-module-pdkt hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {emailSubject}
                          </button>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="truncate">{consumerName}</span>
                            {scenarios.slice(0, 2).map((scenario) => (
                              <span key={scenario.id} className="truncate">
                                {scenario.title}
                              </span>
                            ))}
                            {scenarios.length > 2 && (
                              <span>+{scenarios.length - 2} lainnya</span>
                            )}
                            <span className="truncate">
                              Target: {subjectLabel}
                            </span>
                            {(session.user_email || session.user_role) && (
                              <span className="truncate">
                                Pelaksana: {session.user_email || "-"}
                                {session.user_role
                                  ? ` · ${session.user_role}`
                                  : ""}
                              </span>
                            )}
                            {session.timeTaken != null && (
                              <span className="flex items-center gap-1.5">
                                <Clock
                                  aria-hidden="true"
                                  className="size-3.5 shrink-0"
                                />
                                {Math.floor(session.timeTaken / 60)}m{" "}
                                {session.timeTaken % 60}s
                              </span>
                            )}
                          </div>

                          {session.evaluationStatus === "failed" &&
                            session.evaluationError && (
                              <p className="mt-2 text-xs text-destructive">
                                {session.evaluationError}
                              </p>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onSelectSession(session)}
                            className="min-h-11"
                            aria-label={`Lihat detail ${emailSubject}`}
                          >
                            <Eye data-icon="inline-start" />
                            Buka
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => onDeleteSession(session.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Hapus ${emailSubject}`}
                          >
                            <Trash2 data-icon="inline" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
