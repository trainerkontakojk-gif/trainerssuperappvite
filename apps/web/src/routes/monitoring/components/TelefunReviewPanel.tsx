import { useState, useEffect } from "react";
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
} from "lucide-react";
import { getApi } from "../../../hooks/useApi";
import { getScoreGrade } from "../utils/formatting";

interface TelefunReviewData {
  module: string;
  review_status: string;
  score: number | null;
  recording_path: string | null;
  scenario_title: string | null;
  duration_seconds: number | null;
  voice_assessment: {
    overallScore: number;
    speakingRate: { score: number; verdict: string; feedback: string; wordsPerMinute: number };
    intonation: { score: number; verdict: string; feedback: string };
    articulation: { score: number; verdict: string; feedback: string };
    fillerWords: { score: number; verdict: string; feedback: string; count: number; examples: string[] };
    emotionalTone: { score: number; verdict: string; feedback: string; dominant: string };
    transcript: string;
    highlights: string[];
    strengths: string[];
  } | null;
  ai_summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  coaching_focus: string[] | null;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  score,
  verdict,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sublabel: string;
  score: number;
  verdict: string;
}) {
  const grade = getScoreGrade(score);
  return (
    <div className={`${grade.bg} ${grade.border} border p-4 rounded-2xl flex flex-col items-center text-center gap-2`}>
      <div className={`w-10 h-10 ${grade.bg} ${grade.color} rounded-xl flex items-center justify-center mb-1`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-black ${grade.color}`}>
        {value}
      </div>
      <div className="text-[10px] text-foreground/60 font-medium">
        {sublabel}
      </div>
      <div className={`text-[9px] font-bold ${grade.color} uppercase tracking-wider`}>
        {verdict}
      </div>
    </div>
  );
}

export function TelefunReviewPanel({ entryId }: { entryId: string }) {
  const [data, setData] = useState<TelefunReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const fetchReview = async () => {
    setLoading(true);
    setError(null);
    setAudioError(false);
    try {
      const result = await getApi<TelefunReviewData>(
        `/ai/monitoring/history/telefun/${entryId}/review`,
      );
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data penilaian suara.");
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

  const hasScore = typeof data.score === "number";
  const hasVoiceAssessment = data.voice_assessment !== null;
  const hasRecording = !!data.recording_path;
  const va = data.voice_assessment;

  // Score grade helper (0-10 scale for Telefun)
  const getTelefunGrade = (score: number) => {
    if (score >= 8) return { label: "Sangat Baik", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
    if (score >= 6) return { label: "Baik", color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" };
    if (score >= 4) return { label: "Cukup", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
    return { label: "Perlu Coaching", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" };
  };

  return (
    <div className="space-y-6">
      {/* ── Recording Player — Primary ──────────────────────── */}
      {hasRecording ? (
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
                  src={data.recording_path!}
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
                    href={data.recording_path!}
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
                <div className={`text-[11px] font-bold ${getTelefunGrade(data.score!).color} mt-0.5`}>
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
                  {Math.floor(data.duration_seconds / 60)}m {data.duration_seconds % 60}d
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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-module-telefun" />
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Metrik Suara
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard
                icon={Gauge}
                label="Kecepatan"
                value={`${va.speakingRate.wordsPerMinute} WPM`}
                sublabel="Words Per Minute"
                score={va.speakingRate.score}
                verdict={va.speakingRate.verdict}
              />
              <MetricCard
                icon={Volume2}
                label="Intonasi"
                value={`${va.intonation.score}/10`}
                sublabel="Naik turun nada"
                score={va.intonation.score * 10}
                verdict={va.intonation.verdict}
              />
              <MetricCard
                icon={Mic}
                label="Artikulasi"
                value={`${va.articulation.score}/10`}
                sublabel="Kejelasan bicara"
                score={va.articulation.score * 10}
                verdict={va.articulation.verdict}
              />
              <MetricCard
                icon={Ban}
                label="Filler Words"
                value={`${va.fillerWords.count}`}
                sublabel="Kata pengisi"
                score={va.fillerWords.score}
                verdict={va.fillerWords.verdict}
              />
              <MetricCard
                icon={Smile}
                label="Emosi"
                value={va.emotionalTone.dominant}
                sublabel="Nada emosional"
                score={va.emotionalTone.score * 10}
                verdict={va.emotionalTone.verdict}
              />
            </div>

            {/* Metric Feedback Accordion */}
            <details className="group cursor-pointer">
              <summary className="flex items-center gap-2 text-xs text-muted-foreground/80 hover:text-foreground/90 transition-colors list-none select-none">
                <Info className="w-3.5 h-3.5" />
                <span className="font-semibold">Detail Feedback per Metrik</span>
              </summary>
              <div className="mt-3 space-y-2">
                {[
                  { label: "Kecepatan Bicara", feedback: va.speakingRate.feedback },
                  { label: "Intonasi", feedback: va.intonation.feedback },
                  { label: "Artikulasi", feedback: va.articulation.feedback },
                  { label: "Filler Words", feedback: va.fillerWords.feedback },
                  { label: "Emosi", feedback: va.emotionalTone.feedback },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-xl bg-foreground/[0.02] border border-border/50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                      {item.label}
                    </div>
                    <p className="text-xs text-foreground/70 leading-relaxed">{item.feedback}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Filler Words Examples */}
          {va.fillerWords.examples && va.fillerWords.examples.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-amber-500" />
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
          {va.transcript && (
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="flex items-center gap-2 text-xs font-black text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors cursor-pointer"
              >
                {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Transcript Percakapan
              </button>
              {showTranscript && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-4"
                >
                  <div className="p-4 rounded-xl bg-muted border border-border text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {va.transcript}
                  </div>
                </motion.div>
              )}
            </div>
          )}
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
            Metrik suara (kecepatan, intonasi, artikulasi, dll.) akan muncul setelah AI selesai menganalisis rekaman.
          </p>
        </div>
      )}

      {/* ── Session-level Strengths & Weaknesses ───────────── */}
      {data.strengths && data.strengths.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
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
    </div>
  );
}
