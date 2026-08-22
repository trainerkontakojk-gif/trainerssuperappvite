import React from "react";
import { motion } from "framer-motion";
import {
  X,
  Award,
  Zap,
  AlertTriangle,
  Target,
  MessageSquare,
  CheckCircle2,
  Play,
  Heart,
  TrendingUp,
  BrainCircuit,
  Sparkles,
  Info,
} from "lucide-react";
import type {
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import {
  KetikDimensionGuidanceList,
  KetikPriorityFixes,
} from "../../../components/KetikEducationSections";

function getScoreGrade(score: number) {
  if (score >= 90)
    return {
      label: "Sangat Baik",
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/25",
      bar: "bg-emerald-500",
    };
  if (score >= 75)
    return {
      label: "Baik",
      color: "text-sky-600",
      bg: "bg-sky-500/10",
      border: "border-sky-500/25",
      bar: "bg-sky-500",
    };
  if (score >= 60)
    return {
      label: "Cukup",
      color: "text-amber-600",
      bg: "bg-amber-500/10",
      border: "border-amber-500/25",
      bar: "bg-amber-500",
    };
  return {
    label: "Perlu Coaching",
    color: "text-rose-600",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    bar: "bg-rose-500",
  };
}

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

interface SessionReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: KetikSessionHistoryItem;
  review?: KetikSessionReview;
  typos?: KetikTypoFinding[];
  onReplay: () => void;
  onStartReview?: (sessionId: string) => Promise<void>;
  onReviewComplete?: () => void;
  progress?: {
    status:
      | "idle"
      | "starting"
      | "processing"
      | "delayed"
      | "loading-result"
      | "ready"
      | "failed";
    percent: number;
    etaSeconds: number;
  };
  canStartReview?: boolean;
  reviewAccessMessage?: string;
}

