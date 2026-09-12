import { useState } from "react";
import {
  X,
  History,
  Trash2,
  ChevronRight,
  MessageSquare,
  Calendar,
  Clock,
  Database,
  Play,
  Download,
} from "lucide-react";
import type { KetikSessionHistoryItem } from "@trainers/types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Separator } from "../../../components/ui/separator";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { useAuthStore } from "../../../store/authStore";
import { notify } from "../../../lib/toast";
import { SessionReplayModal } from "./SessionReplayModal";

function downloadTranscript(session: KetikSessionHistoryItem) {
  const header = [
    "=== TRANSCRIPT SIMULASI KETIK ===",
    `Skema: ${session.scenarioTitle}`,
    (() => {
      try {
        const em =
          (useAuthStore.getState() as any)?.profile?.email ??
          (useAuthStore.getState() as any)?.session?.user?.email;
        if (em) return "Pelaksana: " + em;
      } catch (_e) {
        /* auth store unavailable in some contexts */
      }
      return "Pelaksana: (akun pemilik sesi)";
    })(),
    `Peserta: ${formatSimulationSubjectLabel(session.simulationSubject, { includeParticipantDetails: true })}`,
    `Konsumen: ${session.consumerName}${session.consumerPhone ? ` (${session.consumerPhone})` : ""}${session.consumerCity ? ` - ${session.consumerCity}` : ""}`,
    `Tanggal: ${new Date(session.date).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}`,
    session.simulationDuration
      ? `Durasi: ${session.simulationDuration} menit`
      : "",
    "",
    "--- Percakapan ---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = session.messages
    .filter((m) => m.sender !== "system")
    .map((m) => {
      const label = m.sender === "agent" ? "Agent" : "Konsumen";
      const time = new Date(m.timestamp).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${time}] ${label}: ${m.text}`;
    })
    .join("\n\n");

  let footer = "";
  if (session.finalScore !== undefined) {
    footer += `\n\n--- Skor ---\n`;
    footer += `Final Score: ${session.finalScore}\n`;
    if (session.empathyScore !== undefined)
      footer += `Empathy: ${session.empathyScore}\n`;
    if (session.probingScore !== undefined)
      footer += `Probing: ${session.probingScore}\n`;
    if (session.resolutionScore !== undefined)
      footer += `Resolution: ${session.resolutionScore}\n`;
    if (session.typoScore !== undefined)
      footer += `Typo: ${session.typoScore}\n`;
    if (session.complianceScore !== undefined)
      footer += `Compliance: ${session.complianceScore}\n`;
  }

  const content = header + "\n" + body + footer;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript_${session.scenarioTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${session.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  notify.success("Transcript downloaded");
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: KetikSessionHistoryItem[];
  onClear: () => void;
  onDelete: (id: string) => void;
  onReview: (session: KetikSessionHistoryItem) => void;
}

export function HistoryModal({
  isOpen,
  onClose,
  history,
  onClear,
  onDelete,
  onReview,
}: HistoryModalProps) {
  const [replaySession, setReplaySession] =
    useState<KetikSessionHistoryItem | null>(null);

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          data-module="ketik"
          className="!w-[calc(100vw-2rem)] !max-w-3xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-module-ketik/10">
                  <History className="size-5 text-module-ketik" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg tracking-tight sm:text-xl">
                    Riwayat Simulasi
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    Tinjau kembali percakapan sebelumnya.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {history.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      onClick={() => history.forEach(downloadTranscript)}
                      aria-label="Download semua transcript"
                      title="Download Semua"
                    >
                      <Download data-icon="inline" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Hapus semua riwayat?")) onClear();
                      }}
                      aria-label="Hapus semua riwayat"
                      title="Hapus Semua"
                    >
                      <Trash2 data-icon="inline" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={onClose}
                  aria-label="Tutup riwayat simulasi"
                >
                  <X data-icon="inline" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {history.length === 0 ? (
              <Empty className="min-h-80 border-0 py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="size-16 rounded-2xl">
                    <Database className="size-8 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle className="text-lg">
                    Belum ada riwayat simulasi.
                  </EmptyTitle>
                  <EmptyDescription>
                    Mulai sesi simulasi baru untuk melihat riwayat di sini.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-4">
                {history.map((session) => {
                  const reviewStatusLabel =
                    session.reviewStatus === "completed"
                      ? "Selesai"
                      : session.reviewStatus === "pending" ||
                          session.reviewStatus === "processing"
                        ? "Proses"
                        : "Gagal";
                  const reviewStatusVariant =
                    session.reviewStatus === "completed"
                      ? "secondary"
                      : session.reviewStatus === "pending" ||
                          session.reviewStatus === "processing"
                        ? "outline"
                        : "destructive";

                  return (
                    <Card
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Lihat sesi ${session.scenarioTitle}`}
                      className="group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onReview(session)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onReview(session);
                        }
                      }}
                    >
                      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-module-ketik/10">
                            <MessageSquare className="size-5 text-module-ketik" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-base sm:text-lg">
                              {session.scenarioTitle}
                            </CardTitle>
                            <CardDescription className="mt-1 break-words text-xs">
                              Target: Peserta:{" "}
                              {formatSimulationSubjectLabel(
                                session.simulationSubject,
                                { includeParticipantDetails: true },
                              )}
                            </CardDescription>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="size-3.5" />
                                {new Date(session.date).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="size-3.5" />
                                {new Date(session.date).toLocaleTimeString(
                                  "id-ID",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            onClick={(event) => {
                              event.stopPropagation();
                              downloadTranscript(session);
                            }}
                            aria-label="Download transcript"
                            title="Download Transcript"
                          >
                            <Download data-icon="inline" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            onClick={(event) => {
                              event.stopPropagation();
                              setReplaySession(session);
                            }}
                            aria-label="Replay sesi"
                            title="Replay Sesi"
                          >
                            <Play data-icon="inline" fill="currentColor" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            className="text-destructive hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(session.id);
                            }}
                            aria-label="Hapus sesi"
                            title="Hapus Sesi"
                          >
                            <Trash2 data-icon="inline" />
                          </Button>
                        </div>
                      </CardHeader>

                      <Separator />
                      <CardContent className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Konsumen
                          </span>
                          <span className="break-words text-xs font-medium text-foreground">
                            {session.consumerName}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Intensitas
                          </span>
                          <span className="text-xs font-medium text-foreground">
                            {session.messages.length} Chat
                          </span>
                        </div>
                        {session.simulationDuration && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              Durasi
                            </span>
                            <span className="text-xs font-medium text-foreground">
                              {session.simulationDuration} mnt
                            </span>
                          </div>
                        )}
                        {session.reviewStatus && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              Review AI
                            </span>
                            <Badge
                              variant={reviewStatusVariant}
                              className="animate-none uppercase"
                            >
                              {reviewStatusLabel}
                            </Badge>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="justify-end py-2">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          Buka detail
                          <ChevronRight className="size-4" />
                        </span>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />
          <DialogFooter className="!mx-0 !mb-0 shrink-0 justify-center rounded-none border-0 bg-card px-5 py-4 sm:px-6">
            <p className="inline-flex items-center gap-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <Database className="size-3" />
              Data lokal terenkripsi di browser Anda
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionReplayModal
        isOpen={!!replaySession}
        onClose={() => setReplaySession(null)}
        messages={replaySession?.messages || []}
        scenarioTitle={replaySession?.scenarioTitle}
        consumerName={replaySession?.consumerName}
      />
    </>
  );
}
