import React, { useEffect, useRef, useState } from "react";
import {
  Reply,
  Trash2,
  Paperclip,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import type {
  PdktMailboxItem,
  PdktDimensionKey,
  PdktEvaluationEdu,
} from "@trainers/types";
import {
  PdktActionItemsCard,
  PdktDimensionTip,
  PdktSuggestedRewriteCard,
} from "../../../components/PdktEducationSections";
import ScenarioImage from "./ScenarioImage";
import { ExpectedAnswerAlignmentCard } from "./ExpectedAnswerAlignmentCard";
import {
  getAttachmentDataUri,
  getPdfBlob,
  isPdfAttachment,
} from "../utils/detectMimeType";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

interface EmailDetailPaneProps {
  item: PdktMailboxItem;
  onReply: () => void;
  onDelete: () => void;
  isComposerOpen?: boolean;
  evaluation: any | null;
  evaluationStatus:
    | "not_started"
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | null;
  evaluationError: string | null;
  onRetryEval: () => void;
  onBackToList?: () => void;
}

export const EmailDetailPane: React.FC<EmailDetailPaneProps> = ({
  item,
  onReply,
  onDelete,
  isComposerOpen = false,
  evaluation,
  evaluationStatus,
  evaluationError,
  onRetryEval,
  onBackToList,
}) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const zoomCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!zoomedImage) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      zoomCloseButtonRef.current?.focus();
    });
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomedImage(null);
      } else if (event.key === "Tab") {
        event.preventDefault();
        zoomCloseButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [zoomedImage]);

  const evalStatus = evaluationStatus;
  const evalData = evaluation;
  const evalError = evaluationError;
  const scoreBreakdown = evalData?.scoreBreakdown;
  const edu = evalData?.edu as PdktEvaluationEdu | undefined;
  const breakdownItems: Array<{
    label: string;
    value: number;
    dimension: PdktDimensionKey;
  }> = scoreBreakdown
    ? [
        {
          label: "Arah Penerima",
          value: scoreBreakdown.recipientDirectionScore,
          dimension: "recipientDirection" as const,
        },
        {
          label: "Kualitas OJK",
          value: scoreBreakdown.normativeResponseScore,
          dimension: "normative" as const,
        },
        {
          label: "Kejelasan",
          value: scoreBreakdown.clarityScore,
          dimension: "clarity" as const,
        },
        {
          label: "Typo",
          value: scoreBreakdown.typoScore,
          dimension: "typo" as const,
        },
        {
          label: "Template",
          value: scoreBreakdown.templateComplianceScore,
          dimension: "template" as const,
        },
      ]
    : [];
  const handleRetryEval = onRetryEval;

  const formatEmailDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs} detik`;
    return `${mins} menit ${secs} detik`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatCreatorLabel = (item: PdktMailboxItem) => {
    const creator = item.created_by_user;
    if (!creator) return "Dibuat oleh user lama";
    if (creator.is_current_user) return "Dibuat oleh Anda";
    const role = creator.role ? ` · ${creator.role}` : "";
    return `Dibuat oleh ${creator.full_name}${role}`;
  };

  const subjectLabel = (() => {
    if (item.simulationSubject?.type === "self") {
      return "Untuk diri sendiri saat membalas";
    }
    return formatSimulationSubjectLabel(item.simulationSubject, {
      includeParticipantDetails: true,
    });
  })();

  // Safe check for emails_thread
  const thread = Array.isArray(item.emails_thread) ? item.emails_thread : [];
  const historyEmails = thread.slice(1);
  const isEvaluationProcessing =
    evalStatus === "processing" || evalStatus === "pending";
  const isEvaluationNotStarted = evalStatus === "not_started";
  const isEvaluationFailed = evalStatus === "failed";

  // Extract inbound email fields safely
  const inboundEmail = (item.inbound_email as any) || {
    body: "",
    attachments: [],
  };
  const inboundBody = inboundEmail.body || "";
  const inboundAttachments = Array.isArray(inboundEmail.attachments)
    ? inboundEmail.attachments
    : [];
  const handleAttachmentClick = (base64: string) => {
    const attachmentUri = getAttachmentDataUri(base64);
    if (isPdfAttachment(base64)) {
      try {
        const pdfBlob = getPdfBlob(base64);
        if (!pdfBlob || typeof URL.createObjectURL !== "function") return;

        const objectUrl = URL.createObjectURL(pdfBlob);
        try {
          window.open(objectUrl, "_blank", "noopener,noreferrer");
        } finally {
          window.setTimeout(() => {
            URL.revokeObjectURL?.(objectUrl);
          }, 60_000);
        }
      } catch {
        // Keep malformed attachments and blocked popups from breaking the pane.
      }
      return;
    }

    setZoomedImage(attachmentUri);
  };
  const recipientText = (() => {
    const toValue = inboundEmail.to;
    if (typeof toValue !== "string" || !toValue.trim()) {
      return "konsumen@ojk.go.id";
    }
    return toValue
      .split(",")
      .map((value: string) => value.trim())
      .filter(Boolean)
      .join(", ");
  })();

  return (
    <section
      aria-label="Detail email"
      className="relative flex h-full min-w-0 flex-1 flex-col bg-card text-foreground"
    >
      {/* Zoomed Image Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer transition-opacity"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau lampiran"
          onClick={(event) => {
            if (event.target === event.currentTarget) setZoomedImage(null);
          }}
        >
          <img
            src={zoomedImage}
            alt="Zoomed Attachment"
            className="max-w-full max-h-full rounded-xl object-contain ring-1 ring-white/10"
          />
          <Button
            ref={zoomCloseButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setZoomedImage(null)}
            aria-label="Tutup pratinjau lampiran"
            className="absolute right-6 top-6 min-h-11 min-w-11 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="size-8" />
          </Button>
        </div>
      )}

      {/* Pane Header */}
      <div className="px-6 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {onBackToList && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="-ml-2 mr-1 min-h-11 min-w-11 md:hidden"
              title="Kembali ke Daftar Email"
              aria-label="Kembali ke Daftar Email"
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          )}
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--fg3)]">
              Detail Email
            </span>
            {item.status === "replied" && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  aria-hidden="true"
                  className="w-1.5 h-1.5 bg-[var(--chart-green)] rounded-full"
                />
                <span className="font-semibold text-xs text-[var(--chart-green)]">
                  Telah Dibalas
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {item.status === "open" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onReply}
              className="min-h-11 min-w-11"
              title="Balas"
              aria-label="Balas"
            >
              <Reply aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={item.permissions?.can_delete === false}
            aria-label={
              item.permissions?.can_delete === false
                ? "Tidak memiliki izin menghapus"
                : "Hapus email"
            }
            className="min-h-11 min-w-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            title={
              item.permissions?.can_delete === false
                ? "Hanya pembuat email, admin, atau trainer yang bisa menghapus"
                : "Hapus"
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Subject */}
        <h2
          className={`text-lg md:text-xl leading-snug ${item.subject ? "font-semibold text-[var(--fg)]" : "font-medium text-[var(--fg3)] italic"}`}
        >
          {item.subject || "(Tanpa Subjek)"}
        </h2>

        {/* Sender Info */}
        <div className="flex items-start gap-3 border-b border-[var(--border)] pb-4">
          <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--fg2)]">
            {getInitials(item.sender_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--fg)] truncate">
                  {item.sender_name}
                </div>
                <div className="text-xs text-[var(--fg2)] truncate">
                  {item.sender_email}
                </div>
                <div
                  className="mt-2 grid gap-x-3 gap-y-1 text-[11px] text-[var(--fg2)] sm:grid-cols-2"
                  aria-label="Target simulasi"
                >
                  <span>
                    <span className="text-[var(--fg3)]">Target: </span>
                    {subjectLabel}
                  </span>
                  <span>
                    <span className="text-[var(--fg3)]">Pelaksana: </span>
                    {formatCreatorLabel(item)}
                  </span>
                  {item.simulationSubject?.type === "participant" && (
                    <>
                      <span>
                        <span className="text-[var(--fg3)]">Batch: </span>
                        {item.simulationSubject.batchName || "Tidak tersedia"}
                      </span>
                      <span>
                        <span className="text-[var(--fg3)]">Tim: </span>
                        {item.simulationSubject.team || "Tidak tersedia"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[11px] font-medium text-[var(--fg2)] bg-[var(--bg)] border border-[var(--border)] px-2 py-1 rounded-md whitespace-nowrap">
                {formatEmailDate(item.created_at)}
              </div>
            </div>
            <div className="text-[11px] text-[var(--fg3)]">
              Kepada:{" "}
              <span className="text-[var(--fg2)] font-medium">
                {recipientText}
              </span>
            </div>
          </div>
        </div>

        {/* Email Body */}
        <div className="text-sm text-[var(--fg)] leading-7 space-y-3 text-justify">
          {inboundBody
            .split(/\n\s*\n/)
            .map((paragraph: string, idx: number) => (
              <p key={idx} className="whitespace-pre-wrap text-justify">
                {paragraph.trim()}
              </p>
            ))}
        </div>

        {/* Attachments */}
        {inboundAttachments.length > 0 && (
          <Card className="rounded-xl border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-3.5 h-3.5 text-[var(--fg2)]" />
              <span className="text-xs font-semibold text-[var(--fg2)]">
                Lampiran ({inboundAttachments.length})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inboundAttachments.map((base64: string, i: number) => (
                <ScenarioImage
                  key={i}
                  base64={base64}
                  alt={`Attachment ${i + 1}`}
                  variant="grid"
                  onClick={() => handleAttachmentClick(base64)}
                  className="cursor-pointer hover:opacity-95 transition-opacity"
                />
              ))}
            </div>
          </Card>
        )}

        {/* Evaluation Results (if replied) */}
        {item.status === "replied" && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            {isEvaluationProcessing ? (
              <Card
                className="flex flex-col items-center justify-center border-border bg-muted/30 p-8"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="mb-3 size-8 animate-spin text-primary motion-reduce:animate-none" />
                <p className="text-xs font-semibold text-primary">
                  Menganalisis Jawaban...
                </p>
              </Card>
            ) : isEvaluationNotStarted ? (
              <Card className="border-border bg-muted/30 p-6">
                <p className="text-xs font-medium text-muted-foreground">
                  Evaluasi belum dimulai.
                </p>
              </Card>
            ) : isEvaluationFailed ? (
              <Alert variant="destructive" className="items-start">
                <AlertCircle aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      Evaluasi Gagal
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRetryEval}
                      className="min-h-11 gap-1.5 px-3 text-xs font-medium"
                    >
                      <RotateCcw aria-hidden="true" />
                      Coba Lagi
                    </Button>
                  </div>
                  <AlertDescription className="text-xs leading-relaxed font-medium">
                    {evalError ||
                      "Terjadi gangguan saat memproses evaluasi AI."}
                  </AlertDescription>
                </div>
              </Alert>
            ) : evalData ? (
              <div className="space-y-6">
                {evalData.expectedAnswerAlignment && (
                  <ExpectedAnswerAlignmentCard
                    alignment={evalData.expectedAnswerAlignment}
                  />
                )}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--fg)]">
                      Hasil Evaluasi
                    </h3>
                    {item.time_taken && (
                      <p className="text-[11px] text-[var(--fg2)] font-medium mt-1">
                        Selesai dikerjakan dalam{" "}
                        <span className="text-[var(--fg)]">
                          {formatTime(item.time_taken)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                    <span className="text-xs font-semibold text-[var(--fg2)]">
                      Skor
                    </span>
                    <span className="text-2xl font-black text-[var(--module-pdkt)]">
                      {evalData.score}%
                    </span>
                  </div>
                </div>

                {scoreBreakdown && (
                  <div className="grid gap-2 sm:grid-cols-5">
                    {breakdownItems.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                      >
                        <div className="text-[9px] font-bold uppercase text-[var(--fg3)]">
                          {item.label}
                        </div>
                        <div className="mt-1 text-sm font-black text-[var(--fg)]">
                          {item.value}
                        </div>
                        <PdktDimensionTip
                          dimension={item.dimension}
                          value={item.value}
                          edu={edu}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                    <h4 className="text-xs font-bold text-[var(--fg)] mb-3">
                      Typo / Salah Ketik
                    </h4>
                    {evalData.typos && evalData.typos.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.typos.map((typo: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-xs text-[var(--fg2)] leading-relaxed font-medium"
                          >
                            {typo}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--fg2)] italic font-medium">
                        Tidak ditemukan typo.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                    <h4 className="text-xs font-bold text-[var(--fg)] mb-3">
                      Kejelasan Kalimat
                    </h4>
                    {evalData.clarityIssues &&
                    evalData.clarityIssues.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.clarityIssues.map(
                          (issue: string, idx: number) => (
                            <li
                              key={idx}
                              className="text-xs text-[var(--fg2)] leading-relaxed font-medium"
                            >
                              {issue}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--fg2)] italic font-medium">
                        Kalimat sudah jelas.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                    <h4 className="text-xs font-bold text-[var(--fg)] mb-3">
                      Relevansi Solusi
                    </h4>
                    {evalData.contentGaps && evalData.contentGaps.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.contentGaps.map(
                          (gap: string, idx: number) => (
                            <li
                              key={idx}
                              className="text-xs text-[var(--fg2)] leading-relaxed font-medium"
                            >
                              {gap}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--fg2)] italic font-medium">
                        Jawaban relevan.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                    <h4 className="text-xs font-bold text-[var(--fg)] mb-3">
                      Masukan
                    </h4>
                    <p className="text-xs text-[var(--fg2)] font-medium leading-relaxed italic">
                      &quot;{evalData.feedback}&quot;
                    </p>
                  </div>
                </div>

                {/* Evaluasi Edukatif */}
                <PdktActionItemsCard edu={edu} />
                {edu?.dimensionTips?.recipientDirection &&
                  scoreBreakdown &&
                  scoreBreakdown.recipientDirectionScore <= 60 && (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-500 font-medium leading-relaxed">
                      ⚠️ {edu.dimensionTips.recipientDirection}
                    </div>
                  )}
                <PdktSuggestedRewriteCard edu={edu} />
              </div>
            ) : null}

            {/* Thread History */}
            {historyEmails.length > 0 && (
              <div className="mt-8 pt-6 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowHistory(!showHistory)}
                  aria-expanded={showHistory}
                  aria-controls="pdkt-thread-history"
                  className="mb-4 min-h-11 gap-2 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Riwayat Percakapan ({historyEmails.length})
                  {showHistory ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </Button>

                {showHistory && (
                  <div id="pdkt-thread-history" className="space-y-4">
                    {historyEmails.map((email: any, idx: number) => (
                      <div
                        key={idx}
                        className="pl-6 border-l border-[var(--border)] py-2"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--fg)]">
                            {email.isAgent ? "Balasan Anda" : email.from}
                          </span>
                          <span className="text-[11px] text-[var(--fg3)] font-medium">
                            {formatEmailDate(email.timestamp.toString())}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--fg2)] leading-relaxed space-y-2 font-medium text-justify">
                          {email.body
                            .split(/\n\s*\n/)
                            .map((paragraph: string, pIdx: number) => (
                              <p
                                key={pIdx}
                                className="whitespace-pre-wrap text-justify"
                              >
                                {paragraph.trim()}
                              </p>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reply Button */}
      {item.status === "open" && !isComposerOpen && (
        <div className="px-6 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--bg)]">
          <Button
            type="button"
            variant="outline"
            onClick={onReply}
            className="min-h-11 gap-2 px-4 text-xs font-semibold"
          >
            <Reply aria-hidden="true" />
            Balas
          </Button>
        </div>
      )}
    </section>
  );
};
