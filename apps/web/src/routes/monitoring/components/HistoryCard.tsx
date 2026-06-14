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

function KetikAssessment({ entry }: { entry: UnifiedHistoryEntry }) {
  if (!entry.scores || entry.scores.final === undefined) {
    return <AssessmentPlaceholder module="ketik" />;
  }
  const scoresList = [
    { label: "Empati", val: entry.scores.empathy },
    { label: "Probing", val: entry.scores.probing },
    { label: "Tulis", val: entry.scores.typo },
    { label: "Comply", val: entry.scores.compliance },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground/80">
      {scoresList.map(({ label, val }, i) => (
        <span key={label} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/30 mr-1.5 font-normal">·</span>}
          <span>{label}</span>
          <span className={`font-semibold ${getScoreColor(val ?? 0)}`}>{val ?? 0}</span>
        </span>
      ))}
    </div>
  );
}

function PdktAssessment({ entry }: { entry: UnifiedHistoryEntry }) {
  const ev = entry.pdkt_evaluation;
  if (!ev) {
    return <AssessmentPlaceholder module="pdkt" />;
  }
  return (
    <div className="pt-2.5 border-t border-border/40 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground/80">
        <span className="font-semibold text-module-pdkt">
          Skor: {ev.score}%
        </span>
        <span className="text-muted-foreground/30">·</span>
        {ev.typos_count > 0 ? (
          <span className="inline-flex items-center font-medium" style={{ color: 'var(--chart-amber)' }}>
            {ev.typos_count} typo
          </span>
        ) : (
          <span className="inline-flex items-center font-medium" style={{ color: 'var(--chart-green)' }}>
            Tanpa typo
          </span>
        )}
        <span className="text-muted-foreground/30">·</span>
        {ev.clarity_issues_count > 0 ? (
          <span className="inline-flex items-center font-medium" style={{ color: 'var(--chart-amber)' }}>
            {ev.clarity_issues_count} kejelasan
          </span>
        ) : (
          <span className="inline-flex items-center font-medium" style={{ color: 'var(--chart-green)' }}>
            Jelas
          </span>
        )}
      </div>
      {ev.feedback && (
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-1 italic">
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
    <div className="pt-2.5 border-t border-border/40 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground/80">
        <span className="flex items-center gap-0.5">
          <span>WPM</span>:
          <span className="font-semibold text-foreground">{ta.speaking_rate_wpm}</span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="flex items-center gap-0.5">
          <span>Intonasi</span>:
          <span className="font-semibold text-foreground">{ta.intonation_score}/10</span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="flex items-center gap-0.5">
          <span>Artikulasi</span>:
          <span className="font-semibold text-foreground">{ta.articulation_score}/10</span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="flex items-center gap-0.5">
          <span>Filler</span>:
          <span className="font-semibold" style={{ color: ta.filler_words_count > 3 ? 'var(--chart-amber)' : 'inherit' }}>{ta.filler_words_count}</span>
        </span>
      </div>
      {ta.emotional_tone && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <span className="font-medium uppercase tracking-wider text-[9px]">Emosi:</span>
          <span className="font-semibold text-module-telefun capitalize">{ta.emotional_tone}</span>
        </div>
      )}
    </div>
  );
}

function AssessmentPlaceholder({ module: _module }: { module: string }) {
  return (
    <div className="pt-2.5 border-t border-border/40">
      <span className="text-[11px] text-muted-foreground/40 font-medium italic">
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
      onClick={() => onViewDetail(entry)}
      className="group bg-card border border-border/50 rounded-xl p-5 hover:shadow-md hover:border-primary/20 hover:bg-foreground/[0.01] transition-all duration-200 flex flex-col gap-3 cursor-pointer"
    >
      {/* Top row: module badge + status + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {getModuleIcon(entry.module)}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.15em] ${getModuleBadgeClasses(entry.module)}`}
          >
            {entry.module}
          </span>
          <ReviewStatusBadge status={entry.review_status} />
        </div>
        {entry.score !== null ? (
          <div className="flex items-baseline gap-0.5">
            <span className={`text-lg font-bold ${getScoreColor(entry.score, entry.module === "telefun" ? 10 : 100)}`}>
              {entry.score}
            </span>
            <span className="text-[9px] text-muted-foreground/40 font-medium">
              /{entry.module === "pdkt" ? "%" : entry.module === "telefun" ? "10" : "100"}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/30 font-semibold">-</span>
        )}
      </div>

      {/* Scenario title */}
      <h3 className="text-sm font-semibold text-foreground line-clamp-1 leading-snug group-hover:text-primary transition-colors">
        {entry.scenario_title}
      </h3>

      {/* Meta row: user + date + duration */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
        <span className="truncate max-w-[140px] font-medium text-muted-foreground/80">{entry.user_email || "-"}</span>
        <div className="flex items-center gap-2 text-muted-foreground/60">
          <span className="flex items-center gap-1 text-[10px]">
            <Clock size={10} />
            {formatDuration(entry.duration_seconds)}
          </span>
          <span>·</span>
          <span className="text-[10px]">
            {formatDate(entry.created_at)}
          </span>
        </div>
      </div>

      {/* Module-specific AI assessment preview */}
      {entry.module === "ketik" && <KetikAssessment entry={entry} />}
      {entry.module === "pdkt" && <PdktAssessment entry={entry} />}
      {entry.module === "telefun" && <TelefunAssessment entry={entry} />}

      {/* Action button (visual only now) */}
      <div
        className="mt-2 w-full px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-foreground/[0.03] hover:bg-primary hover:text-primary-foreground text-muted-foreground border border-border/40 transition-all flex items-center justify-center gap-1"
      >
        <Eye size={12} />
        Lihat Detail
      </div>
    </motion.div>
  );
}
