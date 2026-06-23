import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Gauge,
  Volume2,
  Mic,
  Ban,
  Smile,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Target,
  Info,
  ChevronDown,
  ChevronUp,
  PhoneOff,
  XCircle,
  TrendingUp,
  TrendingDown,
  Maximize2,
  AlertCircle,
} from "lucide-react";
import {
  aiClient,
  getErrorMessage,
  unwrapResponse,
  type TelefunMonitoringReview,
} from "../../../lib/api";
import { getScoreGrade } from "../utils/formatting";
import {
  validateAssessment,
  getCommunicationProfileFromAssessment,
} from "../../../lib/voiceAssessmentUtils";
import { VoiceRadarChart } from "../../telefun/components/VoiceRadarChart";
import { CommunicationProfileZoomModal } from "../../telefun/components/CommunicationProfileZoomModal";
import { VoiceMetricCards } from "../../telefun/components/VoiceMetricCards";
import { TelefunTranscript } from "../../telefun/components/TelefunTranscript";
import { parseTelefunTranscript } from "@trainers/types";

export function TelefunReviewPanel({ entryId }: { entryId: string }) {
  const [data, setData] = useState<TelefunMonitoringReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const va = useMemo(() => {
    return data?.voice_assessment
      ? validateAssessment(data.voice_assessment)
      : null;
  }, [data]);

  const transcriptEntries = useMemo(
    () => parseTelefunTranscript(data?.transcript),
    [data],
  );

  const communicationProfile = useMemo(() => {
    return getCommunicationProfileFromAssessment(va);
  }, [va]);

  const hasVoiceAssessment = va !== null;
  const hasScore = data ? typeof data.score === "number" : false;
  const recordingUrl = data?.recording_url ?? null;
  const hasStoredRecording = data
    ? !!data.recording_path || !!data.agent_recording_path
    : false;
  const canPlayRecording = !!recordingUrl;

  const fetchReview = async () => {
    setLoading(true);
    setError(null);
    setAudioError(false);
    try {
      const result = await unwrapResponse(
        await aiClient["monitoring/history/:module/:id/review"].$get({
          param: { module: "telefun", id: entryId },
        }),
      );
      setData(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal memuat data penilaian suara."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReview();
  }, [entryId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 text-module-telefun animate-spin" />
        <p className="text-xs text-muted-foreground font-medium">
          Memuat data penilaian suara...
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
          onClick={fetchReview}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-module-telefun/10 text-module-telefun text-[10px] font-bold hover:bg-module-telefun/20 transition-all"
        >
          <RefreshCw size={10} />
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <PhoneOff className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm font-bold text-muted-foreground">
          Data sesi tidak ditemukan
        </p>
      </div>
    );
  }

  // Score grade helper (0-10 scale for Telefun)
  const getTelefunGrade = (score: number) => {
    if (score >= 8)
      return {
        label: "Sangat Baik",
        color: "text-chart-green",
        bg: "bg-chart-green/10",
        border: "border-chart-green/20",
      };
    if (score >= 6)
      return {
        label: "Baik",
        color: "text-chart-blue",
        bg: "bg-chart-blue/10",
        border: "border-chart-blue/20",
      };
    if (score >= 4)
      return {
        label: "Cukup",
        color: "text-chart-amber",
        bg: "bg-chart-amber/10",
        border: "border-chart-amber/20",
      };
    return {
      label: "Perlu Coaching",
      color: "text-chart-red",
      bg: "bg-chart-red/10",
      border: "border-chart-red/20",
    };
  };

  const STATUS_COLORS: Record<string, string> = {
    good: "bg-muted text-muted-foreground border border-border", // using neutral for details
    needs_improvement: "bg-muted text-muted-foreground border border-border",
    poor: "bg-muted text-muted-foreground border border-border",
  };

  const STATUS_LABELS: Record<string, string> = {
    good: "Baik",
    needs_improvement: "Perlu Perbaikan",
    poor: "Kurang",
  };

  return (
    <div className="space-y-6">
      {/* ── Recording Player — Primary ──────────────────────── */}
      {canPlayRecording ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-module-telefun" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Rekaman Sesi
            </h3>
          </div>
          <div className="p-5 rounded-2xl bg-module-telefun/5 border border-module-telefun/10">
            {!audioError ? (
              <>
                <audio
                  controls
                  src={recordingUrl}
                  className="w-full h-10 rounded-lg"
                  onError={() => setAudioError(true)}
                >
                  Browser tidak mendukung pemutar audio.
                </audio>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-muted-foreground">
                    {data.scenario_title}
                  </span>
                  <a
                    href={recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-module-telefun hover:underline cursor-pointer"
                  >
                    Buka di tab baru
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <XCircle className="w-8 h-8 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="text-sm font-bold text-muted-foreground">
                    Rekaman tidak dapat diputar
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    File rekaman sudah dihapus atau tidak tersedia.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : hasStoredRecording ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-module-telefun" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Rekaman Sesi
            </h3>
          </div>
          <div className="p-5 rounded-2xl bg-muted border border-border flex flex-col items-center gap-3">
            <PhoneOff className="w-8 h-8 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-bold text-muted-foreground">
                Rekaman tidak dapat diputar
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Rekaman hanya dapat diputar oleh admin dan trainer.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-module-telefun" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Rekaman Sesi
            </h3>
          </div>
          <div className="p-5 rounded-2xl bg-muted border border-border flex flex-col items-center gap-3">
            <PhoneOff className="w-8 h-8 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-bold text-muted-foreground">
                Tidak ada rekaman
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Sesi ini tidak memiliki file rekaman audio.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Score + Duration — Always visible ──────────────── */}
      {hasScore ? (
        <>
          <div className="border-t border-border" />
          <div className="bg-module-telefun/5 rounded-[1.5rem] p-6 border border-module-telefun/10 flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-module-telefun rounded-2xl flex items-center justify-center shadow-lg shadow-module-telefun/20 shrink-0">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-module-telefun/60">
                  Skor Sesi
                </div>
                <div className="text-3xl font-black text-module-telefun">
                  {data.score}
                </div>
                <div
                  className={`text-[11px] font-bold ${getTelefunGrade(data.score!).color} mt-0.5`}
                >
                  {getTelefunGrade(data.score!).label}
                </div>
              </div>
            </div>
            {data.duration_seconds && (
              <div className="text-right">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Durasi
                </div>
                <div className="text-lg font-black">
                  {Math.floor(data.duration_seconds / 60)}m{" "}
                  {data.duration_seconds % 60}d
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="border-t border-border" />
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground/60 font-medium">
              Sesi belum memiliki skor.
            </p>
          </div>
        </>
      )}

      {/* ── Voice Assessment Metrics ────────────────────────── */}
      {hasVoiceAssessment && va ? (
        <>
          {/* Profil Komunikasi Card */}
          <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                  Profil Komunikasi
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">
                  Semakin sesuai dengan area target, semakin baik
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-chart-green">
                <Sparkles className="h-3 w-3" />
                <span>{va.overallScore}/10</span>
              </div>
            </div>

            {communicationProfile ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Perbesar diagram profil komunikasi"
                onClick={() => setZoomOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setZoomOpen(true);
                  }
                }}
                className="group relative cursor-pointer rounded-xl p-2 transition-colors hover:bg-slate-950/[0.02] dark:hover:bg-white/[0.02]"
              >
                <VoiceRadarChart profile={communicationProfile} compact />
                <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1.5 rounded-lg bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm dark:bg-white/20">
                    <Maximize2 className="h-3 w-3" />
                    Klik untuk memperbesar
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[240px] rounded-xl bg-slate-950/[0.02] dark:bg-white/[0.02]">
                <div className="text-center">
                  <AlertCircle className="mx-auto h-8 w-8 text-slate-300 dark:text-white/20 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-white/40">
                    Analisis komunikasi belum tersedia untuk sesi ini
                  </p>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 text-[10px] font-bold mt-3 text-slate-500 dark:text-white/45">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0 border border-dashed border-emerald-500" />
                Target QA
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500" />
                Hasil Anda
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-chart-green" />
                Semakin tinggi
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 text-chart-amber" />
                Semakin rendah
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-chart-blue" />
                Rentang ideal
              </div>
            </div>

            {/* Metric Status Summary */}
            {communicationProfile && (
              <div className="mt-4 flex flex-wrap gap-2">
                {communicationProfile.metrics.map((m) => (
                  <span
                    key={m.key}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${STATUS_COLORS[m.status] || ""}`}
                  >
                    {m.label}: {STATUS_LABELS[m.status]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border mt-6 pt-6" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-module-telefun" />
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Metrik Suara
              </h3>
            </div>
            {communicationProfile && (
              <VoiceMetricCards profile={communicationProfile} />
            )}
          </div>

          {/* Filler Words Examples */}
          {va.fillerWords.examples && va.fillerWords.examples.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-chart-amber" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Contoh Filler Words ({va.fillerWords.examples.length})
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {va.fillerWords.examples.map((ex, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-bold border border-amber-500/20"
                  >
                    &ldquo;{ex}&rdquo;
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Voice Assessment Strengths */}
          {va.strengths && va.strengths.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-module-telefun" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Kelebihan Penilaian Suara
                </h3>
              </div>
              <div className="space-y-2">
                {va.strengths.map((str, i) => (
                  <div
                    key={i}
                    className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-module-telefun/5 border border-module-telefun/10"
                  >
                    <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-module-telefun" />
                    {str}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Highlights */}
          {va.highlights && va.highlights.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Highlight
                </h3>
              </div>
              <div className="space-y-2">
                {va.highlights.map((hl, i) => (
                  <div
                    key={i}
                    className="flex gap-3 text-sm text-foreground/70 p-3 rounded-xl bg-primary/5 border border-primary/10"
                  >
                    <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                    {hl}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Voice Transcript (collapsible) */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-2 text-xs font-black text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors cursor-pointer"
            >
              {showTranscript ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              Transcript Percakapan
            </button>
            {showTranscript && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-4"
              >
                <TelefunTranscript
                  entries={transcriptEntries}
                  legacyText={va.transcript}
                />
              </motion.div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Gauge className="w-7 h-7 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            Penilaian suara AI belum tersedia
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Metrik suara (kecepatan, intonasi, artikulasi, dll.) akan muncul
            setelah AI selesai menganalisis rekaman.
          </p>
        </div>
      )}

      {/* ── Session-level Strengths & Weaknesses ───────────── */}
      {data.strengths && data.strengths.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-green" />
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Kekuatan
              </h3>
            </div>
            <div className="space-y-2">
              {data.strengths.map((str, i) => (
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
          {data.weaknesses && data.weaknesses.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Area Perbaikan
                </h3>
              </div>
              <div className="space-y-2">
                {data.weaknesses.map((weak, i) => (
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
          )}
        </div>
      )}

      {/* AI Summary */}
      {data.ai_summary && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Ringkasan AI
            </h3>
          </div>
          <div className="bg-foreground/[0.02] p-5 rounded-2xl border border-border/50">
            <p className="text-sm text-foreground/80 leading-relaxed italic">
              &ldquo;{data.ai_summary}&rdquo;
            </p>
          </div>
        </section>
      )}

      {/* Coaching Focus */}
      {data.coaching_focus && data.coaching_focus.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Fokus Coaching
            </h3>
          </div>
          <div className="bg-primary/10 border border-primary/20 p-5 rounded-[1.5rem]">
            <ul className="space-y-3">
              {data.coaching_focus.map((focus, i) => (
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
      )}

      {communicationProfile && (
        <CommunicationProfileZoomModal
          isOpen={zoomOpen}
          onClose={() => setZoomOpen(false)}
          profile={communicationProfile}
        />
      )}
    </div>
  );
}
