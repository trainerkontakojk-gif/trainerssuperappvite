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
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Progress } from "../../../components/ui/progress";
import { Separator } from "../../../components/ui/separator";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";

function getScoreGrade(score: number) {
  if (score >= 90)
    return {
      label: "Sangat Baik",
      color: "text-chart-green",
      bg: "bg-chart-green/10",
      border: "border-chart-green/25",
      bar: "bg-chart-green",
    };
  if (score >= 75)
    return {
      label: "Baik",
      color: "text-chart-blue",
      bg: "bg-chart-blue/10",
      border: "border-chart-blue/25",
      bar: "bg-chart-blue",
    };
  if (score >= 60)
    return {
      label: "Cukup",
      color: "text-chart-amber",
      bg: "bg-chart-amber/10",
      border: "border-chart-amber/25",
      bar: "bg-chart-amber",
    };
  return {
    label: "Perlu Coaching",
    color: "text-chart-red",
    bg: "bg-chart-red/10",
    border: "border-chart-red/25",
    bar: "bg-chart-red",
  };
}

function ScoreBar({ score }: { score: number }) {
  return (
    <Progress
      value={score}
      aria-label={`Skor ${score} dari 100`}
      className={`mt-1 h-1.5 ${getScoreGrade(score).bar}`}
    />
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-module="ketik"
        className="!w-[calc(100vw-2rem)] !max-w-4xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-module-ketik/10">
                <BrainCircuit className="size-5 text-module-ketik" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="line-clamp-1 text-lg tracking-tight sm:text-xl">
                  Hasil Review AI
                </DialogTitle>
                <DialogDescription className="mt-1 line-clamp-1">
                  Sesi: {session.scenarioTitle}
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={onClose}
              aria-label="Tutup hasil review"
            >
              <X data-icon="inline" />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {(() => {
            const peserta = formatSimulationSubjectLabel(
              session.simulationSubject,
              {
                includeParticipantDetails: true,
                unknownLabel: "Peserta tidak tercatat — sesi lama",
              },
            );
            return (
              <div
                className="grid grid-cols-1 gap-2 rounded-xl border p-3 text-sm sm:grid-cols-3"
                aria-label="Atribusi simulasi"
              >
                <div>
                  <span className="text-xs text-muted-foreground">
                    Peserta:{" "}
                  </span>
                  {peserta}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    Konsumen:{" "}
                  </span>
                  {session.consumerName}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    Skenario:{" "}
                  </span>
                  {session.scenarioTitle}
                </div>
              </div>
            );
          })()}
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

              <Button
                type="button"
                size="lg"
                onClick={handleAnalyze}
                disabled={isProcessing || !canStartReview}
                className="h-14 w-full max-w-sm rounded-2xl px-8 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
              >
                {isProcessing ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    <span>{getStatusText()}</span>
                    <span className="opacity-60 tabular-nums">
                      {Math.round(progress.percent)}%
                    </span>
                  </>
                ) : (
                  <>
                    <BrainCircuit data-icon="inline-start" />
                    <span>
                      {!canStartReview
                        ? "Tidak Memiliki Akses"
                        : session.reviewStatus === "failed"
                          ? "Jalankan Ulang Analisis"
                          : "Mulai Analisis"}
                    </span>
                  </>
                )}
              </Button>

              {isProcessing && (
                <div className="mt-5 flex w-full max-w-sm flex-col gap-3">
                  <Progress
                    value={progress.percent}
                    aria-label={`Progress analisis ${Math.round(progress.percent)}%`}
                    className="h-2.5"
                  />
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
                <p className="mt-4 text-center text-[11px] font-medium text-chart-orange">
                  {reviewAccessMessage}
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />
        <DialogFooter className="!mx-0 !mb-0 shrink-0 flex-col gap-3 rounded-none border-0 bg-card p-5 sm:flex-row sm:p-6">
          <Button
            type="button"
            size="lg"
            onClick={onReplay}
            className="h-14 flex-1 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play data-icon="inline-start" fill="currentColor" />
            Tonton Replay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="h-14 rounded-2xl px-8 text-xs font-black uppercase tracking-widest"
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
