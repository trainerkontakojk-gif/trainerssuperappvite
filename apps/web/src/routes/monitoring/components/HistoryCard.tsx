import { motion } from "framer-motion";
import {
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Gauge,
  Volume2,
  Mic,
  Ban,
  AlertTriangle,
} from "lucide-react";
import {
  type UnifiedHistoryEntry,
  getModuleIcon,
  getModuleBadgeClasses,
  getScoreColor,
  getScoreGrade,
  formatDuration,
  formatDate,
} from "../utils/formatting";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

function MiniScoreBar({ score, label }: { score: number; label: string }) {
  const grade = getScoreGrade(score);
  return (
    <div className="flex flex-col items-center gap-1 min-w-[56px]">
      <span className={`text-[9px] font-black uppercase tracking-wider ${grade.color}`}>
        {score}
      </span>
      <div className="w-full h-1 bg-foreground/5 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${grade.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        />
      </div>
      <span className="text-[8px] text-muted-foreground/70 font-medium truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}

function KetikAssessment({ entry }: { entry: UnifiedHistoryEntry }) {
  if (!entry.scores || entry.scores.final === undefined) {
    return <AssessmentPlaceholder module="ketik" />;
  }
  return (
    <div className="flex items-start gap-2 pt-2 border-t border-border/40">
      <MiniScoreBar score={entry.scores.empathy || 0} label="Empati" />
      <MiniScoreBar score={entry.scores.probing || 0} label="Probing" />
      <MiniScoreBar score={entry.scores.typo || 0} label="Tulis" />
      <MiniScoreBar score={entry.scores.compliance || 0} label="Comply" />
    </div>
  );
}

function PdktAssessment({ entry }: { entry: UnifiedHistoryEntry }) {
  const ev = entry.pdkt_evaluation;
  if (!ev) {
    return <AssessmentPlaceholder module="pdkt" />;
  }
  return (
    <div className="pt-2 border-t border-border/40 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black text-module-pdkt">
          Skor: {ev.score}%
        </span>
        <span className="text-muted-foreground/30">|</span>
        {ev.typos_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600">
            <AlertTriangle size={9} />
            {ev.typos_count} typo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600">
            <CheckCircle2 size={9} />
            Tanpa typo
          </span>
        )}
        <span className="text-muted-foreground/30">|</span>
        {ev.clarity_issues_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600">
            <AlertCircle size={9} />
            {ev.clarity_issues_count} kejelasan
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600">
            <CheckCircle2 size={9} />
            Jelas
          </span>
        )}
      </div>
      {ev.feedback && (
        <p className="text-[10px] text-foreground/60 leading-relaxed line-clamp-2 italic">
          &ldquo;{ev.feedback}&rdquo;
        </p>
      )}
    </div>
  );
}

function TelefunAssessment({ entry }: { entry: UnifiedHistoryEntry }) {
  const ta = entry.telefun_assessment;
  if (!ta) {
    return <AssessmentPlaceholder module="telefun" />;
  }
  return (
    <div className="pt-2 border-t border-border/40">
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-foreground/[0.02]">
          <Gauge size={10} className="text-module-telefun" />
          <span className="text-[9px] font-black">{ta.speaking_rate_wpm}</span>
          <span className="text-[7px] text-muted-foreground/60">WPM</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-foreground/[0.02]">
          <Volume2 size={10} className="text-module-telefun" />
          <span className="text-[9px] font-black">{ta.intonation_score}/10</span>
          <span className="text-[7px] text-muted-foreground/60">Intonasi</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-foreground/[0.02]">
          <Mic size={10} className="text-module-telefun" />
          <span className="text-[9px] font-black">{ta.articulation_score}/10</span>
          <span className="text-[7px] text-muted-foreground/60">Artikulasi</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-foreground/[0.02]">
          <Ban size={10} className="text-amber-500" />
          <span className="text-[9px] font-black">{ta.filler_words_count}</span>
          <span className="text-[7px] text-muted-foreground/60">Filler</span>
        </div>
      </div>
      {ta.emotional_tone && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[8px] text-muted-foreground/50 font-bold uppercase tracking-wider">Emosi:</span>
          <span className="text-[9px] font-bold text-module-telefun capitalize">{ta.emotional_tone}</span>
        </div>
      )}
    </div>
  );
}

function AssessmentPlaceholder({ module: _module }: { module: string }) {
  return (
    <div className="pt-2 border-t border-border/40">
      <span className="text-[10px] text-muted-foreground/40 font-medium italic">
        Belum dinilai
      </span>
    </div>
  );
}

interface HistoryCardProps {
  entry: UnifiedHistoryEntry;
  onViewDetail: (entry: UnifiedHistoryEntry) => void;
}

export function HistoryCard({ entry, onViewDetail }: HistoryCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="group bg-card border border-border/60 rounded-2xl p-5 hover:shadow-lg hover:border-primary/20 transition-all duration-200 flex flex-col gap-3 cursor-pointer"
    >
      {/* Top row: module badge + status + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {getModuleIcon(entry.module)}
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${getModuleBadgeClasses(entry.module)}`}
          >
            {entry.module}
          </span>
          <ReviewStatusBadge status={entry.review_status} />
        </div>
        {entry.score !== null ? (
          <div className="flex items-center gap-1.5">
            <span className={`text-xl font-black ${getScoreColor(entry.score, entry.module === "telefun" ? 10 : 100)}`}>
              {entry.score}
            </span>
            <span className="text-[9px] text-muted-foreground/50 font-bold uppercase">
              /{entry.module === "pdkt" ? "%" : entry.module === "telefun" ? "10" : "100"}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground/30 font-bold">-</span>
        )}
      </div>

      {/* Scenario title */}
      <h3 className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
        {entry.scenario_title}
      </h3>

      {/* Meta row: user + date + duration */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate max-w-[140px]">{entry.user_email || "-"}</span>
        <span className="text-muted-foreground/30">|</span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatDuration(entry.duration_seconds)}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground/60">
        {formatDate(entry.created_at)}
      </div>

      {/* Module-specific AI assessment preview */}
      {entry.module === "ketik" && <KetikAssessment entry={entry} />}
      {entry.module === "pdkt" && <PdktAssessment entry={entry} />}
      {entry.module === "telefun" && <TelefunAssessment entry={entry} />}

      {/* Action button */}
      <button
        onClick={() => onViewDetail(entry)}
        className="mt-auto w-full px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-foreground/5 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all border border-border group-hover:border-primary flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Eye size={12} />
        Lihat Detail
      </button>
    </motion.div>
  );
}
