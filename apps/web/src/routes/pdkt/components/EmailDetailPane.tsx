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
} from "lucide-react";
import type { PdktMailboxItem } from "@trainers/types";
import ScenarioImage from "./ScenarioImage";
import { getImageDataUri } from "../utils/detectMimeType";

interface EmailDetailPaneProps {
  item: PdktMailboxItem;
  onReply: () => void;
  onDelete: () => void;
  isComposerOpen?: boolean;
  evaluation: any | null;
  evaluationStatus: "pending" | "processing" | "completed" | "failed" | null;
  evaluationError: string | null;
  onRetryEval: () => void;
}

interface EvaluationData {
  score: number;
  feedback: string;
  typos: string[];
  clarityIssues: string[];
  contentGaps: string[];
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
}) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const evalStatus = evaluationStatus;
  const evalData = evaluation;
  const evalError = evaluationError;
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
    attachmentWarning: undefined,
  };
  const inboundBody = inboundEmail.body || "";
  const inboundAttachments = Array.isArray(inboundEmail.attachments)
    ? inboundEmail.attachments
    : [];
  const attachmentWarning = inboundEmail.attachmentWarning;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white relative h-full">
      {/* Zoomed Image Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer transition-opacity"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt="Zoomed Attachment"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain ring-1 ring-white/10"
          />
          <button className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors">
            <X className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Pane Header */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Detail Email
            </span>
            {item.status === "replied" && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="font-semibold text-xs text-emerald-500">
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
              className="p-2 text-sky-600 hover:bg-sky-50 rounded-xl transition-all"
              title="Balas"
            >
              <Reply className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
            title="Hapus"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Subject */}
        <h2
          className={`text-lg md:text-xl leading-snug ${item.subject ? "font-semibold text-gray-900" : "font-medium text-gray-400 italic"}`}
        >
          {item.subject || "(Tanpa Subjek)"}
        </h2>

        {/* Sender Info */}
        <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
          <div className="shrink-0 w-9 h-9 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-xs font-semibold text-sky-600">
            {getInitials(item.sender_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {item.sender_name}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {item.sender_email}
                </div>
              </div>
              <div className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                {formatEmailDate(item.created_at)}
              </div>
            </div>
            <div className="text-[10px] text-gray-400">
              Kepada:{" "}
              <span className="text-gray-700 font-medium">
                konsumen@ojk.go.id
              </span>
            </div>
          </div>
        </div>

        {/* Email Body */}
        <div className="text-[13px] text-gray-800 leading-relaxed space-y-3">
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
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                  onClick={() => setZoomedImage(getImageDataUri(base64))}
                  className="cursor-pointer hover:opacity-95 transition-opacity"
                />
              ))}
            </div>
          </div>
        )}

        {/* Attachment Warning */}
        {!inboundAttachments.length && attachmentWarning && (
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 flex items-start gap-2.5 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-[9px] uppercase tracking-wider block mb-0.5 text-amber-900">
                Peringatan Lampiran AI
              </span>
              <span className="font-medium text-gray-700 leading-relaxed text-[11px]">{attachmentWarning}</span>
            </div>
          </div>
        )}

        {/* Evaluation Results (if replied) */}
        {item.status === "replied" && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            {isEvaluationProcessing ? (
              <div className="flex flex-col items-center justify-center p-8 bg-sky-50/30 rounded-xl border border-sky-100/50">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
                <p className="text-xs font-bold text-sky-600 uppercase tracking-widest animate-pulse">
                  Menganalisis Jawaban...
                </p>
              </div>
            ) : isEvaluationFailed ? (
              <div className="p-6 rounded-xl border border-red-200 bg-red-50/50">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                      Evaluasi Gagal
                    </h3>
                  </div>
                  <button
                    onClick={handleRetryEval}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-[10px] font-medium hover:bg-red-200 transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Coba Lagi
                  </button>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  {evalError || "Terjadi gangguan saat memproses evaluasi AI."}
                </p>
              </div>
            ) : evalData ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Hasil Evaluasi
                    </h3>
                    {item.time_taken && (
                      <p className="text-[10px] text-gray-500 font-bold mt-1">
                        Selesai dikerjakan dalam{" "}
                        <span className="text-gray-900">
                          {formatTime(item.time_taken)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-50 border border-sky-100">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Skor
                    </span>
                    <span className="text-2xl font-black text-sky-600">
                      {evalData.score}%
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-xl border border-red-100 bg-red-50/30">
                    <h4 className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-3">
                      Typo / Salah Ketik
                    </h4>
                    {evalData.typos && evalData.typos.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.typos.map((typo: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-700 leading-relaxed font-medium"
                          >
                            {typo}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500 italic font-medium">
                        Tidak ditemukan typo.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/30">
                    <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-3">
                      Kejelasan Kalimat
                    </h4>
                    {evalData.clarityIssues &&
                    evalData.clarityIssues.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.clarityIssues.map(
                          (issue: string, idx: number) => (
                            <li
                              key={idx}
                              className="text-xs text-gray-700 leading-relaxed font-medium"
                            >
                              {issue}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500 italic font-medium">
                        Kalimat sudah jelas.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-sky-100 bg-sky-50/30">
                    <h4 className="text-[10px] font-bold text-sky-700 uppercase tracking-wide mb-3">
                      Relevansi Solusi
                    </h4>
                    {evalData.contentGaps && evalData.contentGaps.length > 0 ? (
                      <ul className="space-y-1.5 list-disc list-inside">
                        {evalData.contentGaps.map(
                          (gap: string, idx: number) => (
                            <li
                              key={idx}
                              className="text-xs text-gray-700 leading-relaxed font-medium"
                            >
                              {gap}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500 italic font-medium">
                        Jawaban relevan.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/30">
                    <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-3">
                      Masukan
                    </h4>
                    <p className="text-xs text-gray-600 font-medium leading-relaxed italic">
                      &quot;{evalData.feedback}&quot;
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Thread History */}
            {historyEmails.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:text-gray-900 transition-colors mb-4"
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
                        className="pl-6 border-l-2 border-gray-200 py-2"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-800 uppercase tracking-wider">
                            {email.isAgent ? "Balasan Anda" : email.from}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold">
                            {formatEmailDate(email.timestamp.toString())}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 leading-relaxed space-y-2 font-medium">
                          {email.body
                            .split(/\n\s*\n/)
                            .map((paragraph: string, pIdx: number) => (
                              <p key={pIdx} className="whitespace-pre-wrap">
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
        <div className="px-6 py-3 border-t border-gray-200 shrink-0 bg-gray-50/50">
          <button
            onClick={onReply}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white font-bold text-xs hover:bg-sky-700 active:scale-95 transition-all shadow-sm"
          >
            <Reply className="w-3.5 h-3.5" />
            Balas
          </button>
        </div>
      )}
    </div>
  );
};
