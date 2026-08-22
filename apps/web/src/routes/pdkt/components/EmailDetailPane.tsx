import React, { useState } from "react";
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
import {
  getAttachmentDataUri,
  getPdfBlob,
  isPdfAttachment,
} from "../utils/detectMimeType";

interface EmailDetailPaneProps {
  item: PdktMailboxItem;
  onReply: () => void;
  onDelete: () => void;
  isComposerOpen?: boolean;
  evaluation: any | null;
  evaluationStatus: "pending" | "processing" | "completed" | "failed" | null;
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
        { label: "Typo", value: scoreBreakdown.typoScore, dimension: "typo" as const },
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

  // Safe check for emails_thread
  const thread = Array.isArray(item.emails_thread) ? item.emails_thread : [];
  const historyEmails = thread.slice(1);
  const isEvaluationProcessing =
    evalStatus === "processing" || evalStatus === "pending";
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
    <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface)] text-[var(--fg)] relative h-full">
      {/* Zoomed Image Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer transition-opacity"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt="Zoomed Attachment"
            className="max-w-full max-h-full rounded-xl object-contain ring-1 ring-white/10"
          />
          <button className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors">
            <X className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Pane Header */}
      <div className="px-6 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="min-w-10 min-h-10 -ml-2 flex items-center justify-center hover:bg-[var(--bg)] rounded-lg transition-colors md:hidden mr-1"
              title="Kembali ke Daftar Email"
              aria-label="Kembali ke Daftar Email"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--fg2)]" />
            </button>
          )}
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--fg3)]">
              Detail Email
            </span>
            {item.status === "replied" && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 bg-[var(--chart-green)] rounded-full" />
                <span className="font-semibold text-xs text-[var(--chart-green)]">
                  Telah Dibalas
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {item.status === "open" && (
            <button
              onClick={onReply}
              className="min-w-10 min-h-10 text-[var(--fg2)] hover:text-[var(--fg)] hover:bg-[var(--bg)] rounded-lg transition-all flex items-center justify-center"
              title="Balas"
              aria-label="Balas"
            >
              <Reply className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={item.permissions?.can_delete === false}
            className={`p-2 rounded-xl transition-all ${
              item.permissions?.can_delete === false
                ? "text-[var(--fg3)] opacity-40 cursor-not-allowed"
                : "text-[var(--fg2)] hover:bg-[var(--bg)] hover:text-[var(--destructive)]"
            }`}
            title={
              item.permissions?.can_delete === false
                ? "Hanya pembuat email, admin, atau trainer yang bisa menghapus"
                : "Hapus"
            }
          >
            <Trash2 className="w-4 h-4" />
          </button>
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
                <div className="text-[11px] text-[var(--fg3)] mt-1">
                  {formatCreatorLabel(item)}
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
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
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
          </div>
        )}

        {/* Evaluation Results (if replied) */}
        {item.status === "replied" && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            {isEvaluationProcessing ? (
              <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                <Loader2 className="w-8 h-8 text-[var(--module-pdkt)] animate-spin mb-3" />
                <p className="text-xs font-semibold text-[var(--module-pdkt)] animate-pulse">
                  Menganalisis Jawaban...
                </p>
              </div>
            ) : isEvaluationFailed ? (
              <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[var(--destructive)]" />
                    <h3 className="text-xs font-semibold text-[var(--fg)]">
                      Evaluasi Gagal
                    </h3>
                  </div>
                  <button
                    onClick={handleRetryEval}
                    className="flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-[var(--border)] text-[var(--fg)] text-xs font-medium hover:bg-[var(--surface)] transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Coba Lagi
                  </button>
                </div>
                <p className="text-xs text-[var(--fg2)] leading-relaxed font-medium">
                  {evalError || "Terjadi gangguan saat memproses evaluasi AI."}
                </p>
              </div>
            ) : evalData ? (
              <div className="space-y-6">
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
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 text-xs font-semibold text-[var(--fg2)] hover:text-[var(--fg)] transition-colors mb-4"
                >
                  Riwayat Percakapan ({historyEmails.length})
                  {showHistory ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showHistory && (
                  <div className="space-y-4">
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
          <button
            onClick={onReply}
            className="flex items-center gap-2 min-h-10 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] font-semibold text-xs hover:bg-[var(--bg)] active:scale-95 transition-all"
          >
            <Reply className="w-3.5 h-3.5" />
            Balas
          </button>
        </div>
      )}
    </div>
  );
};