export function SessionReviewModal({
  isOpen,
  onClose,
  session,
  review,
  typos = [],
  onReplay,
  onStartReview,
  onReviewComplete,
  progress = { status: "idle", percent: 0, etaSeconds: 0 },
  canStartReview = true,
  reviewAccessMessage,
}: SessionReviewModalProps) {
  const isProcessing =
    session.reviewStatus === "processing" ||
    ["starting", "processing", "delayed", "loading-result"].includes(
      progress.status,
    );

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!onStartReview || isProcessing) return;
    try {
      await onStartReview(session.id);
    } catch (e) {
      console.error("Manual review trigger failed:", e);
    }
  };

  const getStatusText = () => {
    if (progress.status === "starting") return "Memulai analisis...";
    if (progress.status === "processing") {
      if (progress.percent < 30) return "Menganalisis pesan...";
      if (progress.percent < 60) return "Menilai performa...";
      return "Menyusun ringkasan...";
    }
    if (progress.status === "delayed") return "Sedikit lagi...";
    if (progress.status === "loading-result") return "Memuat hasil...";
    if (progress.status === "ready") return "Analisis selesai!";
    if (progress.status === "failed") return "Analisis gagal.";
    return "Menunggu...";
  };

  const scoreCards = [
    {
      label: "Empati & Komunikasi",
      score: session.empathyScore ?? 0,
      icon: Heart,
      description:
        "Kemampuan memahami & merespons perasaan konsumen dengan hangat",
      instruction: "Semakin tinggi semakin baik",
    },
    {
      label: "Probing",
      score: session.probingScore ?? 0,
      icon: Zap,
      description:
        "Kemampuan menggali informasi & kebutuhan konsumen secara mendalam",
      instruction: "Semakin tinggi semakin baik",
    },
    {
      label: "Tata Tulis",
      score: session.typoScore ?? 0,
      icon: AlertTriangle,
      description: "Kualitas penulisan: ejaan, tata bahasa, & kerapian pesan",
      instruction: "Semakin tinggi = semakin baik penulisan",
    },
    {
      label: "Kepatuhan",
      score: session.complianceScore ?? 0,
      icon: Award,
      description: "Kepatuhan terhadap prosedur, regulasi, & etika komunikasi",
      instruction: "Semakin tinggi semakin baik",
    },
  ];

  if (session.resolutionScore !== undefined) {
    scoreCards.splice(2, 0, {
      label: "Resolusi",
      score: session.resolutionScore,
      icon: Target,
      description:
        "Kejelasan solusi, langkah tindak lanjut, & kelengkapan jawaban",
      instruction: "Semakin tinggi semakin baik",
    });
  }

  const scoreRubrik = [
    { range: "90-100", label: "Sangat Baik", color: "text-emerald-600" },
    { range: "75-89", label: "Baik", color: "text-sky-600" },
    { range: "60-74", label: "Cukup", color: "text-amber-600" },
    { range: "<60", label: "Perlu Coaching", color: "text-rose-600" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl rounded-[2rem] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl shadow-black/10 bg-card border border-border/50"
      >
        <header className="px-5 py-4 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight line-clamp-1">
                Hasil Review AI
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Sesi: {session.scenarioTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-foreground/5 rounded-xl transition-all border border-transparent hover:border-foreground/10"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {review ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {scoreCards.map((card) => {
                  const grade = getScoreGrade(card.score);
                  return (
                    <div
                      key={card.label}
                      className={`${grade.bg} ${grade.border} border p-4 rounded-2xl flex flex-col items-center text-center gap-2`}
                    >
                      <div
                        className={`w-10 h-10 ${grade.bg} ${grade.color} rounded-xl flex items-center justify-center mb-1`}
                      >
                        <card.icon className="w-5 h-5" />
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        {card.label}
                      </div>
                      <div className={`text-2xl font-black ${grade.color}`}>
                        {card.score}
                      </div>
                      <div
                        className={`text-[9px] font-bold ${grade.color} uppercase tracking-wider`}
                      >
                        {grade.label}
                      </div>
                      <ScoreBar score={card.score} />
                      <div className="text-[10px] text-foreground/75 leading-snug mt-1 max-w-[130px]">
                        {card.description}
                      </div>
                      <div className="text-[8px] text-muted-foreground/70 uppercase tracking-wider">
                        {card.instruction}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-primary/5 rounded-[1.5rem] p-6 border border-primary/10 flex flex-col md:flex-row items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
                      Skor Akhir
                    </div>
                    <div
                      className={`text-3xl font-black ${getScoreGrade(session.finalScore || 0).color}`}
                    >
                      {session.finalScore || 0}
                    </div>
                    <div
                      className={`text-[11px] font-bold ${getScoreGrade(session.finalScore || 0).color} mt-0.5`}
                    >
                      {getScoreGrade(session.finalScore || 0).label}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-right">
                  <div className="text-sm text-foreground/80 font-medium max-w-[360px]">
                    Performa Anda dinilai dari:{" "}
                    <strong>Empati & Komunikasi</strong>,{" "}
                    <strong>Probing</strong>
                    {session.resolutionScore !== undefined ? (
                      <>
                        , <strong>Resolusi</strong>
                      </>
                    ) : null}
                    , <strong>Tata Tulis</strong>, & <strong>Kepatuhan</strong>.
                  </div>
                  <div className="flex items-center gap-2 justify-end text-[11px] text-muted-foreground/80">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Semakin tinggi skor, semakin baik performa</span>
                  </div>
                </div>
              </div>

              <details className="group cursor-pointer">
                <summary className="flex items-center gap-2 text-xs text-muted-foreground/80 hover:text-foreground/90 transition-colors list-none select-none">
                  <Info className="w-3.5 h-3.5" />
                  <span className="font-semibold">Rubrik Penilaian</span>
                </summary>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {scoreRubrik.map((r) => (
                    <span
                      key={r.label}
                      className={`text-xs ${r.color} font-semibold`}
                    >
                      {r.range}: {r.label}
                    </span>
                  ))}
                </div>
              </details>

              <div className="space-y-6">
                <KetikPriorityFixes education={review.education} />

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Ringkasan AI
                    </h3>
                  </div>
                  <div className="bg-foreground/[0.02] p-5 rounded-2xl border border-border/50">
                    <p className="text-sm text-foreground/80 leading-relaxed italic">
                      &ldquo;{review.aiSummary}&rdquo;
                    </p>
                  </div>
                </section>

                <div className="grid md:grid-cols-2 gap-6">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Kekuatan
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {review.strengths.map((str, i) => (
                        <div
                          key={i}
                          className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10"
                        >
                          <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {str}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Area Perbaikan
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {review.weaknesses.map((weak, i) => (
                        <div
                          key={i}
                          className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10"
                        >
                          <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-orange-500" />
                          {weak}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {typos.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Typo Terdeteksi ({typos.length})
                      </h3>
                    </div>
                    <div className="border border-border/50 rounded-xl overflow-hidden">
                      <div className="max-h-40 overflow-y-auto p-1">
                        {typos.map((typo) => (
                          <div
                            key={typo.id}
                            className="flex items-center justify-between p-3 hover:bg-foreground/5 rounded-lg transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs line-through text-muted-foreground">
                                {typo.originalWord}
                              </span>
                              <span className="text-xs font-bold text-emerald-500">
                                &rarr; {typo.correctedWord}
                              </span>
                            </div>
                            <span
                              className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                typo.severity === "critical"
                                  ? "bg-rose-500 text-white"
                                  : typo.severity === "medium"
                                    ? "bg-orange-500 text-white"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {typo.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                <KetikDimensionGuidanceList education={review.education} />

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Fokus Coaching
                    </h3>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 p-5 rounded-[1.5rem]">
                    <ul className="space-y-3">
                      {review.coachingFocus.map((focus, i) => (
                        <li key={i} className="flex gap-4 items-start">
                          <div className="mt-1 w-5 h-5 rounded-lg bg-primary text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                            {i + 1}
                          </div>
                          <p className="text-sm font-bold text-primary/80 leading-snug">
                            {focus}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                Analisis Performa Chat AI
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mb-8">
                {session.reviewStatus === "failed"
                  ? "Analisis sebelumnya gagal atau hasilnya tidak lengkap. Jalankan ulang analisis AI untuk membuat hasil review baru."
                  : "Gunakan AI untuk menilai empati, teknik probing, kepatuhan prosedur, dan tata tulis pada sesi chat Anda."}
              </p>

              <button
                onClick={handleAnalyze}
                disabled={isProcessing || !canStartReview}
                className="inline-flex h-14 w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    <span>{getStatusText()}</span>
                    <span className="opacity-60 tabular-nums">
                      {Math.round(progress.percent)}%
                    </span>
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-5 h-5" />
                    <span>
                      {!canStartReview
                        ? "Tidak Memiliki Akses"
                        : session.reviewStatus === "failed"
                          ? "Jalankan Ulang Analisis"
                          : "Mulai Analisis"}
                    </span>
                  </>
                )}
              </button>

              {isProcessing && (
                <div className="w-full max-w-sm mt-5 space-y-3">
                  <div className="h-2.5 bg-foreground/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.percent}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  {progress.etaSeconds > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center tabular-nums">
                      Estimasi: ~{progress.etaSeconds} detik lagi
                    </p>
                  )}
                  {progress.status === "delayed" && (
                    <p className="text-[10px] text-muted-foreground animate-pulse text-center">
                      Proses ini memakan waktu lebih lama dari biasanya. Harap
                      tunggu...
                    </p>
                  )}
                </div>
              )}

              {!canStartReview && reviewAccessMessage && (
                <p className="mt-4 text-[11px] text-orange-500 font-medium text-center">
                  {reviewAccessMessage}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="p-5 sm:p-6 border-t flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            onClick={onReplay}
            className="flex-1 h-14 bg-primary text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <Play className="w-4 h-4 fill-current" />
            Tonton Replay
          </button>
          <button
            onClick={onClose}
            className="h-14 px-8 border border-foreground/10 hover:bg-foreground/5 text-foreground font-black uppercase tracking-widest text-xs rounded-2xl transition-all"
          >
            Tutup
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
