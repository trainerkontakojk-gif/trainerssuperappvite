import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Heart,
  Zap,
  AlertTriangle,
  Award,
  TrendingUp,
  MessageSquare,
  CheckCircle2,
  Target,
  Info,
  Loader2,
  RefreshCw,
  User,
  Bot,
} from "lucide-react";
import {
  aiClient,
  getErrorMessage,
  unwrapResponse,
  type KetikMonitoringReview,
} from "../../../lib/api";
import { getScoreGrade } from "../utils/formatting";

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full h-1.5 bg-foreground/5 rounded-full overflow-hidden mt-1">
      <motion.div
        className={`h-full rounded-full ${getScoreGrade(score).bar}`}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
      />
    </div>
  );
}

interface KetikReviewPanelProps {
  entryId: string;
  messages?: Array<{
    role?: string;
    sender?: string;
    text?: string;
    content?: string;
  }>;
}

export function KetikReviewPanel({ entryId, messages }: KetikReviewPanelProps) {
  const [data, setData] = useState<KetikMonitoringReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReview = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await unwrapResponse(
        await aiClient["monitoring/history/:module/:id/review"].$get({
          param: { module: "ketik", id: entryId },
        }),
      );
      setData(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal memuat data review."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReview();
  }, [entryId]);

  return (
    <div className="space-y-6">
      {/* ── Chat Transcript — Primary ─────────────────────────── */}
      {messages && messages.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-module-ketik" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Transcript Chat ({messages.length} pesan)
            </h3>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {messages.map((msg, i) => {
              const isUser =
                msg.sender === "agent" ||
                msg.role === "user" ||
                msg.role === "agent";
              return (
                <div
                  key={i}
                  className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl text-sm shadow-sm ${
                      isUser
                        ? "bg-primary/5 border border-primary/15 rounded-tr-none ml-12"
                        : "bg-muted/70 border border-border rounded-tl-none mr-12"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isUser ? (
                        <User className="w-3 h-3 text-primary" />
                      ) : (
                        <Bot className="w-3 h-3 text-module-ketik" />
                      )}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          isUser
                            ? "bg-primary/10 text-primary"
                            : "bg-module-ketik/10 text-module-ketik"
                        }`}
                      >
                        {isUser ? "Anda (Agen)" : "Konsumen (AI)"}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">
                      {msg.text || msg.content || "(empty)"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── AI Assessment — Secondary ──────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">
            Memuat data penilaian AI...
          </p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <p className="text-xs text-red-500 font-medium">{error}</p>
          <button
            onClick={fetchReview}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all"
          >
            <RefreshCw size={10} />
            Coba Lagi
          </button>
        </div>
      )}

      {!loading && !error && (!data || data.review_status !== "completed" || !data.review) && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            Review AI belum tersedia
          </p>
          <p className="text-xs text-muted-foreground/60">
            Status: {data?.review_status || "belum dimulai"}
          </p>
        </div>
      )}

      {!loading && !error && data && data.review_status === "completed" && data.review && (
        <>
          {/* Divider */}
          <div className="border-t border-border" />

          {/* Score Cards Grid */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Penilaian AI
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Empathy", score: data.scores?.empathy || 0, icon: Heart, description: "Kemampuan memahami & merespons perasaan konsumen" },
                { label: "Probing", score: data.scores?.probing || 0, icon: Zap, description: "Kemampuan menggali informasi & kebutuhan konsumen" },
                { label: "Tata Tulis", score: data.scores?.typo || 0, icon: AlertTriangle, description: "Kualitas penulisan: ejaan, tata bahasa, kerapian" },
                { label: "Compliance", score: data.scores?.compliance || 0, icon: Award, description: "Kepatuhan terhadap prosedur & etika komunikasi" },
              ].map((card) => {
                const grade = getScoreGrade(card.score);
                return (
                  <div
                    key={card.label}
                    className={`${grade.bg} ${grade.border} border p-4 rounded-2xl flex flex-col items-center text-center gap-2`}
                  >
                    <div className={`w-10 h-10 ${grade.bg} ${grade.color} rounded-xl flex items-center justify-center mb-1`}>
                      <card.icon className="w-5 h-5" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      {card.label}
                    </div>
                    <div className={`text-2xl font-black ${grade.color}`}>
                      {card.score}
                    </div>
                    <div className={`text-[9px] font-bold ${grade.color} uppercase tracking-wider`}>
                      {grade.label}
                    </div>
                    <ScoreBar score={card.score} />
                    <div className="text-[10px] text-foreground/75 leading-snug mt-1">
                      {card.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Score Banner */}
          <div className="bg-primary/5 rounded-[1.5rem] p-6 border border-primary/10 flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                  Skor Akhir
                </div>
                <div className={`text-3xl font-black ${getScoreGrade(data.scores?.final || 0).color}`}>
                  {data.scores?.final || 0}
                </div>
                <div className={`text-[11px] font-bold ${getScoreGrade(data.scores?.final || 0).color} mt-0.5`}>
                  {getScoreGrade(data.scores?.final || 0).label}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-right">
              <div className="text-sm text-foreground/80 font-medium max-w-[360px]">
                Performa dinilai dari: <strong>Empati</strong>, <strong>Probing</strong>, <strong>Tata Tulis</strong>, & <strong>Kepatuhan</strong>.
              </div>
            </div>
          </div>

          {/* Rubrik */}
          <details className="group cursor-pointer">
            <summary className="flex items-center gap-2 text-xs text-muted-foreground/80 hover:text-foreground/90 transition-colors list-none select-none">
              <Info className="w-3.5 h-3.5" />
              <span className="font-semibold">Rubrik Penilaian</span>
            </summary>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {[
                { range: "90-100", label: "Sangat Baik", color: "text-chart-green" },
                { range: "75-89", label: "Baik", color: "text-chart-blue" },
                { range: "60-74", label: "Cukup", color: "text-chart-amber" },
                { range: "<60", label: "Perlu Coaching", color: "text-rose-600" },
              ].map((r) => (
                <span key={r.label} className={`text-xs ${r.color} font-semibold`}>
                  {r.range}: {r.label}
                </span>
              ))}
            </div>
          </details>

          {/* AI Summary */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Ringkasan AI
              </h3>
            </div>
            <div className="bg-foreground/[0.02] p-5 rounded-2xl border border-border/50">
              <p className="text-sm text-foreground/80 leading-relaxed italic">
                &ldquo;{data.review.aiSummary}&rdquo;
              </p>
            </div>
          </section>

          {/* Strengths & Weaknesses */}
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-chart-green" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Kekuatan</h3>
              </div>
              <div className="space-y-2">
                {data.review.strengths.map((str, i) => (
                  <div key={i} className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-muted border border-border">
                    <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--chart-green)' }} />
                    {str}
                  </div>
                ))}
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Area Perbaikan</h3>
              </div>
              <div className="space-y-2">
                {data.review.weaknesses.map((weak, i) => (
                  <div key={i} className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                    <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" />
                    {weak}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Typo Table */}
          {data.typos && data.typos.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Typo Terdeteksi ({data.typos.length})
                </h3>
              </div>
              <div className="border border-border/50 rounded-xl overflow-hidden">
                <div className="max-h-40 overflow-y-auto p-1">
                  {data.typos.map((typo) => (
                    <div key={typo.id} className="flex items-center justify-between p-3 hover:bg-foreground/5 rounded-lg transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-xs line-through text-muted-foreground">{typo.originalWord}</span>
                        <span className="text-xs font-bold text-chart-green">&rarr; {typo.correctedWord}</span>
                      </div>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${typo.severity === "critical" ? "bg-rose-500 text-white" : typo.severity === "medium" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}>
                        {typo.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Coaching Focus */}
          {data.review.coachingFocus && data.review.coachingFocus.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Fokus Coaching</h3>
              </div>
              <div className="bg-primary/10 border border-primary/20 p-5 rounded-[1.5rem]">
                <ul className="space-y-3">
                  {data.review.coachingFocus.map((focus, i) => (
                    <li key={i} className="flex gap-4 items-start">
                      <div className="mt-1 w-5 h-5 rounded-lg bg-primary text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold">{i + 1}</div>
                      <p className="text-sm font-bold text-primary/80 leading-snug">{focus}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
