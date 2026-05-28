import { useState, useEffect } from "react";
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  Mail,
  Inbox,
  Send,
} from "lucide-react";
import { getApi } from "../../../hooks/useApi";

interface PdktReviewData {
  module: string;
  review_status: string;
  evaluation: {
    score: number;
    feedback: string;
    typos: string[];
    clarityIssues: string[];
    contentGaps: string[];
  } | null;
  evaluation_error: string | null;
  time_taken: number | null;
  emails: Array<{
    type?: string;
    subject?: string;
    body?: string;
    content?: string;
    timestamp?: string;
  }>;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} detik`;
  return `${mins} menit ${secs} detik`;
}

export function PdktEvaluationPanel({ entryId }: { entryId: string }) {
  const [data, setData] = useState<PdktReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluation = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getApi<PdktReviewData>(
        `/ai/monitoring/history/pdkt/${entryId}/review`,
      );
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data evaluasi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluation();
  }, [entryId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 text-module-pdkt animate-spin" />
        <p className="text-xs text-muted-foreground font-medium">
          Memuat data evaluasi AI...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500" />
        <p className="text-xs text-red-500 font-medium">{error}</p>
        <button
          onClick={fetchEvaluation}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-module-pdkt/10 text-module-pdkt text-[10px] font-bold hover:bg-module-pdkt/20 transition-all"
        >
          <RefreshCw size={10} />
          Coba Lagi
        </button>
      </div>
    );
  }

  const emails = data?.emails || [];
  const hasEmails = emails.length > 0;
  const evaluation = data?.evaluation;

  return (
    <div className="space-y-6">
      {/* ── Email Thread — Primary ─────────────────────────── */}
      {hasEmails && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-module-pdkt" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Thread Email ({emails.length} pesan)
            </h3>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {emails.map((email: any, i: number) => {
              const isResponse = email.type !== "received";
              return (
                <div
                  key={i}
                  className={`p-4 rounded-xl text-sm ${
                    isResponse
                      ? "bg-primary/5 ml-8 border border-primary/10"
                      : "bg-muted mr-8 border border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {isResponse ? (
                      <Send size={10} className="text-primary" />
                    ) : (
                      <Inbox size={10} className="text-muted-foreground" />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
                      {isResponse ? "BALASAN USER" : "EMAIL MASUK"}
                    </span>
                  </div>
                  {email.subject && (
                    <div className="text-xs font-bold text-foreground mb-2">
                      {email.subject}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed text-foreground/80">
                    {email.body || email.content || "(empty)"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── AI Evaluation — Secondary ───────────────────────── */}
      {evaluation && data?.review_status === "completed" ? (
        <>
          <div className="border-t border-border" />

          {/* Score Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Hasil Evaluasi
              </h3>
              {data?.time_taken && (
                <p className="text-[10px] text-muted-foreground font-bold mt-1">
                  Selesai dikerjakan dalam{" "}
                  <span className="text-foreground">{formatTime(data.time_taken)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-module-pdkt/10 border border-module-pdkt/20">
              <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                Skor
              </span>
              <span className="text-2xl font-black text-module-pdkt">
                {evaluation.score}%
              </span>
            </div>
          </div>

          {/* 4-Card Evaluation Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-xl border border-red-100 bg-red-50/30">
              <h4 className="text-[10px] font-black text-red-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Typo / Salah Ketik
              </h4>
              {evaluation.typos && evaluation.typos.length > 0 ? (
                <ul className="space-y-1.5 list-disc list-inside">
                  {evaluation.typos.map((typo, idx) => (
                    <li key={idx} className="text-xs text-foreground/70 leading-relaxed font-medium">
                      {typo}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic font-medium flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  Tidak ditemukan typo.
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/30">
              <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MessageSquare size={12} />
                Kejelasan Kalimat
              </h4>
              {evaluation.clarityIssues && evaluation.clarityIssues.length > 0 ? (
                <ul className="space-y-1.5 list-disc list-inside">
                  {evaluation.clarityIssues.map((issue, idx) => (
                    <li key={idx} className="text-xs text-foreground/70 leading-relaxed font-medium">
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic font-medium flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  Kalimat sudah jelas.
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-sky-100 bg-sky-50/30">
              <h4 className="text-[10px] font-black text-sky-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <BookOpen size={12} />
                Relevansi Solusi
              </h4>
              {evaluation.contentGaps && evaluation.contentGaps.length > 0 ? (
                <ul className="space-y-1.5 list-disc list-inside">
                  {evaluation.contentGaps.map((gap, idx) => (
                    <li key={idx} className="text-xs text-foreground/70 leading-relaxed font-medium">
                      {gap}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic font-medium flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  Jawaban relevan.
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/30">
              <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MessageSquare size={12} />
                Masukan
              </h4>
              <p className="text-xs text-foreground/70 font-medium leading-relaxed italic">
                &quot;{evaluation.feedback}&quot;
              </p>
            </div>
          </div>
        </>
      ) : (
        !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-bold text-muted-foreground">
              Evaluasi AI belum tersedia
            </p>
            <p className="text-xs text-muted-foreground/60">
              Status: {data?.review_status || "belum dimulai"}
            </p>
            {data?.evaluation_error && (
              <p className="text-xs text-red-500 max-w-xs">
                {data.evaluation_error}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
